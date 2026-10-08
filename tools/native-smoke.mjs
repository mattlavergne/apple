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
const fakeBridge = ({ os, seed, storeOwned = false }) => {
  if (os === 'android') window.androidBridge = { postMessage() {} };
  else window.webkit = { messageHandlers: { bridge: { postMessage() {} } } };
  const calls = (window.__calls = []);
  const listeners = (window.__listeners = {});
  const prefs = new Map(Object.entries(seed));
  window.__prefs = prefs;
  const header = (name, promise, callback = ['addListener']) => ({
    name, methods: [...promise.map(m => ({ name: m, rtype: 'promise' })), ...callback.map(m => ({ name: m, rtype: 'callback' }))],
  });
  // The store account: purchases survive reloads, like a real Apple ID / Google account.
  if (storeOwned && !localStorage.getItem('__store_owned')) localStorage.setItem('__store_owned', '1');
  const FULL = 'com.mattlavergne.theapple.full';
  const purchase = { productIdentifier: FULL, purchaseState: '1', transactionId: 't1', purchaseDate: '2026-10-08' };
  const fire = (name, data) => setTimeout(() => (listeners[name] || []).forEach(cb => cb(data)), 0);
  const impl = {
    Preferences: {
      get: o => ({ value: prefs.has(o.key) ? prefs.get(o.key) : null }),
      set: o => { prefs.set(o.key, o.value); },
      keys: () => ({ keys: [...prefs.keys()] }),
    },
    AdMob: {
      requestConsentInfo: () => ({ status: 'NOT_REQUIRED', canRequestAds: true, isConsentFormAvailable: false }),
      showBanner: () => fire('AdMob.bannerAdSizeChanged', { width: 390, height: 50 }),
      prepareRewardVideoAd: o => ({ adUnitId: o.adId }),
      showRewardVideoAd: () => ({ type: 'reward', amount: 1 }),
    },
    NativePurchases: {
      getProducts: () => ({ products: [{ identifier: FULL, priceString: '$2.99', price: 2.99, currencyCode: 'USD' }] }),
      getPurchases: () => ({ purchases: localStorage.getItem('__store_owned') ? [purchase] : [] }),
      purchaseProduct: () => { localStorage.setItem('__store_owned', '1'); return purchase; },
    },
  };
  window.Capacitor = {
    PluginHeaders: [
      header('Preferences', ['get', 'set', 'remove', 'keys', 'clear']),
      header('Haptics', ['impact', 'notification', 'vibrate']),
      header('App', ['exitApp', 'minimizeApp', 'getInfo', 'getState']),
      header('Share', ['share', 'canShare']),
      header('SplashScreen', ['show', 'hide']),
      header('AdMob', ['initialize', 'requestConsentInfo', 'showConsentForm', 'showBanner', 'hideBanner', 'resumeBanner', 'removeBanner', 'prepareRewardVideoAd', 'showRewardVideoAd']),
      header('NativePurchases', ['getProducts', 'getPurchases', 'purchaseProduct', 'restorePurchases']),
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

// ------------------------------------------------------------------ free tier, ads, purchase
const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const store = await ctx3.newPage();
store.on('pageerror', e => errors.push(e.message));
await store.addInitScript(fakeBridge, { os, seed });
await store.goto(`${base}?debug`);
await store.waitForSelector('#screen-title.show');
const calls3 = () => store.evaluate(() => window.__calls.map(c => c.slice(0, 2).join('.')));
const adOn = () => store.evaluate(() => document.documentElement.classList.contains('ad-on'));
await store.waitForFunction(() => document.documentElement.classList.contains('ad-on'), null, { timeout: 5000 }).catch(() => {});
check((await calls3()).includes('AdMob.requestConsentInfo') && (await calls3()).includes('AdMob.initialize'), 'free tier: asks for ad consent, then starts ads');
check(await adOn() && await store.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ad-h').trim()) === '50px', 'free tier: banner on the title screen, with its space kept clear');
check((await store.textContent('#btn-endless')).includes('\u{1F512}'), 'Endless shows a lock');
await store.click('#btn-endless');
check(await store.isVisible('#screen-full'), 'Endless opens the full-game screen');
check(await store.textContent('#full-buy') === 'Unlock for $2.99', 'price comes from the store');
check(!(await adOn()), 'no banner over the purchase screen');
await store.click('#full-close');
await store.click('#btn-play');
await store.waitForSelector('#screen-map.show');
check(await store.isVisible('.map-unlock') && (await store.$$('.node.paid')).length === 80, 'map: levels 21-100 are marked as the full game');
await store.$eval('#map-scroll .node[data-level="21"]', el => el.click());
check(await store.isVisible('#screen-full') && !(await store.isVisible('#screen-level')), 'level 21 opens the full-game screen, not the level');
await store.click('#full-close');
check(await store.isVisible('#screen-map'), '"Not now" goes back to the map');
await store.$eval('#map-scroll .node[data-level="1"]', el => el.click());
await store.click('#lc-play');
await store.waitForFunction(() => window.__game.state === 'play' && !window.__game.demo);
check(!(await adOn()) && (await calls3()).includes('AdMob.hideBanner'), 'no banner during play');
await store.evaluate(() => window.__game.levelComplete('LEVEL CLEAR!'));
await store.waitForSelector('#screen-result.show', { timeout: 15000 });
check(await adOn(), 'banner back on the results screen');
check(await store.isVisible('#res-bonus'), 'results offer an optional ad for bonus stars');
const ledgerBefore = await store.evaluate(() => JSON.parse(localStorage.getItem('the-apple.save.v1')).ledger);
await store.click('#res-bonus');
await store.waitForFunction(() => document.querySelector('#res-bonus').classList.contains('hidden'));
const ledgerAfter = await store.evaluate(() => JSON.parse(localStorage.getItem('the-apple.save.v1')).ledger);
const earned = l => Object.values(l).reduce((t, x) => t + x.e, 0);
const bonusPaid = earned(ledgerAfter) - earned(ledgerBefore);
check((await calls3()).includes('AdMob.showRewardVideoAd') && bonusPaid >= 3, `watching the ad pays bonus stars (+${bonusPaid})`);
// Buy the full game.
await store.click('#res-map');
await store.$eval('#map-scroll .node[data-level="21"]', el => el.click());
await store.click('#full-buy');
await store.waitForFunction(() => document.documentElement.classList.contains('full-game'));
check((await calls3()).includes('NativePurchases.purchaseProduct'), 'Unlock buys through the store');
check(!(await store.isVisible('#screen-full')) && (await store.textContent('#toast')).includes('Full game unlocked'), 'purchase closes the screen and says thanks');
check(!(await adOn()) && (await calls3()).includes('AdMob.removeBanner'), 'ads are gone after buying');
check((await store.$$('.node.paid')).length === 0 && !(await store.isVisible('.map-unlock')), 'all levels open after buying');
await store.reload();
await store.waitForSelector('#screen-title.show');
await store.waitForTimeout(500);
check(await store.evaluate(() => document.documentElement.classList.contains('full-game')) && !(await calls3()).includes('AdMob.initialize'), 'after a restart: still unlocked, ads never start');
await store.click('#btn-endless');
check(await store.isVisible('#screen-endless'), 'Endless opens after buying');
check(!(await store.textContent('#toast')).includes('Full game unlocked'), 'no repeat "unlocked" message on later launches');
// A reinstall: nothing on the device, the purchase is on the store account.
const ctx4 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const again = await ctx4.newPage();
again.on('pageerror', e => errors.push(e.message));
await again.addInitScript(fakeBridge, { os, seed: {}, storeOwned: true });
await again.goto(base);
await again.waitForSelector('#screen-title.show');
check(await again.waitForFunction(() => document.documentElement.classList.contains('full-game'), null, { timeout: 5000 }).then(() => true, () => false), 'reinstall: the purchase comes back from the store by itself');
check(errors.length === 0, `no errors in the purchase flows${errors.length ? ': ' + errors.join(' | ') : ''}`);

await browser.close();
server.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
