// The one place that knows whether the game is running in a browser or inside
// the App Store / Play Store app (a Capacitor shell around these same files).
// Game code calls these helpers and never touches a native API directly, so a
// new feature works in both without changes. In a browser every helper falls
// back to the plain web API.
const Cap = window.Capacitor;
export const isNative = !!(Cap && typeof Cap.isNativePlatform === 'function' && Cap.isNativePlatform());
export const os = isNative ? Cap.getPlatform() : 'web'; // 'ios' | 'android' | 'web'

const plugin = name => {
  if (!isNative || typeof Cap.registerPlugin !== 'function') return null;
  try { return Cap.registerPlugin(name); } catch { return null; }
};
const Preferences = plugin('Preferences');
const Haptics = plugin('Haptics');
const App = plugin('App');
const Share = plugin('Share');
const SplashScreen = plugin('SplashScreen');

// Native plugin calls must never take the game down: swallow any failure.
const safe = (fn, fallback) => {
  try { return Promise.resolve(fn()).catch(() => fallback); } catch { return Promise.resolve(fallback); }
};

// ------------------------------------------------------------------ storage
// Synchronous reads from an in-memory copy, writes go everywhere. In the app,
// the WebView's localStorage can be wiped by the OS when the phone is low on
// space, so Preferences (UserDefaults / SharedPreferences, which are part of
// device backups) holds the real copy and is loaded before the game starts.
const PREFIX = 'the-apple.';
const memory = new Map();
export const storage = {
  get(key) {
    if (memory.has(key)) return memory.get(key);
    let v = null;
    try { v = localStorage.getItem(key); } catch { /* storage blocked */ }
    if (v !== null) memory.set(key, v);
    return v;
  },
  set(key, value) {
    memory.set(key, value);
    try { localStorage.setItem(key, value); } catch { /* storage blocked */ }
    if (Preferences) safe(() => Preferences.set({ key, value }));
  },
};

async function restore() {
  if (!Preferences) return;
  const { keys = [] } = await Preferences.keys();
  const saved = new Set(keys);
  await Promise.all(keys.filter(k => k.startsWith(PREFIX)).map(async key => {
    const { value } = await Preferences.get({ key });
    if (value == null) return;
    memory.set(key, value);
    try { localStorage.setItem(key, value); } catch { /* storage blocked */ }
  }));
  // First launch after an update that added Preferences: copy the old saves over.
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(PREFIX) && !saved.has(key)) await Preferences.set({ key, value: localStorage.getItem(key) });
    }
  } catch { /* storage blocked */ }
}

// Resolves once saved progress is readable. Never blocks the game for long,
// even if the native side misbehaves.
export const ready = Promise.race([
  safe(restore),
  new Promise(resolve => setTimeout(resolve, 1500)),
]);

// ------------------------------------------------------------------ haptics
// A named feel plus the browser vibration pattern for it. iPhones only get
// haptics in the app (Safari has no vibration API).
const canVibrate = typeof navigator.vibrate === 'function';
export const hasHaptics = !!Haptics || canVibrate;
const NATIVE_FEEL = {
  light: ['impact', { style: 'LIGHT' }],
  medium: ['impact', { style: 'MEDIUM' }],
  heavy: ['impact', { style: 'HEAVY' }],
  success: ['notification', { type: 'SUCCESS' }],
  warning: ['notification', { type: 'WARNING' }],
  error: ['notification', { type: 'ERROR' }],
};
export function haptic(feel, pattern) {
  if (Haptics) {
    const [method, opts] = NATIVE_FEEL[feel] || NATIVE_FEEL.medium;
    safe(() => Haptics[method](opts));
  } else if (canVibrate) {
    try { navigator.vibrate(pattern); } catch { /* unsupported */ }
  }
}

// ------------------------------------------------------------------ sharing
// Phones open the share sheet; computers copy to the clipboard.
const touch = matchMedia('(pointer: coarse)').matches;
export const sharesWithSheet = !!Share || (!!navigator.share && touch);
// Resolves 'shared', 'copied' or 'cancelled'; throws if nothing worked.
export async function share({ text, url }) {
  const full = url ? `${text}\n${url}` : text;
  if (Share) {
    try { await Share.share({ text, url }); return 'shared'; } catch { return 'cancelled'; }
  }
  if (sharesWithSheet) {
    try { await navigator.share(url ? { text, url } : { text }); return 'shared'; } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
    }
  }
  await navigator.clipboard.writeText(full);
  return 'copied';
}

// Links meant for other devices. Inside the app the page's own address is
// capacitor://localhost, which means nothing anywhere else.
const WEB_HOME = 'https://mattlavergne.com/apple/_app/';
export const webLink = hash => (isNative ? WEB_HOME : location.origin + location.pathname) + hash;

// ------------------------------------------------------------------ app life
// cb(active): false when the game goes to the background (home button, app
// switcher, phone call, screen lock), true when it comes back.
export function onAppState(cb) {
  let last = true;
  const fire = active => { if (active !== last) { last = active; cb(active); } };
  document.addEventListener('visibilitychange', () => fire(!document.hidden));
  if (App) safe(() => App.addListener('appStateChange', s => fire(!!s.isActive)));
}

// Android's back button / back gesture. Registering a handler replaces the
// default (which would close the app from any screen).
export function onBack(cb) {
  if (App) safe(() => App.addListener('backButton', () => cb()));
}
// Back on the home screen: send the app to the background like other games do.
export const leaveApp = () => { if (App) safe(() => App.minimizeApp()); };

// Hide the launch screen once the first frame is on screen. The timer is a
// safety net: a launch screen that never goes away looks like a frozen app.
let splashUp = !!SplashScreen;
export function appReady() {
  if (!splashUp) return;
  splashUp = false;
  safe(() => SplashScreen.hide({ fadeOutDuration: 200 }));
}
if (splashUp) setTimeout(appReady, 4000);
