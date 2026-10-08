# Shipping The Apple to the App Store and Google Play

The store app is the same web game in a native shell ([Capacitor](https://capacitorjs.com)). There is one codebase: `index.html`, `css/` and `js/` run both the website and the apps. The `ios/` and `android/` folders are the native projects, generated once and checked in.

## Rule for future features

Anything that touches the device goes through **`js/platform.js`**: saving, haptics, sharing, the back button, going to the background, the launch screen, links to other devices. Game code never calls `localStorage`, `navigator.vibrate`, `navigator.share` or a Capacitor plugin directly. Follow that, and new levels, modes, art and sounds work in the browser and both apps with no extra work. Also keep everything local: no CDN scripts, fonts or images (the app must work offline and App Review tests it that way).

After changing the game, `node tools/native-smoke.mjs` (after `npm run build`) checks the app-side behavior in a browser with a fake native bridge.

## What's already done

| | |
|---|---|
| Saves | Kept in native storage (iOS UserDefaults / Android SharedPreferences, included in device backups), not only in the WebView's localStorage, which the OS may wipe when space runs low. Older WebView-only saves are copied over automatically. |
| Haptics | Native haptics on iPhone and Android (Safari has none). Each game event has its own feel (light tap for close calls, error buzz for a bite, success for contracts). |
| Back button | Android back steps out one screen; during play it pauses; on the title it sends the app to the background. |
| Background | Pauses the game, silences audio, saves, and sends any unsynced progress. |
| Audio | In the app, sound follows the ringer switch and mixes with the player's own music, the way games are expected to behave on iOS. The website keeps playing through the switch (that fixed "no sound" in Safari). |
| Screen | Status bar hidden, notch and home indicator handled. Phones are locked to portrait; iPads and Android tablets rotate freely. |
| Offline | Font and QR code library are bundled. No network needed except for Sync. |
| Launch | Icon, Android adaptive icon and launch screen drawn from the in-game apple (`tools/make-icons.mjs` → `resources/` → `npx @capacitor/assets generate --assetPath resources`). |
| Privacy | `privacy.html` (at https://mattlavergne.github.io/apple/privacy.html once merged, linked from How to play). No ads, analytics, tracking or accounts. |
| Sync | The server already accepts requests from the apps (`capacitor://localhost`, `https://localhost`). |
| Android | Verified: the debug APK builds (targets Android 16 / API 36; permissions are Internet and Vibrate only). |

## Decisions to make before submitting

1. **Store name.** The home-screen label is "The Apple" (`capacitor.config.json`). The store listing name is set separately in App Store Connect / Play Console. "The Apple" alone is hard to find in search (Apple's own apps own that query) and invites a trademark question in review. A listing name that makes the fruit and the game obvious, like *The Apple: Snake in Reverse*, avoids both.
2. **App ID.** `com.mattlavergne.theapple`. It can never change after the first upload. Change it now (in `capacitor.config.json`, `android/app/build.gradle` and the Xcode project) if you want something else.
3. **Money: decided.** The app is free with ads, and one purchase unlocks the full game. It's built; see [Money](#money-free-with-ads-one-purchase) for the account setup it needs.
4. **iPad.** The app currently supports iPad (it plays well in landscape). That means also uploading iPad screenshots. To skip that, set Targeted Device Family to iPhone only in Xcode.
5. **Kids category: probably not.** The game is fine for a 4+ rating without being *in* Apple's Kids category. That category adds rules, such as a parental gate before any link that leaves the app (the privacy link counts).

**Contact details for both stores:** support email `contact@mattlavergne.com` (also in the privacy policy). Support URL: https://mattlavergne.github.io/apple/privacy.html#contact.

## Building

```sh
npm install
npm run sync        # copies the game into www/ and into both native projects
```

Run `npm run sync` after every game change, before building the apps.

**Android** (Windows, Mac or Linux): install [Android Studio](https://developer.android.com/studio), run `npm run android`, then *Build → Generate Signed App Bundle* (.aab). Create an upload key when asked and back it up (with Play App Signing, Google holds the real signing key).

**iOS** needs Xcode, which only runs on a Mac. On your Mac:

1. Install **Xcode** from the Mac App Store (it's big, so allow an hour), open it once so it finishes installing, then install **Node.js** (the LTS version from nodejs.org).
2. In Terminal:
   ```sh
   git clone https://github.com/mattlavergne/apple.git
   cd apple
   npm install
   npm run ios
   ```
   Xcode opens with the app.
3. **Try it on your iPhone (free, no developer account needed yet):**
   1. Plug in the phone and pick it as the run destination at the top of Xcode.
   2. Under *App → Signing & Capabilities*, set **Team** to your Apple ID (Xcode → Settings → Accounts to add it), then press ▶.
   3. The first time, the iPhone needs two settings: *Settings → Privacy & Security → Developer Mode* turned on, and the developer trusted under *Settings → General → VPN & Device Management*.
   4. A free Apple ID's install lasts 7 days.
4. **Ship it (after joining the Apple Developer Program):**
   1. In App Store Connect, *Apps → + → New App*, with bundle ID `com.mattlavergne.theapple`.
   2. In Xcode, set Team to the paid team, then *Product → Archive → Distribute App → App Store Connect → Upload*.
   3. The build shows up under *TestFlight* in about 15 minutes. Add yourself as a tester and install it with the TestFlight app.
   4. When it's ready, attach the build to the version in App Store Connect and submit for review.

Before each release, bump the version: `versionCode` / `versionName` in `android/app/build.gradle`, and *Version* / *Build* in Xcode.

**Store listing:** the copy, screenshots and Play feature graphic are ready in [`store/`](store/listing.md). `node tools/store-shots.mjs` regenerates the images from the current game.

## Money: free with ads, one purchase

**What players get:**
- **Free:** Adventure levels 1–20 and the Daily Run.
  - A banner ad sits at the bottom of menu screens. It never shows during play, while paused or on the purchase screen.
  - The level-complete screen offers an optional ad for bonus stars.
- **The full game ($2.99, one time):** all 100 levels, Endless mode, and no ads.
  - Level 21, the locked worlds and the Endless button lead to the purchase screen, which has Buy, *Restore purchase* and *Not now*. *Restore purchase* is also on the How to play screen; Apple requires a restore option.
- **The web version** (your test copy) has everything and no ads.

**Where the settings live:**
- Everything is in [`js/monetization.js`](js/monetization.js): the free level count, product ID, fallback price, ad unit IDs and the child-directed switch.
- The code is `js/platform.js` (`store`, `ads`).
- Purchases use the [`@capgo/native-purchases`](https://github.com/Cap-go/capacitor-native-purchases) plugin, which talks to Apple and Google directly with no third-party purchase service. Ads use [`@capacitor-community/admob`](https://github.com/capacitor-community/admob).

**Safety rules:**
- **A purchase is only ever granted, never taken away by the app.** If the store is offline or signed out, a paying player keeps the full game.
- **A reinstall restores the purchase automatically** from the store account.
- **Store builds can't ship test ads.** `npm run release:ios` and `npm run release:android` refuse to build while any AdMob ID is still one of Google's test IDs.
- **Test builds always show Google's test ads.** Never tap real ads in your own app: Google bans accounts for it.

### Ads: set up AdMob

1. Sign up at [admob.google.com](https://admob.google.com) with your Google account, and add payment details there.
2. *Apps → Add app*, twice (Android, then iOS). Each one gets an **app ID**, which looks like `ca-app-pub-1234…~5678`.
3. In each app, create two ad units: **Banner** and **Rewarded**. Each gets an **ad unit ID**, which looks like `ca-app-pub-1234…/5678`.
4. Put your IDs in three places:
   - the four ad unit IDs → `js/monetization.js` (`AD_UNITS`);
   - the Android app ID → `android/app/src/main/res/values/strings.xml` (`admob_app_id`);
   - the iOS app ID → `ios/App/App/Info.plist` (`GADApplicationIdentifier`).
5. **app-ads.txt:** AdMob gives you a one-line file. It must be served at `https://mattlavergne.com/app-ads.txt`, which means the website listed on your store pages. Send me the line and I'll add it to Landing-Page's `public/`.
6. **Kids:** if the Play Console *Target audience* includes under-13s, set `CHILD_DIRECTED = true` in `js/monetization.js`. Google then only shows kid-safe ads, which means fewer ads and less money.

### Purchases: set up the $2.99 unlock

The product ID is the same in both stores: `com.mattlavergne.theapple.full`.

- **App Store Connect:**
  1. *Business*: sign the Paid Apps agreement and add banking and tax details. Purchases don't work until this is done.
  2. Open the app, then *In-App Purchases → + → Non-Consumable*.
  3. Use the product ID above, price $2.99, a short name and description, and a screenshot of the purchase screen for the reviewer.
  4. Submit it together with the app version.
- **Play Console:**
  1. Set up a payments profile.
  2. Upload a build to *Internal testing* first. Google only lets you create products once a build with billing is uploaded.
  3. *Monetize → Products → In-app products → Create product*, with the same ID and $2.99. Activate it.
- **Testing purchases without paying:**
  - *iPhone:* purchases in TestFlight builds are free sandbox purchases.
  - *Android:* add your Google account under *Settings → License testing*, and install from the internal testing track.

## Test vs. production

There are three kinds of builds:

| | Who | Ads | Purchases | Sync server |
|---|---|---|---|---|
| **Web** (GitHub Pages, mattlavergne.com/apple) | You, for trying changes | None, everything unlocked. Add `?store` to the address to preview the free app's paywall and ad layout | Pretend | Production |
| **Test app builds** (`npm run android` / `npm run ios`, TestFlight, Play internal testing) | You and your testers | Google's test ads | Store sandbox (free) | Production |
| **Store builds** (`npm run release:android` / `npm run release:ios`) | Everyone | Real | Real | Production |

**Every release goes the same way:**
1. Check the change on the web version.
2. Make a test build and play it on your phone through TestFlight or Play internal testing.
3. Make the store build and submit it.
4. On Google Play, use a staged rollout (for example 20% of players first).

**There's no separate test sync server, on purpose:**
- **Server changes are already tested before they deploy.** `tools/sync-fuzz.mjs` and `tools/sync-e2e.mjs` run the real server code against a real database.
- **A bad server deploy can be undone in one click:** Cloudflare → Workers → *Deployments* → *Rollback*.
- **Saves can be restored too.** D1 can restore the whole database to an earlier point in time (*Time Travel*), and each save also keeps its own history.
- **When it's worth adding one:** if the sync server grows (accounts, leaderboards), add a staging copy of the Worker with its own database then.

## Store accounts and review

- **Apple Developer Program:** $99/year. Review usually takes a day or two.
- **Google Play Console:** $25 once. New personal accounts must run a **closed test with at least 12 testers for 14 days** before they can publish to everyone, so start that early.

**Listing assets:**
- Screenshots: iPhone 6.9", plus iPad 13" if iPad stays.
- Play: phone screenshots, a 512×512 icon (`assets/icon-512.png`) and a 1024×500 feature graphic.
- Short and full descriptions, and an age-rating questionnaire (expect cartoon violence: snakes crash).

**Privacy answers:**
- **Sync:** *Gameplay Content*, used for *App Functionality*, *not linked to the user*, *not used for tracking*.
- **Ads (AdMob):** the data Google's SDK collects. Copy it from Google's own guides rather than guessing: [App Store](https://developers.google.com/admob/ios/privacy/data-disclosure) and [Google Play](https://developers.google.com/admob/android/privacy/play-data-disclosure). The app never asks for tracking permission, and ads are never personalized.
- **Google Play:** *Contains ads: Yes*. The *Advertising ID* declaration is *Yes* (Google's ad SDK uses it).
- **Purchases:** handled by Apple and Google; nothing for you to declare.

## Test on real phones before submitting

These can't be checked from a browser:
- How the haptics feel.
- The iPhone ringer switch muting sound.
- Notch and Dynamic Island layout.
- Speed on an older Android phone.

Also check whether Android's edge back gesture collides with fast swipes near the screen edges. A collision would only pause the game, but if it happens a lot, add gesture-exclusion zones.
