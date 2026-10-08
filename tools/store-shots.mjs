// Store screenshots and the Play Store feature graphic, made from the real
// game: each scene is captured at a phone / tablet size, then framed with a
// caption at the exact pixel size each store asks for.
//   node tools/store-shots.mjs        writes store/ (needs Playwright with Chromium)
// Gameplay scenes let the title-screen AI play a real level and wait for a
// moment where snakes are closing in, so every run looks a little different.
//   node tools/store-shots.mjs ipad-13      only that device (see DEVICES)
//   node tools/store-shots.mjs iap-review   only Apple's in-app purchase review screenshot
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  ({ chromium } = await import('/opt/node-tools/node_modules/playwright/index.mjs'));
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const web = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = join(root, path === '/' ? 'index.html' : path);
  if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
}).listen(0);
const base = `http://localhost:${web.address().port}/?debug`;

// A player about halfway through the game.
const SAVE = {
  seenHelp: true,
  adventure: { unlocked: 54, stars: Object.fromEntries(Array.from({ length: 53 }, (_, i) => [i + 1, [3, 3, 2, 3, 1, 3, 2][i % 7]])), best: {} },
  ledger: { me: { e: 640, s: 410 } },
  upgrades: { dash: 2, thorns: 2, rot: 1, hearts: 1 },
  skins: ['red', 'gold', 'green'], skin: 'red',
  best: { classic: { score: 48210, level: 17 } },
  stats: { runs: 212, snakes: 388, starsEarned: 640 },
  daily: { day: '', best: null, attempts: 0, streak: 6, lastDay: '' },
};

// Each store's required size, and the screen it's captured on.
const DEVICES = {
  'iphone-6.9': { out: [1320, 2868], viewport: { width: 440, height: 956 }, scale: 3 },
  'ipad-13': { out: [2064, 2752], viewport: { width: 1032, height: 1376 }, scale: 2 },
  'android-phone': { out: [1080, 1920], viewport: { width: 360, height: 640 }, scale: 3 },
};

async function home(page) {
  await page.goto(base);
  await page.waitForSelector('#screen-title.show');
  await page.waitForTimeout(500);
}
// Lets the AI play `level` until two snakes are closing in on the apple. The
// AI moves on to a random level when it clears one, so a scene that drifts
// off the level is played again.
async function play(page, level) {
  for (let attempt = 1; ; attempt++) {
    try { return await playOnce(page, level); } catch (e) { if (attempt >= 4) throw e; }
  }
}
async function playOnce(page, level) {
  await home(page);
  await page.click('#btn-play');
  await page.waitForSelector('#screen-map.show');
  await page.$eval(`#map-scroll .node[data-level="${level}"]`, el => el.click());
  await page.click('#lc-play');
  await page.waitForFunction(() => window.__game.state === 'play');
  await page.evaluate(() => { window.__game.demo = true; });
  await page.waitForTimeout(7000);
  const moment = (minSnakes, near, far) => page.waitForFunction(([level, minSnakes, near, far]) => {
    const g = window.__game;
    const heads = g.snakes.filter(s => !s.dead).map(s => s.body[0]);
    if (g.state !== 'play' || g.level !== level || heads.length < minSnakes) return false;
    const d = Math.min(...heads.map(h => Math.abs(h.x - g.apple.x) + Math.abs(h.y - g.apple.y)));
    return d >= near && d <= far;
  }, [level, minSnakes, near, far], { timeout: 25000, polling: 50 });
  // Two snakes closing in if it happens soon, otherwise any snake nearby.
  try { await moment(2, 2, 3); } catch { await moment(1, 2, 4); }
  // The AI doesn't score; show what a player would have by now.
  await page.evaluate(() => { window.__game.score = 6000 + Math.floor(Math.random() * 3000); });
  await page.waitForTimeout(60);
}
const SCENES = [
  { id: '1-play', caption: ['Snake, flipped.', 'You’re the apple!'], go: page => play(page, 52) },
  { id: '2-trap', caption: ['Trick snakes into walls,', 'thorns and their own tails'], go: page => play(page, 47) },
  {
    id: '3-map', caption: ['100 levels', 'across 10 worlds'],
    go: async page => { await home(page); await page.click('#btn-play'); await page.waitForSelector('#screen-map.show'); await page.waitForTimeout(600); },
  },
  {
    id: '4-daily', caption: ['A new Daily Run', 'and challenges every day'],
    go: async page => { await home(page); await page.click('#contracts .c-head'); await page.waitForTimeout(400); },
  },
  {
    id: '5-orchard', caption: ['Upgrade your apple,', 'collect skins'],
    go: async page => { await home(page); await page.click('#btn-orchard'); await page.click('.tab[data-tab="skins"]'); await page.waitForTimeout(400); },
  },
];

// Frames a raw capture: game-green background, a two-line caption, and the
// screen with a chunky outline like the game's buttons.
async function frame(page, png, [W, H], caption) {
  return page.evaluate(async ({ src, W, H, caption }) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    await document.fonts.load('700 40px Fredoka');
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#d8f3c4'); g.addColorStop(1, '#8fcf6c');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.globalAlpha = 0.1; x.fillStyle = '#fff';
    const cell = W / 8;
    for (let i = 0; i < 8; i++) for (let j = 0; j * cell < H; j++) if ((i + j) % 2) x.fillRect(i * cell, j * cell, cell, cell);
    x.globalAlpha = 1;
    const fs = Math.round(W * 0.072), top = H * 0.04;
    x.textAlign = 'center'; x.textBaseline = 'top'; x.lineJoin = 'round';
    caption.forEach((line, i) => {
      x.font = `700 ${fs}px Fredoka, sans-serif`;
      const y = top + i * fs * 1.15;
      x.lineWidth = fs * 0.16; x.strokeStyle = '#3a1f2b';
      if (i === 1) { x.strokeText(line, W / 2, y); x.fillStyle = '#e8392f'; } else x.fillStyle = '#3a1f2b';
      x.fillText(line, W / 2, y);
    });
    const capBottom = top + caption.length * fs * 1.15 + H * 0.025;
    const maxW = W * 0.86, maxH = H - capBottom - H * 0.035;
    const s = Math.min(maxW / img.width, maxH / img.height);
    const w = img.width * s, h = img.height * s, ix = (W - w) / 2, iy = capBottom;
    const r = W * 0.045, bw = W * 0.008;
    x.fillStyle = '#3a1f2b';
    x.beginPath(); x.roundRect(ix - bw, iy - bw + W * 0.014, w + bw * 2, h + bw * 2, r + bw); x.fill();
    x.beginPath(); x.roundRect(ix - bw, iy - bw, w + bw * 2, h + bw * 2, r + bw); x.fill();
    x.save(); x.beginPath(); x.roundRect(ix, iy, w, h, r); x.clip();
    x.drawImage(img, ix, iy, w, h);
    x.restore();
    return c.toDataURL('image/jpeg', 0.9);
  }, { src: `data:image/png;base64,${png.toString('base64')}`, W, H, caption });
}

// Play Store feature graphic (1024x500): the apple and the name.
async function featureGraphic(page) {
  await home(page);
  return page.evaluate(async () => {
    const { drawApple } = await import('/js/render.js');
    const { SKINS } = await import('/js/config.js');
    await document.fonts.load('700 40px Fredoka');
    const W = 1024, H = 500, c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#d8f3c4'); g.addColorStop(1, '#7cc35a');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.globalAlpha = 0.12; x.fillStyle = '#fff';
    for (let i = 0; i < 16; i++) for (let j = 0; j < 8; j++) if ((i + j) % 2) x.fillRect(i * 64, j * 64, 64, 64);
    x.globalAlpha = 1;
    const r = 150;
    x.fillStyle = 'rgba(0,0,0,0.16)';
    x.beginPath(); x.ellipse(270, 265 + r * 0.95, r * 0.8, r * 0.18, 0, 0, Math.PI * 2); x.fill();
    drawApple(x, 270, 265, r, { skin: SKINS[0], time: 0.6, look: { x: 0.6, y: 0.1 } });
    x.textAlign = 'left'; x.textBaseline = 'alphabetic'; x.lineJoin = 'round';
    x.font = '700 120px Fredoka, sans-serif';
    x.fillStyle = '#3a1f2b'; x.fillText('The', 480, 225);
    x.lineWidth = 18; x.strokeStyle = '#3a1f2b'; x.strokeText('Apple', 480, 345);
    x.fillStyle = '#e8392f'; x.fillText('Apple', 480, 345);
    x.font = '600 36px Fredoka, sans-serif'; x.fillStyle = '#3a1f2b';
    x.fillText('Snake, flipped. Don’t get eaten!', 484, 412, W - 484 - 36);
    return c.toDataURL('image/jpeg', 0.92);
  });
}

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const write = (file, dataUrl) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('wrote', file.replace(root + '/', ''));
};
const only = process.argv.slice(2);
for (const [name, d] of Object.entries(DEVICES)) {
  if (only.length && !only.includes(name)) continue;
  const ctx = await browser.newContext({ viewport: d.viewport, deviceScaleFactor: d.scale, isMobile: true, hasTouch: true });
  await ctx.addInitScript(save => { if (!localStorage.getItem('the-apple.save.v1')) localStorage.setItem('the-apple.save.v1', JSON.stringify(save)); }, SAVE);
  const page = await ctx.newPage();
  for (const scene of SCENES) {
    await scene.go(page);
    const png = await page.screenshot();
    write(join(root, 'store/screenshots', name, `${scene.id}.jpg`), await frame(page, png, d.out, scene.caption));
  }
  if (name === 'android-phone') write(join(root, 'store/feature-graphic.jpg'), await featureGraphic(page));
  await ctx.close();
}
// App Store Connect wants a screenshot of the purchase screen for the review
// of the in-app purchase: the free tier's purchase screen (via ?store), unframed.
if (!only.length || only.includes('iap-review')) {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await ctx.addInitScript(save => { if (!localStorage.getItem('the-apple.save.v1')) localStorage.setItem('the-apple.save.v1', JSON.stringify(save)); }, { ...SAVE, adventure: { unlocked: 21, stars: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, 3])), best: {} } });
  const page = await ctx.newPage();
  await page.goto(`${base}&store`);
  await page.waitForSelector('#screen-title.show');
  await page.click('#btn-endless');
  await page.waitForSelector('#screen-full.show');
  await page.waitForTimeout(500);
  const file = join(root, 'store/iap-review.png');
  writeFileSync(file, await page.screenshot());
  console.log('wrote', file.replace(root + '/', ''));
  await ctx.close();
}
await browser.close();
web.close();
