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

// AdMob ad unit IDs. These are Google's test IDs; `npm run build:release`
// refuses to build until they (and the app IDs in the Android and iOS
// projects) are your own. See STORE.md, "Ads".
export const AD_UNITS = {
  android: {
    banner: 'ca-app-pub-3940256099942544/9214589741',
    rewarded: 'ca-app-pub-3940256099942544/5224354917',
  },
  ios: {
    banner: 'ca-app-pub-3940256099942544/2435281174',
    rewarded: 'ca-app-pub-3940256099942544/1712485313',
  },
};
