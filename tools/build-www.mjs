// Copies the game into www/ for the store app (Capacitor's webDir). The web
// version needs no build; this only picks the files the app ships and adds
// Capacitor's bridge script so js/platform.js can reach the native plugins.
//   npm run build            test build: Google's test ads
//   npm run build:release    store build: real ads; refuses while any AdMob ID
//                            is missing, malformed or still Google's test ID
// then npx cap sync (the npm scripts in package.json do both).
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const release = process.argv.includes('--release');
const out = join(root, 'www');
// sw.js stays out: the app already has every file on the phone.
const SHIP = ['index.html', 'privacy.html', 'favicon.svg', 'manifest.webmanifest', 'css', 'js', 'fonts', 'assets'];
const bridge = join(root, 'node_modules/@capacitor/core/dist/capacitor.js');

if (!existsSync(bridge)) {
  console.error('Missing @capacitor/core. Run `npm install` first.');
  process.exit(1);
}
// A store build must never ship Google's test ads (or real ads with a test app
// ID), and every AdMob ID must be well formed and from the same AdMob account.
if (release) {
  const TEST_PUB = '3940256099942544';
  const read = f => readFileSync(join(root, f), 'utf8');
  const { AD_UNITS, TEST_DEVICES } = await import('../js/monetization.js');
  const ids = [
    ...Object.entries(AD_UNITS).flatMap(([os, u]) => Object.entries(u).map(([kind, id]) => [`js/monetization.js: AD_UNITS.${os}.${kind}`, id, '/'])),
    ['android/app/src/main/res/values/strings.xml: admob_app_id', read('android/app/src/main/res/values/strings.xml').match(/name="admob_app_id">([^<]*)</)?.[1], '~'],
    ['ios/App/App/Info.plist: GADApplicationIdentifier', read('ios/App/App/Info.plist').match(/<key>GADApplicationIdentifier<\/key>\s*<string>([^<]*)</)?.[1], '~'],
  ];
  const pubOf = id => /^ca-app-pub-(\d{16})[/~]\d{10}$/.exec(id || '')?.[1];
  const pubs = new Set(ids.map(([, id]) => pubOf(id)).filter(p => p && p !== TEST_PUB));
  const problems = ids.flatMap(([where, id, sep]) => {
    const pub = pubOf(id);
    if (!pub || !id.includes(sep)) return [`${where} = ${id ?? '(missing)'}: not an AdMob ${sep === '~' ? 'app ID (ca-app-pub-…~…)' : 'ad unit ID (ca-app-pub-…/…)'}`];
    if (pub === TEST_PUB) return [`${where}: still Google's test ID`];
    return [];
  });
  for (const d of TEST_DEVICES) if (!/^[0-9a-f]{32}$/i.test(d)) problems.push(`js/monetization.js: TEST_DEVICES has "${d}", which isn't a device ID (32 letters and digits from Xcode's console)`);
  if (pubs.size > 1) problems.push(`the IDs come from different AdMob accounts (pub-${[...pubs].join(', pub-')})`);
  const units = ids.filter(([, , sep]) => sep === '/').map(([, id]) => id);
  if (new Set(units).size < units.length) problems.push('two ad units share the same ID');
  if (problems.length) {
    console.error(`Release build stopped:\n  ${problems.join('\n  ')}\nSee STORE.md, "Ads".`);
    process.exit(1);
  }
}
rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const f of SHIP) if (existsSync(join(root, f))) cpSync(join(root, f), join(out, f), { recursive: true });
// The web copy's test tools never ship in the app (js/main.js only loads them
// outside the app, so nothing misses them).
rmSync(join(out, 'js/admin.js'));
cpSync(bridge, join(out, 'capacitor.js'));

const html = join(out, 'index.html');
const page = readFileSync(html, 'utf8');
const tag = '<script type="module" src="js/main.js"></script>';
if (!page.includes(tag)) throw new Error('index.html no longer loads js/main.js the expected way');
writeFileSync(html, page.replace(tag, `<script src="capacitor.js"></script>\n  ${tag}`));
if (release) writeFileSync(join(out, 'js/build-info.js'), '// Store build (written by tools/build-www.mjs --release).\nexport const RELEASE = true;\n');
console.log(`www/ ready (${release ? 'release: real ads' : 'test: Google test ads'})`);
