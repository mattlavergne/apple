// Cloud sync: the same progress on every device, with no accounts.
// A device makes up a random sync code; any device that enters the code (or
// opens the sync link) shares the save. The server is src/apple-api.js in the
// landing-page repo.
//
// Progress can only move forward. Every layer checks it independently:
//   - mergeSaves() takes the best of both saves for everything that is
//     progress, so merging can only add;
//   - safeMerge() double-checks the result against both inputs and refuses to
//     use it if anything went down (a bug in the merge can't cost progress);
//   - the server only accepts a save based on its latest revision and refuses
//     any save with less progress than the one it has, then keeps a history.
// When anything looks wrong, sync stops and the device keeps what it has.

// Inside mattlavergne.com the API is same-origin; elsewhere (GitHub Pages,
// the store app, local dev) call it on the main domain.
const apiBase = () => (globalThis.location?.hostname?.endsWith('mattlavergne.com') ? '/apple/api' : 'https://mattlavergne.com/apple/api');
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

export function newCode() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return [...bytes].map(b => ALPHABET[b % ALPHABET.length]).join('');
}
export const formatCode = c => (c || '').match(/.{1,4}/g)?.join('-') || '';
export function normalizeCode(s) {
  const c = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[A-HJ-NP-Z2-9]{12}$/.test(c) ? c : null;
}

export class SyncError extends Error {
  constructor(kind, msg) { super(msg); this.kind = kind; }
}

// ------------------------------------------------------------------ server calls
// fetchImpl is swappable so tests can run many devices against one server.
export function makeApi(fetchImpl = (...a) => fetch(...a), base = apiBase) {
  async function call(method, code, { body, query = '', keepalive = false } = {}) {
    // A hung request must never stall sync forever.
    const ctl = !keepalive && typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl && setTimeout(() => ctl.abort(), 15000);
    let res;
    try {
      res = await fetchImpl(`${base()}/save/${code}${query}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        keepalive,
        signal: ctl?.signal,
      });
    } catch {
      throw new SyncError('offline', 'You look offline. Progress is saved on this device and will sync when you’re back.');
    } finally {
      clearTimeout(timer);
    }
    let json = null;
    try { json = await res.json(); } catch { /* not JSON */ }
    if (res.status === 404 && method === 'GET') return null;
    if (res.status === 409 && json?.conflict) return json;
    if (res.status === 503 && json?.error === 'sync not configured') throw new SyncError('unconfigured', 'Cloud sync isn’t switched on on the server yet.');
    if (res.status === 403 && !json) throw new SyncError('blocked', 'The sync server’s security check blocked this request. Try again in a bit.');
    if (!res.ok || !json) throw new SyncError('server', `Sync failed (${res.status}). Progress is safe on this device.`);
    return json;
  }
  return {
    // null (nothing saved yet) | { unchanged: true, rev } | { data, updatedAt, rev }
    fetchSave: (code, have) => call('GET', code, { query: Number.isInteger(have) ? `?have=${have}` : '' }),
    // { ok, rev, updatedAt } | { conflict: true, reason, data, updatedAt, rev }
    putSave: (code, data, baseRev, keepalive = false) =>
      call('PUT', code, { body: { data, updatedAt: data.updatedAt, baseRev }, keepalive }),
  };
}

// ------------------------------------------------------------------ merging
// Every top-level save field and how it merges. A new field must be added
// here (tools/sync-fuzz.mjs fails otherwise) and, if it is progress, to
// mergeSaves() and regressions() below and in the server's regressions().
export const SAVE_FIELDS = {
  progress: ['adventure', 'best', 'upgrades', 'ledger', 'stars', 'skins', 'stats', 'seenHelp', 'daily', 'contracts'],
  choice: ['skin', 'mode', 'settings', 'nemesis'], // the most recently changed device wins
  meta: ['updatedAt'],
  local: ['sync', 'device'], // never uploaded
};

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const maxMap = (x, y) => {
  const r = {};
  for (const [k, v] of Object.entries(obj(x))) r[k] = num(v);
  for (const [k, v] of Object.entries(obj(y))) r[k] = Math.max(num(r[k]), num(v));
  return r;
};

// JSON with sorted keys, so the same save always gives the same text.
export function stableStringify(v) {
  if (Array.isArray(v)) return `[${v.map(x => (x === undefined ? 'null' : stableStringify(x))).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

// Combine two saves so progress never goes backwards: unlocked levels, best
// stars and scores, upgrades, skins and lifetime stats take the best of both.
// The star balance adds up per-device ledgers. Choices (equipped skin, mode,
// settings, nemesis) come from whichever save changed most recently. The
// result doesn't depend on which save is passed first, so two devices always
// agree and never keep re-uploading.
export function mergeSaves(a, b) {
  if (!b) return a;
  if (!a) return b;
  const ta = num(a.updatedAt), tb = num(b.updatedAt);
  const aFirst = ta !== tb ? ta > tb : stableStringify(a) >= stableStringify(b);
  const [newer, older] = aFirst ? [a, b] : [b, a];
  const out = JSON.parse(JSON.stringify(newer));

  const advN = obj(newer.adventure), advO = obj(older.adventure);
  out.adventure = {
    ...advN,
    unlocked: Math.max(num(advN.unlocked) || 1, num(advO.unlocked) || 1),
    stars: maxMap(advN.stars, advO.stars),
    best: maxMap(advN.best, advO.best),
  };
  out.best = {};
  for (const mode of new Set([...Object.keys(obj(newer.best)), ...Object.keys(obj(older.best))])) {
    const x = obj(obj(newer.best)[mode]), y = obj(obj(older.best)[mode]);
    out.best[mode] = { ...y, ...x, score: Math.max(num(x.score), num(y.score)), level: Math.max(num(x.level), num(y.level)) };
  }
  out.upgrades = maxMap(newer.upgrades, older.upgrades);
  // Star ledger: each device's earned/spent totals only ever grow, so take the
  // larger of each and the balance adds up across devices.
  out.ledger = {};
  for (const dev of new Set([...Object.keys(obj(newer.ledger)), ...Object.keys(obj(older.ledger))])) {
    const x = obj(obj(newer.ledger)[dev]), y = obj(obj(older.ledger)[dev]);
    out.ledger[dev] = { e: Math.max(num(x.e), num(y.e)), s: Math.max(num(x.s), num(y.s)) };
  }
  out.stars = Object.values(out.ledger).reduce((t, l) => t + l.e - l.s, 0);
  const list = v => (Array.isArray(v) ? v.filter(s => typeof s === 'string') : []);
  out.skins = [...new Set([...list(newer.skins), ...list(older.skins)])].sort();
  out.stats = maxMap(newer.stats, older.stats);
  out.seenHelp = !!(newer.seenHelp || older.seenHelp);
  out.updatedAt = Math.max(ta, tb);

  // Daily run: today's best and tries come from the later day (the better of
  // both on the same day); the streak from whichever device played last.
  if (newer.daily || older.daily) {
    const dn = obj(newer.daily), dold = obj(older.daily);
    const later = String(dn.day || '') >= String(dold.day || '') ? dn : dold;
    const other = later === dn ? dold : dn;
    out.daily = { ...later };
    if (later.day === other.day) {
      const lb = later.best, ob = other.best;
      out.daily.best = !lb ? ob ?? null : !ob ? lb : (num(ob.score) > num(lb.score) ? ob : lb);
      out.daily.attempts = Math.max(num(later.attempts), num(other.attempts));
    }
    const last = String(dn.lastDay || '') >= String(dold.lastDay || '') ? dn : dold;
    const prev = last === dn ? dold : dn;
    out.daily.lastDay = last.lastDay || '';
    out.daily.streak = last.lastDay === prev.lastDay ? Math.max(num(last.streak), num(prev.streak)) : num(last.streak);
  }
  // Daily contracts: the later day's set; on the same day, the most progress.
  if (newer.contracts || older.contracts) {
    const cn = obj(newer.contracts), co = obj(older.contracts);
    const later = String(cn.day || '') >= String(co.day || '') ? cn : co;
    const other = later === cn ? co : cn;
    out.contracts = JSON.parse(JSON.stringify(later));
    if (later.day === other.day && Array.isArray(later.items) && Array.isArray(other.items)) {
      out.contracts.items = later.items.map((it, i) => {
        const o = obj(other.items[i]);
        return o.id === it.id ? { ...it, progress: Math.max(num(it.progress), num(o.progress)), done: !!(it.done || o.done) } : it;
      });
      out.contracts.bonus = !!(later.bonus || other.bonus);
    }
  }
  return out;
}

// Progress that only ever grows. Returns where `next` has less than `prev`
// (empty when nothing would be lost). The server runs the same check
// (regressions() in src/apple-api.js); keep the two in step.
export function regressions(next, prev) {
  const lost = [];
  const n = obj(next), p = obj(prev);
  const map = (path, a, b) => {
    a = obj(a);
    for (const [k, v] of Object.entries(obj(b))) if (num(a[k]) < num(v)) lost.push(`${path}.${k}`);
  };
  if (num(obj(n.adventure).unlocked) < num(obj(p.adventure).unlocked)) lost.push('adventure.unlocked');
  map('adventure.stars', obj(n.adventure).stars, obj(p.adventure).stars);
  map('adventure.best', obj(n.adventure).best, obj(p.adventure).best);
  map('upgrades', n.upgrades, p.upgrades);
  map('stats', n.stats, p.stats);
  for (const [mode, b] of Object.entries(obj(p.best))) map(`best.${mode}`, obj(n.best)[mode], b);
  for (const [dev, l] of Object.entries(obj(p.ledger))) map(`ledger.${dev}`, obj(n.ledger)[dev], l);
  const skins = new Set(Array.isArray(n.skins) ? n.skins : []);
  for (const s of Array.isArray(p.skins) ? p.skins : []) if (!skins.has(s)) lost.push(`skins.${s}`);
  return lost;
}

const isSave = d => !!d && typeof d === 'object' && !Array.isArray(d);

// Merge, then prove nothing was lost from either side before using the result.
export function safeMerge(local, other, merge = mergeSaves) {
  if (!isSave(other)) throw new SyncError('bad-data', 'The cloud save didn’t look right, so this device kept its own.');
  const merged = merge(local, other);
  const lost = isSave(merged) ? [...regressions(merged, local), ...regressions(merged, other)] : ['everything'];
  if (lost.length) {
    throw new SyncError('guard', `Sync paused to protect your progress (${lost[0]} would have gone down). Nothing was lost.`);
  }
  return merged;
}

// ------------------------------------------------------------------ sync engine
// One sync at a time; anything asked for meanwhile runs right after. A round:
// fetch the cloud save (or just "unchanged" when we already have its latest
// revision), merge it in, then upload if this device has something the cloud
// doesn't. If another device saved first, the server answers with its save
// instead; merge that and try again.
export class CloudSync {
  // getPayload(): this device's save as uploaded (without local-only fields)
  // apply(merged): replace this device's progress with an already-checked merge
  // getState() / saveState(): save.sync ({ code, rev, lastSync }), or null when off
  // onStatus('ok' | 'error', error)
  constructor({ getPayload, apply, getState, saveState, onStatus = () => {}, api = makeApi(), merge = mergeSaves }) {
    Object.assign(this, { getPayload, apply, getState, saveState, onStatus, api, merge });
    this.known = null; // the cloud save at state.rev, as stable JSON ('' = nothing saved yet)
    this.knownCode = null;
    this.inflight = null;
    this.again = false;
    this.timer = null;
  }

  // Call after linking, switching or turning off a code.
  reset() { this.known = null; this.knownCode = null; }

  // Sync in a moment (batches a burst of changes into one upload).
  soon(ms = 700) {
    if (!this.getState()?.code) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.sync(), ms);
  }

  sync() {
    if (!this.getState()?.code) return Promise.resolve();
    if (this.inflight) { this.again = true; return this.inflight; }
    clearTimeout(this.timer);
    this.inflight = (async () => {
      try {
        do { this.again = false; await this.round(); } while (this.again && this.getState()?.code);
        this.onStatus('ok');
      } catch (e) {
        this.onStatus('error', e);
      } finally {
        this.inflight = null;
      }
    })();
    return this.inflight;
  }

  // Does this device have changes the cloud hasn't seen?
  pending() {
    const st = this.getState();
    return !!st?.code && this.knownCode === st.code && this.known !== null && stableStringify(this.getPayload()) !== this.known;
  }

  // The page or app is going away: send unsynced changes in one fire-and-forget
  // request. If another device saved first the server refuses it, and the
  // changes go up on the next launch instead (they're safe on this device).
  flush() {
    const st = this.getState();
    if (!this.pending()) return;
    clearTimeout(this.timer);
    this.api.putSave(st.code, this.getPayload(), Number.isInteger(st.rev) ? st.rev : null, true).catch(() => {});
  }

  async round() {
    const st = this.getState();
    const code = st.code;
    if (this.knownCode !== code) this.reset();
    let remote = await this.api.fetchSave(code, this.known !== null && Number.isInteger(st.rev) ? st.rev : undefined);
    for (let tries = 0; tries < 6; tries++) {
      if (this.getState()?.code !== code) return; // turned off or switched meanwhile
      if (remote === null) { st.rev = 0; this.known = ''; this.knownCode = code; }
      else if (!remote.unchanged) this.absorb(remote, code);
      const payload = this.getPayload();
      const json = stableStringify(payload);
      if (json !== this.known) {
        const res = await this.api.putSave(code, payload, Number.isInteger(st.rev) ? st.rev : null);
        if (res.conflict) { remote = res; continue; }
        if (this.getState()?.code !== code) return;
        st.rev = Number.isInteger(res.rev) ? res.rev : null;
        this.known = json;
        this.knownCode = code;
      }
      st.lastSync = Date.now();
      this.saveState();
      return;
    }
    throw new SyncError('busy', 'Another device kept saving at the same time. Trying again soon.');
  }

  absorb(remote, code) {
    const local = this.getPayload();
    const merged = safeMerge(local, remote.data, this.merge); // throws, and keeps local, if anything would be lost
    if (stableStringify(merged) !== stableStringify(local)) this.apply(merged);
    const st = this.getState();
    st.rev = Number.isInteger(remote.rev) ? remote.rev : null;
    this.known = stableStringify(remote.data);
    this.knownCode = code;
  }
}
