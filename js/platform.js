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

// ------------------------------------------------------------------ test site
// The web version is the developer's private test copy; players get the app.
// Its test tools (js/admin.js, left out of the app) can switch to a separate
// test save under its own keys, so testing never touches real progress or its
// sync code. In the app `admin` is always empty.
const ADMIN_KEY = 'the-apple-admin';
export const admin = isNative ? {} : (() => {
  try { return JSON.parse(localStorage.getItem(ADMIN_KEY)) || {}; } catch { return {}; }
})();
export function setAdmin(changes) {
  if (isNative) return;
  Object.assign(admin, changes);
  try { localStorage.setItem(ADMIN_KEY, JSON.stringify(admin)); } catch { /* storage blocked */ }
}

// ------------------------------------------------------------------ storage
// Synchronous reads and writes, with an in-memory copy for when storage is
// blocked. Reads go to localStorage first so a tab sees what another tab just
// saved. In the app, the WebView's localStorage can be wiped by the OS when
// the phone is low on space, so Preferences (UserDefaults / SharedPreferences,
// which are part of device backups) holds the real copy and is loaded back
// before the game starts.
const PREFIX = 'the-apple.';
const TEST_PREFIX = 'the-apple-test.';
const keyFor = key => (admin.testSave && key.startsWith(PREFIX) ? TEST_PREFIX + key.slice(PREFIX.length) : key);
const memory = new Map();
export const storage = {
  // The name a key is really stored under (it differs in the test save).
  key: keyFor,
  get(key) {
    key = keyFor(key);
    try {
      const v = localStorage.getItem(key);
      if (v !== null) return v;
    } catch { /* storage blocked */ }
    return memory.has(key) ? memory.get(key) : null;
  },
  set(key, value) {
    key = keyFor(key);
    memory.set(key, value);
    try { localStorage.setItem(key, value); } catch { /* storage blocked */ }
    if (Preferences) safe(() => Preferences.set({ key, value }));
  },
  remove(key) {
    key = keyFor(key);
    memory.delete(key);
    try { localStorage.removeItem(key); } catch { /* storage blocked */ }
    if (Preferences) safe(() => Preferences.remove({ key }));
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

// ------------------------------------------------------------------ purchases
// The store app sells the full game as a one-time purchase; the web version
// has everything. The test tools' "Free app" setting (or ?store in the web
// address) pretends to be the store app (free tier, a pretend Buy button, a
// placeholder ad) so the paywall and the ad layout can be tried in a browser.
const Purchases = plugin('NativePurchases');
const AdMob = plugin('AdMob');
export const storeSim = !isNative && (new URLSearchParams(location.search).has('store') || !!admin.freeApp);
export const hasStore = isNative || storeSim;

// A store record proves the purchase; Android also reports pending payments.
const validPurchase = (t, id) => !!t && t.productIdentifier === id && !t.revocationDate &&
  (os !== 'android' || String(t.purchaseState) === '1');
const OWNED_KEY = 'the-apple.full';

export const store = {
  productId: '',
  price: '',
  // Only ever granted, never taken away by the app itself: if the store is
  // unreachable or signed out, a player who paid keeps what they paid for.
  owned: !hasStore,
  listeners: new Set(),
  // Call after `ready`, once native storage has been restored.
  load() { if (storage.get(OWNED_KEY) === '1') this.owned = true; },
  // cb('price') when the store's local price arrives, cb('owned') on purchase.
  onChange(cb) { this.listeners.add(cb); },
  grant() {
    if (this.owned) return;
    this.owned = true;
    storage.set(OWNED_KEY, '1');
    this.listeners.forEach(cb => cb('owned'));
  },
  async init({ productId, price }) {
    this.productId = productId;
    this.price = price;
    if (!Purchases) return;
    try {
      const { products = [] } = await Purchases.getProducts({ productIdentifiers: [productId], productType: 'inapp' });
      const p = products.find(x => x.identifier === productId);
      if (p?.priceString) { this.price = p.priceString; this.listeners.forEach(cb => cb('price')); }
    } catch { /* offline: keep the fallback price */ }
    if (await this.check()) this.grant();
    // Purchases that finish later (Ask to Buy, slow payment methods).
    safe(() => Purchases.addListener('transactionUpdated', t => { if (validPurchase(t, this.productId)) this.grant(); }));
  },
  async check() {
    try {
      const { purchases = [] } = await Purchases.getPurchases(os === 'ios' ? { onlyCurrentEntitlements: true } : { productType: 'inapp' });
      return purchases.some(t => validPurchase(t, this.productId));
    } catch {
      return false;
    }
  },
  // Resolves 'bought' | 'pending' | 'cancelled'; throws with a message to show.
  async buy() {
    if (storeSim) {
      if (!confirm(`Pretend purchase (web test only): unlock the full game for ${this.price}?`)) return 'cancelled';
      this.grant();
      return 'bought';
    }
    if (!Purchases) throw new Error('Purchases aren’t available on this device.');
    try {
      const t = await Purchases.purchaseProduct({ productIdentifier: this.productId, productType: 'inapp' });
      if (validPurchase(t, this.productId)) { this.grant(); return 'bought'; }
      if (t && String(t.purchaseState) === '2') return 'pending';
      throw new Error('The purchase didn’t go through. You haven’t been charged.');
    } catch (e) {
      if (/cancel/i.test(`${e?.message} ${e?.code}`)) return 'cancelled';
      throw e;
    }
  },
  // Apple requires a way to get a purchase back on a new device.
  async restore() {
    if (storeSim) return this.owned;
    if (!Purchases) return false;
    await safe(() => Purchases.restorePurchases());
    const ok = await this.check();
    if (ok) this.grant();
    return ok;
  },
};

// ------------------------------------------------------------------ ads
// Google AdMob, only in the store app and only until the full game is bought.
// Ads are never personalized and are limited to general-audience content.
// The banner sits at the bottom of menu screens; the game reserves that space
// through the --ad-h CSS variable so nothing is hidden under it.
const setAdSpace = px => {
  document.documentElement.style.setProperty('--ad-h', `${Math.max(0, Math.round(px))}px`);
  document.documentElement.classList.toggle('ad-on', px > 0);
};
export const ads = {
  ready: false,
  bannerOn: false,
  bannerLoaded: false,
  bannerHeight: 0,
  rewardReady: null,
  async init({ release, units, childDirected, testDevices = [] }) {
    this.release = release;
    this.units = units[os] || {};
    if (storeSim) { this.ready = true; return; }
    if (!AdMob) return;
    try {
      // Google's consent form for players in the EU and UK; a no-op elsewhere.
      let info = await AdMob.requestConsentInfo({ tagForUnderAgeOfConsent: childDirected });
      if (info.isConsentFormAvailable && info.status === 'REQUIRED') info = await AdMob.showConsentForm();
      if (info.canRequestAds === false) return;
      await AdMob.initialize({
        // Test builds: Google's test ads everywhere. Store builds: real ads,
        // except on the developer's own devices (monetization.js TEST_DEVICES).
        initializeForTesting: !release || testDevices.length > 0,
        testingDevices: testDevices,
        maxAdContentRating: 'General',
        tagForChildDirectedTreatment: childDirected,
        tagForUnderAgeOfConsent: childDirected,
      });
      safe(() => AdMob.addListener('bannerAdSizeChanged', s => {
        this.bannerHeight = s.height || 0;
        if (this.bannerOn) setAdSpace(this.bannerHeight);
      }));
      safe(() => AdMob.addListener('bannerAdFailedToLoad', () => { this.bannerHeight = 0; setAdSpace(0); }));
      this.ready = true;
    } catch { /* no ads this session */ }
  },
  // Show or hide the bottom banner (the game calls this on every screen change).
  banner(show) {
    show = show && this.ready;
    if (show === this.bannerOn) return;
    this.bannerOn = show;
    if (storeSim) return simBanner(show);
    if (!AdMob) return;
    if (show && !this.bannerLoaded) {
      this.bannerLoaded = true;
      safe(() => AdMob.showBanner({
        adId: this.units.banner, adSize: 'ADAPTIVE_BANNER', position: 'BOTTOM_CENTER', margin: 0,
        isTesting: !this.release, npa: true,
      }));
    } else if (show) {
      safe(() => AdMob.resumeBanner());
      setAdSpace(this.bannerHeight);
    } else {
      safe(() => AdMob.hideBanner());
      setAdSpace(0);
    }
  },
  // Gone for good once the full game is bought.
  removeBanner() {
    this.banner(false);
    this.ready = false;
    if (AdMob && this.bannerLoaded) safe(() => AdMob.removeBanner());
  },
  // Load a rewarded ad ahead of time so it plays the moment it's asked for.
  prepareRewarded() {
    if (!this.ready || storeSim || !AdMob) return;
    this.rewardReady ||= AdMob.prepareRewardVideoAd({ adId: this.units.rewarded, isTesting: !this.release, npa: true })
      .then(() => true, () => { this.rewardReady = null; return false; });
  },
  // Plays a rewarded ad; resolves true only if the player earned the reward.
  async rewarded() {
    if (storeSim) return confirm('Pretend ad (web test only): did you watch it to the end?');
    if (!this.ready || !AdMob) return false;
    this.prepareRewarded();
    const loaded = await this.rewardReady;
    this.rewardReady = null;
    if (!loaded) return false;
    try { return !!(await AdMob.showRewardVideoAd()); } catch { return false; }
  },
};
// The web stand-in for the banner, to check the layout.
function simBanner(show) {
  let el = document.getElementById('ad-sim');
  if (show && !el) {
    el = document.createElement('div');
    el.id = 'ad-sim';
    el.textContent = 'Ad banner (test)';
    document.body.appendChild(el);
  }
  if (el) el.hidden = !show;
  setAdSpace(show ? 56 : 0);
}
