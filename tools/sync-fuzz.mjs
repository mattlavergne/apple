// Proves cloud sync can't lose progress. Runs the real sync client (js/sync.js)
// against the real server (src/apple-api.js in mattlavergne/landing-page) on a
// real SQLite database, with several devices playing at random while requests
// fail before or after reaching the server, apps restart, devices go offline,
// clocks disagree and an old game version writes stale saves. After every step
// it checks that no device's save and no cloud save ever went backwards, and at
// the end that every device and the cloud hold the same, complete progress.
// It also injects broken merges and broken clients to check the guards.
//
//   node tools/sync-fuzz.mjs [seeds] [path/to/apple-api.js]
// (needs Node 22+, for node:sqlite; the server path defaults to a landing-page
// checkout next to this repo)
import { DatabaseSync } from 'node:sqlite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CloudSync, makeApi, mergeSaves, regressions, safeMerge, stableStringify, SAVE_FIELDS } from '../js/sync.js';

const SEEDS = +(process.argv[2] || 200);
const root = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(process.argv[3] || resolve(root, '../../landing-page/src/apple-api.js'));
const serverUrl = pathToFileURL(serverPath).href;

let failures = 0;
const fail = msg => { failures++; if (failures <= 15) console.log('FAIL ', msg); };
const check = (ok, msg) => { if (!ok) fail(msg); };

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// D1's API on top of node:sqlite, with small random delays so concurrent
// requests interleave the way they can on Cloudflare.
function d1(db, jitter) {
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => { await sleep(jitter()); return db.prepare(sql).get(...args) ?? null; },
    run: async () => { await sleep(jitter()); return { success: true, meta: { changes: Number(db.prepare(sql).run(...args).changes) } }; },
    all: async () => { await sleep(jitter()); return { results: db.prepare(sql).all(...args) }; },
    exec: () => db.prepare(sql).run(...args),
  });
  return {
    prepare: sql => stmt(sql),
    batch: async list => {
      await sleep(jitter());
      db.exec('BEGIN');
      try { const out = list.map(s => s.exec()); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}

const sqlite = new DatabaseSync(':memory:');
const { handleAppleApi, regressions: serverRegressions, cleanupAppleSaves } = await import(serverUrl);
let R = rng(1);
const env = { APPLE_DB: d1(sqlite, () => (R() < 0.5 ? 0 : Math.floor(R() * 3))) };
const cloudRow = code => {
  try {
    const row = sqlite.prepare('SELECT data, rev FROM apple_saves WHERE code = ?').get(code);
    return row ? { data: JSON.parse(row.data), rev: row.rev } : null;
  } catch { return null; } // table not created yet
};

// ------------------------------------------------------------------ a device
// Mirrors what js/main.js does around CloudSync: progress lives in `save`, is
// written to `stored` right away (as the game does within 0.4s), and merges
// replace it.
const LEVELS = 25, UPGRADES = ['dash', 'thorns', 'rot', 'decoy'], SKINS = ['red', 'gold', 'green', 'ghost', 'candy'];
let truth; // the most progress ever reached on any device: nothing may end below it
let dailyLog, contractLog; // every daily result and contract step, to check the merge independently

function makeDevice(id, code, opts = {}) {
  const dev = { id, skew: Math.floor((R() - 0.5) * 120000), offline: false, net: { before: 0, after: 0 }, errors: [], ...opts };
  dev.now = () => Date.now() + dev.skew;
  dev.save = {
    stars: 0, upgrades: {}, skins: ['red'], skin: 'red', mode: 'classic', best: { classic: { score: 0, level: 0 } },
    settings: { music: true }, stats: { runs: 0 }, seenHelp: false, updatedAt: 0, nemesis: null,
    adventure: { unlocked: 1, stars: {}, best: {} }, ledger: { [id]: { e: 0, s: 0 } },
    daily: { day: '', best: null, attempts: 0, streak: 0, lastDay: '' },
    sync: { code, lastSync: 0 }, device: id,
  };
  dev.stored = JSON.stringify(dev.save);
  dev.history = [JSON.parse(dev.stored)];
  dev.write = () => {
    const prev = JSON.parse(dev.stored);
    dev.stored = JSON.stringify(dev.save);
    const lost = regressions(dev.save, prev);
    check(!lost.length, `device ${id} save went backwards: ${lost.join(', ')}`);
  };
  dev.payload = () => {
    const out = JSON.parse(JSON.stringify(dev.save));
    for (const k of SAVE_FIELDS.local) delete out[k];
    return out;
  };
  const fetchImpl = async (url, init = {}) => {
    if (dev.offline || R() < dev.net.before) throw new TypeError('network down (request lost)');
    await sleep(Math.floor(R() * 3));
    const res = await handleAppleApi(new Request(url, { method: init.method, headers: init.headers, body: init.body }), env);
    if (R() < dev.net.after) throw new TypeError('network down (answer lost)');
    return res;
  };
  dev.api = makeApi(fetchImpl, () => 'https://mattlavergne.com/apple/api');
  dev.boot = () => {
    // An app restart: everything in memory is gone, the stored save is reloaded.
    dev.save = JSON.parse(dev.stored);
    dev.cloud = new CloudSync({
      getPayload: dev.payload,
      getState: () => dev.save.sync || null,
      saveState: dev.write,
      apply: merged => {
        const keep = {};
        for (const k of SAVE_FIELDS.local) if (k in dev.save) keep[k] = dev.save[k];
        dev.save = { ...JSON.parse(JSON.stringify(merged)), ...keep };
        dev.write();
      },
      onStatus: (kind, e) => { if (kind === 'error') dev.errors.push(e.kind); },
      api: dev.api,
      merge: opts.merge,
    });
  };
  dev.boot();
  return dev;
}

// Random play that only ever adds progress, plus choices that change.
function play(dev) {
  const s = dev.save, r = R();
  if (r < 0.45) {
    const lvl = 1 + Math.floor(R() * Math.min(LEVELS, s.adventure.unlocked));
    const stars = 1 + Math.floor(R() * 3);
    s.adventure.stars[lvl] = Math.max(s.adventure.stars[lvl] || 0, stars);
    s.adventure.best[lvl] = Math.max(s.adventure.best[lvl] || 0, Math.floor(R() * 5000));
    s.adventure.unlocked = Math.min(LEVELS, Math.max(s.adventure.unlocked, lvl + 1));
    s.ledger[dev.id] = s.ledger[dev.id] || { e: 0, s: 0 };
    s.ledger[dev.id].e += stars;
    s.stats.runs = (s.stats.runs || 0) + 1;
    s.best.classic = { score: Math.max(s.best.classic?.score || 0, Math.floor(R() * 9000)), level: Math.max(s.best.classic?.level || 0, lvl) };
  } else if (r < 0.6) {
    const u = UPGRADES[Math.floor(R() * UPGRADES.length)];
    const bal = Object.values(s.ledger).reduce((t, l) => t + l.e - l.s, 0);
    if (bal >= 3) { s.ledger[dev.id] = s.ledger[dev.id] || { e: 0, s: 0 }; s.ledger[dev.id].s += 3; s.upgrades[u] = (s.upgrades[u] || 0) + 1; }
  } else if (r < 0.7) {
    const k = SKINS[Math.floor(R() * SKINS.length)];
    if (!s.skins.includes(k)) s.skins.push(k);
    s.skin = k;
  } else if (r < 0.8) {
    s.settings = { music: R() < 0.5 };
  } else if (r < 0.9) {
    const day = `2026-10-${String(10 + Math.floor(R() * 5)).padStart(2, '0')}`;
    if (day >= s.daily.day) {
      if (day !== s.daily.day) Object.assign(s.daily, { day, best: null, attempts: 0 });
      s.daily.attempts++;
      const score = Math.floor(R() * 3000);
      if (!s.daily.best || score > s.daily.best.score) s.daily.best = { score, level: 3 };
      if (s.daily.lastDay !== day) { s.daily.streak = s.daily.lastDay ? s.daily.streak + 1 : 1; s.daily.lastDay = day; }
      dailyLog.push(JSON.parse(JSON.stringify(s.daily)));
    }
  } else {
    const day = `2026-10-${String(10 + Math.floor(R() * 5)).padStart(2, '0')}`;
    if (!s.contracts || day > s.contracts.day) s.contracts = { day, items: ['a', 'b', 'c'].map(id => ({ id, target: 5, progress: 0, done: false })), bonus: false };
    if (day === s.contracts.day) {
      const it = s.contracts.items[Math.floor(R() * 3)];
      it.progress += 1 + Math.floor(R() * 3);
      it.done = it.done || it.progress >= it.target;
      s.contracts.bonus = s.contracts.items.every(x => x.done);
      contractLog.push(JSON.parse(JSON.stringify(s.contracts)));
    }
  }
  s.stars = Object.values(s.ledger).reduce((t, l) => t + l.e - l.s, 0);
  s.updatedAt = dev.now();
  dev.write();
  // The most progress anyone has reached, field by field.
  truth = mergeSaves(truth, dev.payload());
}

// ------------------------------------------------------------------ one run
async function scenario(seed) {
  R = rng(seed);
  const code = 'FZ' + String(seed).padStart(10, '0').replace(/\d/g, d => 'ABCDEFGHJK'[d]);
  truth = null; dailyLog = []; contractLog = [];
  const n = 2 + Math.floor(R() * 3);
  const devices = Array.from({ length: n }, (_, i) => makeDevice(`d${seed}x${i}`, code));
  let cloudPrev = null;
  const pendingSyncs = [];
  const steps = 60 + Math.floor(R() * 120);
  for (let step = 0; step < steps; step++) {
    const dev = devices[Math.floor(R() * n)];
    const r = R();
    if (r < 0.4) { play(dev); dev.cloud.soon(Math.floor(R() * 4)); }
    else if (r < 0.65) pendingSyncs.push(dev.cloud.sync());
    else if (r < 0.72) dev.cloud.flush();
    else if (r < 0.77) dev.boot();
    else if (r < 0.82) dev.offline = !dev.offline;
    else if (r < 0.87) dev.net = { before: R() * 0.4, after: R() * 0.4 };
    else if (r < 0.9) {
      // An old game version: no revisions, and it uploads its own save without
      // looking at the cloud first.
      const body = JSON.stringify({ data: dev.payload(), updatedAt: dev.save.updatedAt });
      await handleAppleApi(new Request(`https://mattlavergne.com/apple/api/save/${code}`, { method: 'PUT', body }), env);
    }
    await sleep(Math.floor(R() * 4));
    const now = cloudRow(code);
    if (now && cloudPrev) {
      const lost = regressions(now.data, cloudPrev.data);
      check(!lost.length, `seed ${seed}: cloud save went backwards (${lost.join(', ')})`);
      check(now.rev >= cloudPrev.rev, `seed ${seed}: cloud revision went backwards`);
    }
    if (now) cloudPrev = now;
  }
  await Promise.all(pendingSyncs);
  // Everything back online: two quiet rounds and every device must agree.
  for (const d of devices) { d.offline = false; d.net = { before: 0, after: 0 }; }
  for (let round = 0; round < 2; round++) for (const d of devices) await d.cloud.sync();
  const cloud = cloudRow(code);
  const want = stableStringify(cloud.data);
  for (const d of devices) {
    check(stableStringify(d.payload()) === want, `seed ${seed}: ${d.id} differs from the cloud after syncing`);
    const lost = regressions(d.payload(), truth);
    check(!lost.length, `seed ${seed}: ${d.id} is missing progress after syncing (${lost.slice(0, 3).join(', ')})`);
    check(!d.errors.includes('guard'), `seed ${seed}: the merge guard tripped on a correct merge`);
  }
  check(!regressions(cloud.data, truth).length, `seed ${seed}: the cloud is missing progress`);
  // Daily run and contracts aren't plain "only grows" numbers, so check them
  // against what actually happened instead of against the merge.
  const max = (list, f) => list.reduce((m, x) => (f(x) > m ? f(x) : m), '');
  if (dailyLog.length) {
    const d = cloud.data.daily, day = max(dailyLog, x => x.day), last = max(dailyLog, x => x.lastDay);
    const sameDay = dailyLog.filter(x => x.day === day), sameLast = dailyLog.filter(x => x.lastDay === last);
    check(d.day === day && d.lastDay === last, `seed ${seed}: daily day ${d.day}/${d.lastDay}, expected ${day}/${last}`);
    check(d.best?.score === Math.max(...sameDay.map(x => x.best.score)), `seed ${seed}: daily best ${d.best?.score} isn't the best of the day`);
    check(d.attempts === Math.max(...sameDay.map(x => x.attempts)), `seed ${seed}: daily attempts ${d.attempts} is wrong`);
    check(d.streak === Math.max(...sameLast.map(x => x.streak)), `seed ${seed}: daily streak ${d.streak} is wrong`);
  }
  if (contractLog.length) {
    const c = cloud.data.contracts, day = max(contractLog, x => x.day), same = contractLog.filter(x => x.day === day);
    check(c.day === day, `seed ${seed}: contracts are from ${c.day}, expected ${day}`);
    for (const [i, it] of c.items.entries()) {
      check(it.progress === Math.max(...same.map(x => x.items[i].progress)), `seed ${seed}: contract ${it.id} progress ${it.progress} is wrong`);
      check(it.done === same.some(x => x.items[i].done), `seed ${seed}: contract ${it.id} done flag is wrong`);
    }
  }
  const history = sqlite.prepare('SELECT COUNT(*) AS n FROM apple_save_history WHERE code = ?').get(code).n;
  check(history >= 1 && history <= 10 + 15, `seed ${seed}: history has ${history} versions`);
  check(!('settings' in cloud.data), `seed ${seed}: device settings were uploaded`);
}

// ------------------------------------------------------------------ guard tests
async function guards() {
  R = rng(999);
  const code = 'GUARDTESTAAA';
  truth = null; dailyLog = []; contractLog = [];
  const good = makeDevice('good', code);
  for (let i = 0; i < 20; i++) play(good);
  await good.cloud.sync();
  const before = cloudRow(code);

  // 1. A merge with a bug that drops stars and resets unlocked levels.
  const buggy = makeDevice('buggy', code, {
    merge: (a, b) => { const m = mergeSaves(a, b); m.adventure.stars = {}; m.adventure.unlocked = 1; return m; },
  });
  play(buggy);
  const buggyBefore = buggy.payload();
  await buggy.cloud.sync();
  check(buggy.errors.includes('guard'), 'a merge that loses stars was not stopped');
  check(!regressions(buggy.payload(), buggyBefore).length, 'the buggy merge changed the device save');
  check(stableStringify(cloudRow(code).data) === stableStringify(before.data), 'the buggy merge changed the cloud save');

  // 2. A client bug that uploads an empty save with the right revision.
  const blank = { adventure: { unlocked: 1, stars: {} }, ledger: {}, stats: {}, upgrades: {}, skins: [], updatedAt: Date.now() };
  const res = await good.api.putSave(code, blank, before.rev);
  check(res.conflict && res.reason === 'would-lose-progress', 'the server accepted a save with less progress');
  check(stableStringify(cloudRow(code).data) === stableStringify(before.data), 'the cloud changed after a refused save');

  // 3. A stale revision is refused and the client gets the current save back.
  const stale = await good.api.putSave(code, good.payload(), before.rev - 1);
  check(stale.conflict && stale.reason === 'stale' && stale.rev === before.rev, 'a save from a stale revision was accepted');

  // 4. A merge that returns garbage.
  const junk = makeDevice('junk', code, { merge: () => null });
  play(junk);
  await junk.cloud.sync();
  check(junk.errors.includes('guard'), 'a merge returning nothing was not stopped');

  // 5. Deleting the cloud copy: gone with its history, and a device still
  // using the code turns sync off instead of uploading it again.
  const other = makeDevice('other', code);
  await other.cloud.sync();
  check(other.save.sync?.code === code && !other.errors.length, 'a second device could not join before the delete');
  const del = await good.api.deleteSave(code);
  check(del.ok, 'delete failed');
  check(!cloudRow(code), 'the cloud copy is still there after delete');
  check(sqlite.prepare('SELECT COUNT(*) AS n FROM apple_save_history WHERE code = ?').get(code).n === 0, 'history survived the delete');
  play(other);
  await other.cloud.sync();
  check(other.errors.includes('deleted'), 'a device using a deleted code was not told');
  check(!cloudRow(code), 'a device brought a deleted cloud copy back');
  const relinked = makeDevice('late', code);
  await relinked.cloud.sync();
  check(relinked.errors.includes('deleted') && !cloudRow(code), 'linking a deleted code re-created it');

  // 6. Garbage in the cloud never reaches a device.
  check((() => { try { safeMerge(good.payload(), 'nonsense'); return false; } catch (e) { return e.kind === 'bad-data'; } })(), 'a non-object cloud save was merged');

  // 7. Merging is order-independent (two devices always agree) and idempotent.
  for (let i = 0; i < 300; i++) {
    R = rng(5000 + i);
    truth = null;
    dailyLog = []; contractLog = [];
    const a = makeDevice('a', 'X'), b = makeDevice('b', 'X');
    for (let k = 0; k < 8; k++) { play(a); play(b); }
    // Same timestamp on both (it happens: clocks, old saves without one).
    if (i % 2) b.save.updatedAt = a.save.updatedAt;
    const ab = mergeSaves(a.payload(), b.payload()), ba = mergeSaves(b.payload(), a.payload());
    check(stableStringify(ab) === stableStringify(ba), `merge depends on argument order (case ${i})`);
    check(stableStringify(mergeSaves(ab, ab)) === stableStringify(ab), `merging a save with itself changed it (case ${i})`);
    check(!regressions(ab, a.payload()).length && !regressions(ab, b.payload()).length, `merge lost progress (case ${i})`);
    // The server's progress check must agree with the game's.
    const junkier = JSON.parse(JSON.stringify(a.payload()));
    if (R() < 0.5) junkier.adventure.unlocked = 0; else junkier.adventure.stars = { 1: 'x' };
    for (const [x, y] of [[ab, a.payload()], [a.payload(), ab], [junkier, a.payload()]]) {
      check(stableStringify(regressions(x, y)) === stableStringify(serverRegressions(x, y)), `game and server disagree on what counts as lost progress (case ${i})`);
    }
  }
}

// ------------------------------------------------------------------ migration
// A table made by the first server version (no revisions, no history) keeps
// its saves and gets upgraded on first use.
// Saves nobody synced for 6 months go away, with their history and old
// deleted-code markers; recent ones stay.
async function expiry() {
  const now = Date.now(), old = now - 200 * 864e5, recent = now - 10 * 864e5;
  const row = sqlite.prepare('INSERT INTO apple_saves (code, data, updated_at, created_at, rev, touched_at) VALUES (?, ?, ?, ?, ?, ?)');
  row.run('EXPXREDAAAAA', '{}', old, old, 3, old);
  row.run('EXPXREDBBBBB', '{}', now, old, 3, recent); // made long ago, synced recently
  sqlite.prepare('INSERT INTO apple_save_history (code, rev, data, saved_at) VALUES (?, ?, ?, ?)').run('EXPXREDAAAAA', 3, '{}', old);
  sqlite.prepare('INSERT INTO apple_deleted (code, deleted_at) VALUES (?, ?)').run('EXPXREDCCCCC', old);
  await cleanupAppleSaves(env.APPLE_DB, now);
  check(!cloudRow('EXPXREDAAAAA'), 'a save untouched for 200 days was kept');
  check(!!cloudRow('EXPXREDBBBBB'), 'a recently synced save was deleted');
  check(sqlite.prepare("SELECT COUNT(*) AS n FROM apple_save_history WHERE code = 'EXPXREDAAAAA'").get().n === 0, 'an expired save left history behind');
  check(!sqlite.prepare("SELECT 1 FROM apple_deleted WHERE code = 'EXPXREDCCCCC'").get(), 'an old deleted-code marker was kept');
}

async function migration() {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE apple_saves (code TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL, created_at INTEGER NOT NULL)');
  const old = { adventure: { unlocked: 7, stars: { 1: 3, 2: 2 } }, ledger: { phone: { e: 40, s: 5 } }, updatedAt: 5 };
  db.prepare('INSERT INTO apple_saves VALUES (?, ?, ?, ?)').run('MXGRATEAAAAA', JSON.stringify(old), 5, Date.now() - 864e5);
  const fresh = await import(`${serverUrl}?migration`);
  const menv = { APPLE_DB: d1(db, () => 0) };
  const api = makeApi((url, init = {}) => fresh.handleAppleApi(new Request(url, { method: init.method, headers: init.headers, body: init.body }), menv), () => 'https://x/apple/api');
  const got = await api.fetchSave('MXGRATEAAAAA');
  check(got && got.rev === 0 && got.data.adventure.unlocked === 7, 'an existing save was not readable after the upgrade');
  const merged = mergeSaves({ adventure: { unlocked: 9, stars: { 3: 1 } }, ledger: { pc: { e: 4, s: 0 } }, updatedAt: 9 }, got.data);
  const put = await api.putSave('MXGRATEAAAAA', merged, 0);
  check(put.ok && put.rev === 1, 'the first write after the upgrade failed');
  const hist = db.prepare('SELECT rev FROM apple_save_history WHERE code = ? ORDER BY rev').all('MXGRATEAAAAA').map(r => r.rev);
  check(stableStringify(hist) === '[0,1]', `the pre-upgrade save wasn't kept in history (${hist})`);
}

const t0 = Date.now();
await migration();
await guards();
await expiry();
for (let seed = 1; seed <= SEEDS; seed++) await scenario(seed);
console.log(`${SEEDS} random multi-device runs + guard, delete, expiry and migration checks in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(failures ? `${failures} failures` : 'all passed');
process.exit(failures ? 1 : 0);
