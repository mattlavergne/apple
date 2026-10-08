// Copies the game into www/ for the store app (Capacitor's webDir). The web
// version needs no build; this only picks the files the app ships and adds
// Capacitor's bridge script so js/platform.js can reach the native plugins.
//   npm run build        then   npx cap sync
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'www');
// sw.js stays out: the app already has every file on the phone.
const SHIP = ['index.html', 'favicon.svg', 'manifest.webmanifest', 'css', 'js', 'fonts', 'vendor', 'assets'];
const bridge = join(root, 'node_modules/@capacitor/core/dist/capacitor.js');

if (!existsSync(bridge)) {
  console.error('Missing @capacitor/core. Run `npm install` first.');
  process.exit(1);
}
rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const f of SHIP) if (existsSync(join(root, f))) cpSync(join(root, f), join(out, f), { recursive: true });
cpSync(bridge, join(out, 'capacitor.js'));

const html = join(out, 'index.html');
const page = readFileSync(html, 'utf8');
const tag = '<script type="module" src="js/main.js"></script>';
if (!page.includes(tag)) throw new Error('index.html no longer loads js/main.js the expected way');
writeFileSync(html, page.replace(tag, `<script src="capacitor.js"></script>\n  ${tag}`));
console.log('www/ ready');
