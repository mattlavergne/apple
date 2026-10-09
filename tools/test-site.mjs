// Checks the web test copy's test tools (js/admin.js): the separate test save,
// the full-game switch, the progress and play tools, and above all that none
// of it touches the real save or syncs. Also checks that the public GitHub
// Pages copy doesn't run the game.
//   node tools/test-site.mjs
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  ({ chromium } = await import('/opt/node-tools/node_modules/playwright/index.mjs'));
}
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const fileFor = path => join(root, path === '/' ? 'index.html' : path);
const server = createServer((req, res) => {
  const file = fileFor(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
}).listen(0);
const base = `http://localhost:${server.address().port}/`;

let failures = 0;
const check = (ok, what) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`); if (!ok) failures++; };

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('dialog', d => d.accept());
// The sync server: count every request, answer "nothing saved yet".
const syncCalls = [];
await ctx.route('https://mattlavergne.com/api/apple/**', r => {
  syncCalls.push(r.request().method() + ' ' + r.request().url());
  r.fulfill({ status: 404, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"error":"not found"}' });
});

// Your real progress on this browser, synced with your phone.
const REAL = { stars: 40, adventure: { unlocked: 5, stars: { 1: 3, 2: 3, 3: 2, 4: 1 }, best: {} }, seenHelp: true, sync: { code: 'ABCDEFGHJKLM', lastSync: 0 }, updatedAt: 1 };
await page.addInitScript(real => {
  if (!localStorage.getItem('the-apple.save.v1')) localStorage.setItem('the-apple.save.v1', JSON.stringify(real));
}, REAL);
const realSave = () => page.evaluate(() => JSON.parse(localStorage.getItem('the-apple.save.v1')));
const testSave = () => page.evaluate(() => JSON.parse(localStorage.getItem('the-apple-test.save.v1') || 'null'));
const title = async () => { await page.waitForSelector('#screen-title.show'); await page.waitForTimeout(300); };
const tool = async act => {
  if (await page.isHidden('#admin-panel')) await page.click('#admin-btn');
  const nav = page.waitForEvent('load', { timeout: 3000 }).catch(() => null);
  await page.click(`#admin-panel button[data-act="${act}"]`);
  return nav;
};
const reloaded = async act => { await tool(act); await title(); };

await page.goto(base);
await title();
const realBefore = await realSave();
check(await page.isVisible('#admin-btn'), 'test tools button on the web copy');
await page.click('#admin-btn');
check(await page.isDisabled('#admin-panel button[data-act="unlockAll"]') && await page.isDisabled('#admin-panel button[data-act="open"]'), 'real save: progress and play tools are off');

// Switch to the test save.
await reloaded('useTest');
check((await page.textContent('#adv-sub')).includes('★ 0/'), 'test save starts empty');
check(await page.evaluate(() => JSON.parse(localStorage.getItem('the-apple-admin')).testSave === true), 'test save remembered');
await page.click('#btn-sync');
check(!(await page.isVisible('#screen-sync')) && (await page.textContent('#toast')).includes('Sync is off in the test save'), 'sync is off in the test save');

// Copy the real save in: same progress, no sync code.
await reloaded('copyReal');
const copied = await testSave();
check(copied.adventure.unlocked === 5 && !copied.sync, 'copy of the real save: same progress, sync code removed');
const syncedInTest = syncCalls.length;

// Unlock everything, then lock it again.
await reloaded('unlockAll');
check((await testSave()).adventure.unlocked === 100, 'unlock all levels');
await page.click('#btn-play');
await page.waitForSelector('#screen-map.show');
check(!(await page.$('.node.locked')), 'map: nothing locked');
await reloaded('lockAll');
check((await testSave()).adventure.unlocked === 1 && Object.keys((await testSave()).adventure.stars).length === 0, 'lock levels again: back to level 1');
await page.click('#admin-btn');
await page.fill('#admin-upto', '30');
await reloaded('unlockTo');
check((await testSave()).adventure.unlocked === 30, 'unlock up to level 30');
const starsBefore = Number(await page.textContent('#title-stars'));
await reloaded('stars');
check(Number(await page.textContent('#title-stars')) === starsBefore + 1000, '+1,000 stars');
await reloaded('skins');
await reloaded('upgrades');
const t = await testSave();
check(t.skins.length > 5 && Object.values(t.upgrades).every(v => v >= 1), 'all skins and max upgrades');

// The free app, then bought, then back to everything unlocked.
await reloaded('free');
check(await page.evaluate(() => !document.documentElement.classList.contains('full-game')) && (await page.textContent('#btn-endless')).includes('\u{1F512}'), 'free app: Endless locked');
check(await page.isVisible('#ad-sim'), 'free app: pretend ad banner');
await page.click('#btn-play');
await page.waitForSelector('#screen-map.show');
check((await page.$$('.node.paid')).length === 80, 'free app: levels 21-100 need the full game');
await reloaded('bought');
check(await page.evaluate(() => document.documentElement.classList.contains('full-game')) && !(await page.isVisible('#ad-sim')), 'bought: full game, no ads');
await reloaded('free');
check(await page.evaluate(() => !document.documentElement.classList.contains('full-game')), '"Free app" locks it again');
await reloaded('web');
check(await page.evaluate(() => document.documentElement.classList.contains('full-game')) && !(await page.isVisible('#ad-sim')), 'everything unlocked again');

// Open a level, play, pause, win.
await page.click('#admin-btn');
await page.fill('#admin-level', '27');
await tool('open');
await page.waitForSelector('#screen-level.show');
check((await page.textContent('#lc-title')).includes('Level 27'), 'open level 27');
await page.click('#lc-play');
await page.waitForFunction(() => document.querySelector('#hud') && !document.querySelector('#hud').classList.contains('hidden'));
await page.waitForTimeout(1500);
check(await page.isHidden('#admin-btn'), 'tools button hidden while playing');
await page.click('#btn-pause');
await page.click('#admin-btn');
await tool('win');
await page.waitForSelector('#screen-result.show', { timeout: 15000 });
check((await page.textContent('#res-title')).includes('Level 27'), 'win this level');
check((await testSave()).adventure.stars[27] >= 1, 'the win is in the test save');
// Lose one.
await page.click('#res-map');
await page.waitForSelector('#screen-map.show');
await page.click('#admin-btn');
await page.fill('#admin-level', '3');
await tool('open');
await page.click('#lc-play');
await page.waitForFunction(() => !document.querySelector('#hud').classList.contains('hidden'));
await page.waitForTimeout(1500);
await page.click('#btn-pause');
await page.click('#admin-btn');
await tool('lose');
await page.waitForSelector('#screen-over.show', { timeout: 15000 });
check(true, 'lose this level');

// Load a pasted save into the test save; it can't bring a sync code along.
await page.click('#btn-over-menu').catch(() => {});
await page.evaluate(() => { window.prompt = () => JSON.stringify({ adventure: { unlocked: 12, stars: {}, best: {} }, sync: { code: 'ZZZZZZZZZZZZ' } }); });
await reloaded('pasteJson');
check((await testSave()).adventure.unlocked === 12 && !(await testSave()).sync, 'load JSON into the test save (sync code dropped)');

check(syncCalls.length === syncedInTest, `nothing synced while on the test save (${syncCalls.length - syncedInTest} requests)`);

// Back to the real save: exactly as it was.
await reloaded('useReal');
const realAfter = await realSave();
check(realAfter.adventure.unlocked === 5 && realAfter.sync?.code === 'ABCDEFGHJKLM' && JSON.stringify(realAfter.adventure) === JSON.stringify(realBefore.adventure), 'real save untouched, still synced');
check((await page.textContent('#adv-sub')).includes('Level 5'), 'game shows the real progress again');
check(errors.length === 0, `no errors${errors.length ? ': ' + errors.join(' | ') : ''}`);

// If a test setting ever stops the game from starting, the page says so and
// offers the way back (js/boot-check.js), and ?realsave turns the settings off.
await page.evaluate(() => localStorage.setItem('the-apple-admin', JSON.stringify({ testSave: true, freeApp: true })));
await page.route('**/js/levels.js', r => r.fulfill({ contentType: 'text/javascript', body: 'export const = broken;' }));
await page.goto(base);
await page.waitForSelector('#boot-rescue', { timeout: 9000 }).catch(() => {});
check(await page.isVisible('#boot-rescue') && !(await page.evaluate(() => window.__appleStarted)), 'a game that fails to start shows "The game didn\u2019t start", not a blank page');
await page.unroute('**/js/levels.js');
await page.click('#boot-real');
await title();
check(await page.evaluate(() => localStorage.getItem('the-apple-admin') === null && !location.search) && (await page.textContent('#adv-sub')).includes('Level 5'), '"Back to my real save" (?realsave): test settings off, real save back');
check(!(await page.isVisible('#boot-rescue')), 'no rescue box on a normal start');
await page.evaluate(() => localStorage.setItem('the-apple-admin', JSON.stringify({ testSave: true })));
await page.goto(base + '?realsave');
await title();
check(await page.evaluate(() => localStorage.getItem('the-apple-admin') === null) && (await page.textContent('#adv-sub')).includes('Level 5'), '?realsave works on its own too');

// The privacy policy has a public copy in landing-page; the two must match.
const lpPrivacy = join(root, '../landing-page/public/privacy/apple.html');
if (existsSync(lpPrivacy)) check(readFileSync(lpPrivacy, 'utf8') === readFileSync(join(root, 'privacy.html'), 'utf8'), 'privacy.html matches the public copy in landing-page');
else console.log('SKIP  privacy copy check (no landing-page checkout next to this repo)');

// The public GitHub Pages copy doesn't run the game.
const gh = await ctx.newPage();
await gh.route('https://mattlavergne.github.io/apple/**', r => {
  const path = new URL(r.request().url()).pathname.replace(/^\/apple/, '') || '/';
  const file = fileFor(path === '/' ? '/' : path);
  if (!existsSync(file)) return r.fulfill({ status: 404, body: '' });
  r.fulfill({ status: 200, contentType: TYPES[extname(file)] || 'application/octet-stream', body: readFileSync(file) });
});
await gh.goto('https://mattlavergne.github.io/apple/');
await gh.waitForTimeout(800);
check((await gh.textContent('body')).includes('coming to the App Store') && !(await gh.$('#screen-title.show')) && !(await gh.$('#admin-btn')), 'GitHub Pages copy: no game, no tools');
await gh.goto('https://mattlavergne.github.io/apple/privacy.html');
check((await gh.textContent('h1')).includes('Privacy Policy'), 'privacy policy still opens there');

await browser.close();
server.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
