// Draws the app icons and launch screens from the in-game apple (render.js),
// so the art always matches the game. Needs Playwright with Chromium.
//   node tools/make-icons.mjs            writes resources/ and the web icons in assets/
//   npx @capacitor/assets generate --assetPath resources   then fans resources/ out to ios/ and android/
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  ({ chromium } = await import('/opt/node-tools/node_modules/playwright/index.mjs'));
}
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage();
const TYPES = { '.js': 'text/javascript', '.html': 'text/html' };
await page.route('http://art.local/**', route => {
  const path = new URL(route.request().url()).pathname;
  if (path === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' });
  route.fulfill({ contentType: TYPES[extname(path)] || 'application/octet-stream', body: readFileSync(join(root, path)) });
});
await page.goto('http://art.local/');

const out = await page.evaluate(async () => {
  const { drawApple } = await import('/js/render.js');
  const { SKINS } = await import('/js/config.js');
  const canvas = size => { const c = document.createElement('canvas'); c.width = c.height = size; return [c, c.getContext('2d')]; };
  // Grass: the title screen's green with a faint checkerboard.
  const grass = (x, size, cells = 6) => {
    const g = x.createLinearGradient(0, 0, 0, size);
    g.addColorStop(0, '#bfe9a0'); g.addColorStop(1, '#6fbf4a');
    x.fillStyle = g; x.fillRect(0, 0, size, size);
    x.globalAlpha = 0.12; x.fillStyle = '#ffffff';
    const cell = size / cells;
    for (let i = 0; i < cells; i++) for (let j = 0; j < cells; j++) if ((i + j) % 2) x.fillRect(i * cell, j * cell, cell, cell);
    x.globalAlpha = 1;
  };
  // pad: empty margin around the apple as a share of the size.
  const apple = (x, size, pad) => {
    const r = size * (0.5 - pad) * 0.78;
    x.fillStyle = 'rgba(0,0,0,0.18)';
    x.beginPath(); x.ellipse(size / 2, size / 2 + r * 0.95, r * 0.8, r * 0.18, 0, 0, Math.PI * 2); x.fill();
    drawApple(x, size / 2, size / 2 + r * 0.12, r, { skin: SKINS[0], time: 0.6, look: { x: 0.4, y: 0.2 } });
  };
  const png = c => c.toDataURL('image/png');
  const icon = (size, pad) => { const [c, x] = canvas(size); grass(x, size); apple(x, size, pad); return png(c); };
  // Android adaptive icons: a transparent apple layer over a grass layer.
  // @capacitor/assets insets both into the launcher's visible 72dp, so the
  // apple only needs to clear the round mask inside that.
  const fg = () => { const [c, x] = canvas(1024); apple(x, 1024, 0.12); return png(c); };
  const bg = () => { const [c, x] = canvas(1024); grass(x, 1024); return png(c); };
  // Launch screen: the game's background, with the apple in the middle.
  const splash = () => {
    const S = 2732, [c, x] = canvas(S);
    const g = x.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, '#d8f3c4'); g.addColorStop(1, '#a9dd8a');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    const r = 260;
    x.fillStyle = 'rgba(0,0,0,0.12)';
    x.beginPath(); x.ellipse(S / 2, S / 2 + r * 0.95, r * 0.8, r * 0.18, 0, 0, Math.PI * 2); x.fill();
    drawApple(x, S / 2, S / 2 + r * 0.12, r, { skin: SKINS[0], time: 0.6, look: { x: 0.4, y: 0.2 } });
    return png(c);
  };
  return {
    'resources/icon-only.png': icon(1024, 0.08),
    'resources/icon-foreground.png': fg(),
    'resources/icon-background.png': bg(),
    'resources/splash.png': splash(),
    'assets/icon-192.png': icon(192, 0.08),
    'assets/icon-512.png': icon(512, 0.08),
    'assets/icon-maskable-512.png': icon(512, 0.2),
  };
});
mkdirSync(join(root, 'resources'), { recursive: true });
for (const [file, data] of Object.entries(out)) writeFileSync(join(root, file), Buffer.from(data.split(',')[1], 'base64'));
await browser.close();
console.log(`wrote ${Object.keys(out).length} images`);
