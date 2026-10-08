// How the store app makes money, in one place.
//   Free: Adventure levels 1-20 and the Daily Run, with ads on menu screens
//   (never during play) and an optional "watch an ad to double your stars".
//   One purchase ($2.99): all 100 levels and Endless, and no ads.
// The web version is your test copy: everything unlocked, no ads.
// js/platform.js does the talking to the App Store / Google Play and AdMob.

export const FREE_LEVELS = 20;
export const PRODUCT_ID = 'com.mattlavergne.theapple.full';
export const FALLBACK_PRICE = '$2.99'; // shown until the store answers with the local price

// Google's ads for kids are stricter. If the Play Console "target audience"
// includes under-13s, set this to true (fewer, kid-safe ads only).
export const CHILD_DIRECTED = false;

// AdMob ad unit IDs (publisher pub-2529441843817238). Test builds
// (`npm run build`) still only get Google's test ads: js/platform.js asks with
// isTesting, and the AdMob plugin then swaps in Google's test ad units, so
// testing on your own phone never shows or counts real ads. Only
// `npm run build:release` asks for these, and it refuses to build until the
// Android and iOS app IDs are your own too. See STORE.md, "Ads".
export const AD_UNITS = {
  android: {
    banner: 'ca-app-pub-2529441843817238/4191001722',
    rewarded: 'ca-app-pub-2529441843817238/4250711475',
  },
  ios: {
    banner: 'ca-app-pub-2529441843817238/4079321081',
    rewarded: 'ca-app-pub-2529441843817238/3735706152',
  },
};
