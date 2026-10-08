// End-to-end sync check with the real game in two browsers (a phone and a
// computer) and the real server code (src/apple-api.js in landing-page) on
// SQLite: progress made on one shows up on the other without reloading, two
// tabs on one computer never overwrite each other, and every save field has a
// merge rule.
//   node tools/sync-e2e.mjs [path/to/apple-api.js]
// (needs Playwright with Chromium and Node 22+)
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join, extname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SAVE_FIELDS } from '../js/sync.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const serverPath = resolve(process.argv[2] || join(root, '../landing-page/src/apple-api.js'));
const { handleAppleApi } = await import(pathToFileURL(serverPath).href);
let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  ({ chromium } = await import('/opt/node-tools/node_modules/playwright/index.mjs'));
}

// The game, served from this checkout.
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const web = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = join(root, path === '/' ? 'index.html' : path);
  if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
}).listen(0);
const base = `http://localhost:${web.address().port}/`;

// The sync API, answered by the real Worker code.
const db = new DatabaseSync(':memory:');
const stmt = (sql, args = []) => ({
  bind: (...a) => stmt(sql, a),
  first: async () => db.prepare(sql).get(...args) ?? null,
  run: async () => ({ success: true, meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
  exec: () => db.prepare(sql).run(...args),
});
const env = { APPLE_DB: { prepare: sql => stmt(sql), batch: async list => list.map(s => s.exec()) } };
async function api(route) {
  const r = route.request();
  const res = await handleAppleApi(new Request(r.url(), { method: r.method(), headers: { 'Content-Type': 'application/json' }, body: r.postData() || undefined }), env);
  await route.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() });
}

let failures = 0;
const check = (ok, what) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`); if (!ok) failures++; };

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const errors = [];
async function device(opts) {
  const ctx = await browser.newContext(opts);
  await ctx.route('https://mattlavergne.com/apple/api/**', api);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  // Expected from the sync API: 404 (a new code has nothing saved yet), 409
  // (another device or tab saved first; the game merges and retries) and 410
  // (the code was deleted). The browser logs these as errors; anything else is
  // a real problem.
  page.on('console', m => { if (m.type() === 'error' && !/status of (404|409|410)/.test(m.text())) errors.push(m.text()); });
  page.on('response', r => {
    const api = r.url().includes('/apple/api/save/');
    if ((r.status() === 404 && !(api && r.request().method() === 'GET')) || (r.status() === 409 && !api)) errors.push(`${r.status()} ${r.url()}`);
  });
  return { ctx, page };
}
const unlocked = page => page.evaluate(() => window.__save.adventure.unlocked);
const waitFor = async (fn, ms = 15000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await fn()) return Date.now() - t0; await new Promise(r => setTimeout(r, 100)); }
  return -1;
};
// Plays level n to a win (the engine's own level-complete path).
async function beatLevel(page, n) {
  if (!(await page.isVisible('#screen-map'))) { await page.click('#btn-play'); await page.waitForSelector('#screen-map.show'); }
  await page.click(`#map-scroll .node[data-level="${n}"]`, { force: true });
  await page.click('#lc-play');
  await page.waitForTimeout(300);
  if (await page.isVisible('#screen-help')) await page.click('#screen-help [data-back]');
  await page.waitForFunction(() => window.__game.state === 'play' && !window.__game.demo);
  await page.evaluate(() => window.__game.levelComplete('LEVEL CLEAR!'));
  await page.waitForSelector('#screen-result.show', { timeout: 15000 });
  await page.click('#res-map');
  await page.waitForSelector('#screen-map.show');
}

const pc = await device({ viewport: { width: 1280, height: 800 } });
const phone = await device({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
for (const d of [pc, phone]) { await d.page.goto(`${base}?debug`); await d.page.waitForSelector('#screen-title.show'); }

// Computer turns sync on; the phone opens the sync link.
await pc.page.click('#btn-sync');
await pc.page.click('#sync-enable');
await pc.page.waitForFunction(() => window.__save.sync?.lastSync > 0);
const code = await pc.page.evaluate(() => window.__save.sync.code);
await phone.page.goto(`${base}?debug#sync=${code}`);
await phone.page.waitForSelector('#screen-sync.show');
await phone.page.click('#sync-link');
await phone.page.waitForFunction(() => window.__save.sync?.lastSync > 0);
await phone.page.click('#screen-sync [data-back]');
check(true, `both devices linked to ${code}`);

// The computer waits on the map; the phone beats level 1.
await pc.page.click('#screen-sync [data-back]');
await pc.page.click('#btn-play');
await pc.page.waitForSelector('#screen-map.show');
check(await pc.page.isVisible('#map-scroll .node.locked[data-level="2"]'), 'computer: level 2 starts locked');
await beatLevel(phone.page, 1);
check(await unlocked(phone.page) === 2, 'phone: level 2 unlocked');
const t1 = await waitFor(() => pc.page.isVisible('#map-scroll .node:not(.locked)[data-level="2"]'));
check(t1 >= 0, `computer shows level 2 unlocked without reloading or touching it (${(t1 / 1000).toFixed(1)}s after the win)`);
check((await pc.page.textContent('#toast')).includes('unlocked from your other device'), 'computer: says where the progress came from');

// Coming back to a window pulls right away.
await beatLevel(phone.page, 2);
await phone.page.waitForTimeout(1500); // the phone uploads within a second
await pc.page.evaluate(() => window.dispatchEvent(new Event('focus')));
const t2 = await waitFor(() => pc.page.isVisible('#map-scroll .node:not(.locked)[data-level="3"]'), 5000);
check(t2 >= 0 && t2 < 2000, `computer shows level 3 as soon as it's back in front (${(t2 / 1000).toFixed(1)}s)`);

// And the other way round.
await beatLevel(pc.page, 3);
await phone.page.click('#map-back');
const t3 = await waitFor(async () => (await unlocked(phone.page)) === 4);
check(t3 >= 0, `phone gets level 4 from the computer (after ${(t3 / 1000).toFixed(1)}s)`);

// Two tabs on the computer never overwrite each other.
const tab2 = await pc.ctx.newPage();
tab2.on('pageerror', e => errors.push(e.message));
await tab2.goto(`${base}?debug`);
await tab2.waitForSelector('#screen-title.show');
check(await unlocked(tab2) === 4, 'second tab starts with everything');
await beatLevel(pc.page, 4);
check(await waitFor(async () => (await unlocked(tab2)) === 5, 3000) >= 0, 'second tab picks up the first tab’s win right away');
// A write this tab missed (no event): it must be folded in, not overwritten.
await tab2.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('the-apple.save.v1'));
  s.adventure.unlocked = 9; s.adventure.stars['8'] = 3; s.updatedAt = Date.now() - 60000;
  localStorage.setItem('the-apple.save.v1', JSON.stringify(s));
});
await tab2.click('#tgl-music');
await tab2.waitForTimeout(600);
const stored = await tab2.evaluate(() => JSON.parse(localStorage.getItem('the-apple.save.v1')));
check(stored.adventure.unlocked === 9 && stored.adventure.stars['8'] === 3, 'a save another tab wrote is merged, not overwritten');
check(await tab2.evaluate(() => window.__save.adventure.unlocked) === 9, 'and this tab now has it too');

// Every field in a real save has a merge rule.
const known = new Set(Object.values(SAVE_FIELDS).flat());
const keys = await pc.page.evaluate(() => Object.keys(window.__save));
const unknown = keys.filter(k => !known.has(k));
check(!unknown.length, `every save field has a merge rule${unknown.length ? ' (missing: ' + unknown.join(', ') + ')' : ''}`);

// The cloud has everything, with history.
await pc.page.waitForTimeout(1500);
const row = db.prepare('SELECT data, rev FROM apple_saves WHERE code = ?').get(code);
check(JSON.parse(row.data).adventure.unlocked >= 5, `cloud save is up to date (revision ${row.rev})`);
const versions = db.prepare('SELECT COUNT(*) AS n FROM apple_save_history WHERE code = ?').get(code).n;
check(versions >= 3, `cloud keeps earlier versions (${versions})`);
check(!('settings' in JSON.parse(row.data)), 'device settings stay on the device');

// Deleting the cloud copy from the phone turns sync off everywhere.
if (await phone.page.isVisible('#map-back')) await phone.page.click('#map-back');
await phone.page.click('#btn-sync');
phone.page.once('dialog', d => d.accept());
await phone.page.click('#sync-delete');
await phone.page.waitForFunction(() => !window.__save.sync);
check((await phone.page.textContent('#sync-status')).includes('Cloud copy deleted'), 'phone: cloud copy deleted, progress kept');
check(!db.prepare('SELECT 1 FROM apple_saves WHERE code = ?').get(code), 'the cloud copy is gone');
check(db.prepare('SELECT COUNT(*) AS n FROM apple_save_history WHERE code = ?').get(code).n === 0, 'its history is gone too');
await pc.page.evaluate(() => window.dispatchEvent(new Event('focus')));
check(await waitFor(() => pc.page.evaluate(() => !window.__save.sync), 5000) >= 0, 'computer turns sync off instead of uploading it again');
check(!db.prepare('SELECT 1 FROM apple_saves WHERE code = ?').get(code), 'and the cloud copy stays deleted');
check(await unlocked(pc.page) >= 5 && await unlocked(phone.page) >= 4, 'both devices keep their progress');
check(!errors.length, `no errors${errors.length ? ': ' + errors.join(' | ') : ''}`);

await browser.close();
web.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
