// Copies the game into www/ for the store app (Capacitor's webDir). The web
// version needs no build; this only picks the files the app ships and adds
// Capacitor's bridge script so js/platform.js can reach the native plugins.
//   npm run build            test build: Google's test ads
//   npm run build:release    store build: real ads; refuses while any AdMob ID
//                            is still one of Google's test IDs
// then npx cap sync (the npm scripts in package.json do both).
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const release = process.argv.includes('--release');
const out = join(root, 'www');
// sw.js stays out: the app already has every file on the phone.
const SHIP = ['index.html', 'favicon.svg', 'manifest.webmanifest', 'css', 'js', 'fonts', 'vendor', 'assets'];
const bridge = join(root, 'node_modules/@capacitor/core/dist/capacitor.js');

if (!existsSync(bridge)) {
  console.error('Missing @capacitor/core. Run `npm install` first.');
  process.exit(1);
}
// A store build must never ship Google's test ads (or real ads with a test app ID).
if (release) {
  const TEST = 'ca-app-pub-3940256099942544';
  const places = {
    'js/monetization.js (AD_UNITS)': 'js/monetization.js',
    'android/app/src/main/res/values/strings.xml (admob_app_id)': 'android/app/src/main/res/values/strings.xml',
    'ios/App/App/Info.plist (GADApplicationIdentifier)': 'ios/App/App/Info.plist',
  };
  const left = Object.entries(places).filter(([, f]) => {
    const text = readFileSync(join(root, f), 'utf8');
    return f.endsWith('monetization.js') ? /AD_UNITS[\s\S]*ca-app-pub-3940256099942544\//.test(text) : text.includes(TEST);
  }).map(([what]) => what);
  if (left.length) {
    console.error(`Release build stopped: these still have Google's test AdMob IDs (${TEST}):\n  ${left.join('\n  ')}\nPut your own AdMob IDs there first (STORE.md, "Ads").`);
    process.exit(1);
  }
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
if (release) writeFileSync(join(out, 'js/build-info.js'), '// Store build (written by tools/build-www.mjs --release).\nexport const RELEASE = true;\n');
console.log(`www/ ready (${release ? 'release: real ads' : 'test: Google test ads'})`);
