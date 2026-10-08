// Smoke test for the store app's JavaScript side: serves www/ (run `npm run
// build` first) with Capacitor's real capacitor.js and fakes only the native
// bridge underneath it, then checks that saves, haptics, the back button,
// backgrounding and the launch screen go through the native plugins.
//   node tools/native-smoke.mjs [ios|android]
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const os = process.argv[2] || 'ios';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'www');
if (!existsSync(join(root, 'capacitor.js'))) { console.error('Run `npm run build` first.'); process.exit(1); }
let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  ({ chromium } = await import('/opt/node-tools/node_modules/playwright/index.mjs'));
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = join(root, path === '/' ? 'index.html' : path);
  if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
}).listen(0);
const base = `http://localhost:${server.address().port}/`;

// The fake native side: plugin headers, promise calls and listener callbacks.
const fakeBridge = ({ os, seed }) => {
  if (os === 'android') window.androidBridge = { postMessage() {} };
  else window.webkit = { messageHandlers: { bridge: { postMessage() {} } } };
  const calls = (window.__calls = []);
  const listeners = (window.__listeners = {});
  const prefs = new Map(Object.entries(seed));
  window.__prefs = prefs;
  const header = (name, promise, callback = ['addListener']) => ({
    name, methods: [...promise.map(m => ({ name: m, rtype: 'promise' })), ...callback.map(m => ({ name: m, rtype: 'callback' }))],
  });
  const impl = {
    Preferences: {
      get: o => ({ value: prefs.has(o.key) ? prefs.get(o.key) : null }),
      set: o => { prefs.set(o.key, o.value); },
      keys: () => ({ keys: [...prefs.keys()] }),
    },
  };
  window.Capacitor = {
    PluginHeaders: [
      header('Preferences', ['get', 'set', 'remove', 'keys', 'clear']),
      header('Haptics', ['impact', 'notification', 'vibrate']),
      header('App', ['exitApp', 'minimizeApp', 'getInfo', 'getState']),
      header('Share', ['share', 'canShare']),
      header('SplashScreen', ['show', 'hide']),
    ],
    nativePromise: async (plugin, method, options) => {
      calls.push([plugin, method, options]);
      const fn = impl[plugin]?.[method];
      return fn ? fn(options || {}) : undefined;
    },
    nativeCallback: (plugin, method, options, cb) => {
      calls.push([plugin, method, options]);
      if (method === 'addListener') (listeners[`${plugin}.${options.eventName}`] ||= []).push(cb);
      return String(calls.length);
    },
  };
};

const seed = {
  // A save that exists only in native storage: the WebView's own storage was wiped.
  'the-apple.save.v1': JSON.stringify({ stars: 0, ledger: { dev12345: { e: 321, s: 0 } }, adventure: { unlocked: 7, stars: { 1: 3, 2: 2 }, best: {} }, seenHelp: true, updatedAt: 1 }),
  'the-apple.device': 'dev12345',
};

let failures = 0;
const check = (ok, what) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`); if (!ok) failures++; };

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const external = [];
page.on('request', r => { if (!r.url().startsWith(base) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) external.push(r.url()); });
await page.addInitScript(fakeBridge, { os, seed });
await page.goto(base);
await page.waitForSelector('#screen-title.show');
await page.waitForTimeout(600);

const calls = () => page.evaluate(() => window.__calls.map(c => c.slice(0, 2).join('.')));
const fire = (name, data) => page.evaluate(([n, d]) => (window.__listeners[n] || []).forEach(cb => cb(d)), [name, data]);
const visible = () => page.evaluate(() => document.querySelector('.screen.show')?.id || '(none)');

check(await page.evaluate(() => window.Capacitor.isNativePlatform() && window.Capacitor.getPlatform()) === os, `runs as native ${os}`);
check(await page.textContent('#title-stars') === '321', 'progress restored from native storage after the WebView storage was wiped');
check((await page.textContent('#adv-sub')).includes('Level 7'), 'adventure unlocks restored');
check(await page.evaluate(() => localStorage.getItem('the-apple.save.v1') !== null), 'restored save copied back into the WebView cache');
check((await calls()).includes('SplashScreen.hide'), 'launch screen hidden after the first frame');
check(await page.evaluate(() => !navigator.serviceWorker?.controller) && !(await page.evaluate(() => navigator.serviceWorker?.getRegistrations?.().then(r => r.length) ?? 0)), 'no service worker in the app');
check(await page.evaluate(() => document.documentElement.classList.contains('has-haptics')), 'haptics toggle shown (iPhones get haptics in the app)');
check(await page.evaluate(() => document.fonts.check('600 16px Fredoka')), 'bundled Fredoka font loaded');

// Back button: title -> app goes to background.
await fire('App.backButton', {});
check((await calls()).includes('App.minimizeApp'), 'back on the title screen minimizes the app');

// Map, level card, and back out step by step.
await page.click('#btn-play');
await page.waitForSelector('#screen-map.show');
await page.click('#map-scroll .node[data-level="1"]', { force: true });
await page.waitForSelector('#screen-level.show');
await fire('App.backButton', {});
check(await visible() === 'screen-map', 'back on the level card returns to the map');
await fire('App.backButton', {});
check(await visible() === 'screen-title', 'back on the map returns to the title');

// Play level 1, then background the app.
await page.click('#btn-play');
await page.waitForSelector('#screen-map.show');
await page.click('#map-scroll .node[data-level="1"]', { force: true });
await page.click('#lc-play');
await page.waitForTimeout(1800);
check(!(await page.isHidden('#hud')), 'level started');
await fire('App.backButton', {});
check(await visible() === 'screen-pause', 'back during play pauses');
await fire('App.backButton', {});
check(await visible() === '(none)', 'back while paused resumes');
const before = (await calls()).filter(c => c === 'Preferences.set').length;
await page.evaluate(() => window.__game && 0);
await fire('App.appStateChange', { isActive: false });
await page.waitForTimeout(100);
check(await visible() === 'screen-pause', 'going to the background pauses the game');
check((await calls()).filter(c => c === 'Preferences.set').length > before, 'going to the background saves to native storage');
check(await page.evaluate(() => JSON.parse(window.__prefs.get('the-apple.save.v1')).stats.runs >= 1), 'native copy has the new progress');
await fire('App.appStateChange', { isActive: true });

// Haptics go through the native plugin.
await page.click('#tgl-haptics'); await page.click('#tgl-haptics');
check((await calls()).some(c => c.startsWith('Haptics.')), 'haptics use the native plugin');

// Sync screen: the link button opens the share sheet.
check(await page.textContent('#sync-copy') === 'Send link', 'sync link button says "Send link"');

check(external.length === 0, `no requests leave the app${external.length ? ': ' + external.join(', ') : ''}`);
check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);

// An update from a build without native storage: the save exists only in the
// WebView's localStorage and must be copied into native storage.
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page2 = await ctx2.newPage();
await page2.addInitScript(fakeBridge, { os, seed: {} });
await page2.addInitScript(old => { if (!localStorage.getItem('the-apple.save.v1')) localStorage.setItem('the-apple.save.v1', old); }, seed['the-apple.save.v1']);
await page2.goto(base);
await page2.waitForSelector('#screen-title.show');
await page2.waitForTimeout(300);
check(await page2.textContent('#title-stars') === '321', 'old WebView-only save still loads');
check(await page2.evaluate(() => (window.__prefs.get('the-apple.save.v1') || '').includes('dev12345')), 'old WebView-only save copied into native storage');

await browser.close();
server.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
