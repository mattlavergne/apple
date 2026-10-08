// Which kind of build this is. The web version and test app builds use this
// file as is; `npm run build:release` swaps in a copy with RELEASE = true for
// the builds that go to the App Store and Google Play (real ads instead of
// Google's test ads).
export const RELEASE = false;
