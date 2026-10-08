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
| Privacy | `privacy.html` (at https://mattlavergne.com/apple/_app/privacy.html, linked from How to play). Covers sync, ads and purchases. No analytics or accounts. |
| Sync | The server already accepts requests from the apps (`capacitor://localhost`, `https://localhost`). |
| Android | Verified: the debug APK builds (targets Android 16 / API 36). The app asks for Internet and Vibrate; Google's ad and billing libraries add their own (advertising ID, billing). None of them show a prompt. |

## Decisions to make before submitting

1. **Store name.** The home-screen label is "The Apple" (`capacitor.config.json`). The store listing name is set separately in App Store Connect / Play Console. "The Apple" alone is hard to find in search (Apple's own apps own that query) and invites a trademark question in review. A listing name that makes the fruit and the game obvious, like *The Apple: Snake in Reverse*, avoids both.
2. **App ID.** `com.mattlavergne.theapple`. It can never change after the first upload. Change it now (in `capacitor.config.json`, `android/app/build.gradle` and the Xcode project) if you want something else.
3. **Money: decided.** The app is free with ads, and one purchase unlocks the full game. It's built; see [Money](#money-free-with-ads-one-purchase) for the account setup it needs.
4. **iPad.** The app currently supports iPad (it plays well in landscape). That means also uploading iPad screenshots. To skip that, set Targeted Device Family to iPhone only in Xcode.
5. **Kids category: probably not.** The game is fine for a 4+ rating without being *in* Apple's Kids category. That category adds rules, such as a parental gate before any link that leaves the app (the privacy link counts).

**Contact details for both stores:** support email `contact@mattlavergne.com` (also in the privacy policy). Support URL: https://mattlavergne.com/apple/_app/privacy.html#contact (all store links are in `store/listing.md`).

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
- **Store builds can't ship broken ad settings.** `npm run release:ios` and `npm run release:android` refuse to build while any AdMob ID is missing, mistyped, still one of Google's test IDs, or from a different AdMob account than the others.
- **Test builds always show Google's test ads,** even though your real ad unit IDs are in the code (the AdMob plugin swaps in Google's test units; `tools/native-smoke.mjs` checks this).
- **Never tap a real ad in your own app.** Google bans accounts for it. A store build on your own phone shows real ads, so leave them alone there.

### Ads: set up AdMob

Your publisher ID is `pub-2529441843817238`, so every ID below starts with `ca-app-pub-2529441843817238`.

1. **Apps:** done. You created *The Apple* for Android and for iOS.
2. **Ad units:** done. The four ad unit IDs (a banner and a rewarded ad for each app) are in `js/monetization.js` (`AD_UNITS`).
3. **App IDs: still needed.** Each app also has an **app ID**, with a `~` where ad unit IDs have a `/` (like `ca-app-pub-2529441843817238~1234567890`). To find them:
   1. In AdMob, go to *Apps → View all apps*.
   2. The *App ID* column shows each app's ID. Click the copy icon next to it.

   Send me both, or put them in:
   - **Android:** `android/app/src/main/res/values/strings.xml` (`admob_app_id`);
   - **iOS:** `ios/App/App/Info.plist` (`GADApplicationIdentifier`).

   Until then, store builds refuse to build. Test builds keep working with Google's test app IDs.
4. **Link the apps to the stores:** later, once each app is live, open it in AdMob → *App settings* → *Add app store details* and search for it. AdMob reviews an app only after it's linked, and serves few ads until that review passes.
5. **Consent form for the EU and UK:**
   1. Go to *Privacy & messaging*, then *European regulations* → *Create message*.
   2. **Apps:** select both.
   3. **Privacy policy:** AdMob asks for one URL per app. Use https://mattlavergne.com/apple/_app/privacy.html for both. It's the policy the game already links to, and it already covers ads and consent. If AdMob or a store ever says it can't open that page, use https://mattlavergne.github.io/apple/privacy.html instead: the same page, without Cloudflare's bot check in front of it.
   4. Leave everything else (language, consent options, look) as it is.
   5. Click *Publish*.

   The game shows this form by itself, but only once it's published here. Skip the *IDFA explainer* message: the game never asks iOS's tracking question, so it would never be shown.
6. **app-ads.txt:** done. It's served at https://mattlavergne.com/app-ads.txt by Landing-Page.
   - AdMob verifies it once the app is published and its store listing names mattlavergne.com as the website (`store/listing.md` uses mattlavergne.com everywhere).
   - Check *Apps → app-ads.txt* in AdMob a day after launch.
   - If it says the file can't be found, look in Cloudflare *Security → Events* for blocked requests to `/app-ads.txt`.
7. **Payments:** under *Payments*, add your bank details and tax info. AdMob pays out monthly once you pass $100.
8. **Kids:** if the Play Console *Target audience* includes under-13s, set `CHILD_DIRECTED = true` in `js/monetization.js`.

### Purchases: set up the $2.99 unlock

The details to type in (product ID, name, description, review note) are in [`store/listing.md`](store/listing.md#in-app-purchase-both-stores).

#### Apple (App Store Connect)

1. **Join the Apple Developer Program:**
   1. Go to [developer.apple.com/programs/enroll](https://developer.apple.com/programs/enroll) and sign in with your Apple ID (it needs two-factor authentication).
   2. Choose **Individual** and pay $99/year. Approval usually takes a day or two.
   3. Then sign in at [appstoreconnect.apple.com](https://appstoreconnect.apple.com).
2. **Small Business Program:** apply at [developer.apple.com/app-store/small-business-program](https://developer.apple.com/app-store/small-business-program/). Apple then takes 15% of sales instead of 30%. It's free; do it before your first sale.
3. **Agreements, tax and banking.** Purchases won't work, even in testing, until this is done. Go to *Business* (top menu) → *Agreements*, then:
   1. Accept the **Paid Apps** agreement.
   2. Add your **bank account**. The holder name must match your legal name.
   3. Fill in the **US tax form**: a W-9 if you're a US person.
   4. Wait until the agreement shows **Active**, which can take a day.
4. **Register the app's ID:**
   1. In [Certificates, IDs & Profiles](https://developer.apple.com/account/resources/identifiers/list), go to *Identifiers → + → App IDs → App*.
   2. Description: *The Apple*. Bundle ID: **Explicit**, `com.mattlavergne.theapple`. Then *Register*. In-App Purchase is included automatically.
5. **Create the app record:** in App Store Connect, go to *Apps → + → New App*:
   - **Platform:** iOS.
   - **Name:** *The Apple: Snake in Reverse*. It must be unique on the App Store; if it's taken, try a variant.
   - **Primary language:** English (U.S.).
   - **Bundle ID:** `com.mattlavergne.theapple`.
   - **SKU:** `theapple` (only you see it).
   - **User access:** Full Access.
6. **Create the purchase:**
   1. In the app, go to *Monetization → In-App Purchases → +*. Choose **Non-Consumable**, reference name *Full Game*, product ID `com.mattlavergne.theapple.full`. Then *Create*.
   2. On its page:
      - **Availability:** all countries.
      - **Price Schedule:** *Add Pricing*, base country United States, **$2.99**. Apple fills in the other countries.
      - **App Store Localization:** *+*, English (U.S.). Display name *Full Game*; description *All 100 levels, Endless mode and no ads.*
      - **Review Information:** upload `store/iap-review.png` and paste the review note.
   3. *Save*. The status should read **Ready to Submit**.
7. **Submit it with the app.** Your first in-app purchase has to go in with a new app version: on the version page, in *In-App Purchases and Subscriptions*, select *Full Game*.
8. **Test:** builds from TestFlight use Apple's sandbox. Unlock shows the real purchase sheet marked *Sandbox*, and nothing is charged.

#### Google (Play Console)

1. **Sign up** at [play.google.com/console/signup](https://play.google.com/console/signup):
   - Choose a **personal** account and pay $25 once.
   - Google verifies your identity with a government ID (a few days), plus a phone through the Play Console app.
2. **Payments profile:** go to *Settings (gear) → Payments profile*. Create one, or link your existing Google one:
   - legal name and address;
   - a **bank account** for payouts (Google sends a small test deposit to confirm it);
   - **tax info** (W-9 for US persons).
3. **Create the app:** go to *Home → Create app*:
   - **App name:** *The Apple: Snake in Reverse*.
   - **Default language:** English (United States).
   - **App or game:** Game.
   - **Free or paid:** **Free**. A free app can never become paid, but purchases inside it are fine.
   - Tick the declarations, then *Create app*.
4. **Make the upload file** (on your Mac):
   ```sh
   npm install
   npm run android        # test build (Google's test ads), opens Android Studio
   ```
   1. In Android Studio, go to *Build → Generate Signed App Bundle or APK → Android App Bundle*.
   2. **Key store:** choose *Create new*. Save it **outside** the project (e.g. `~/keys/the-apple-upload.jks`), with a strong password and alias `upload`.
   3. **Back up the key store and its password** (password manager plus cloud). Every future update must be signed with it.
   4. Build variant **release**. The file lands in `android/app/release/app-release.aab`.

   A test build is right for this first upload. For the public release, put your AdMob IDs in and use `npm run release:android`.
5. **Upload it to internal testing:**
   1. Go to *Test and release → Testing → Internal testing → Create new release*. Keep *Play App Signing* with a Google-generated key (the default).
   2. Upload `app-release.aab`, then *Next → Save → Start rollout*. Play may ask you to fill in a few *App content* forms first.
   3. Under *Testers*, create an email list with your Gmail, then open the *join* link on your Android phone and install the app from Play.
6. **Create the product.** Google only allows this once a build with billing is uploaded.
   1. Go to *Monetize with Play → Products → One-time products* (older consoles call it *In-app products*) → *Create*.
   2. Product ID `com.mattlavergne.theapple.full`; name *Full Game*; description *All 100 levels, Endless mode and no ads.*
   3. Add a *purchase option*, then set the price to **$2.99** (Google converts it for other countries).
   4. *Save*, then **Activate**.
7. **Free test purchases:** in the Play Console's account-level *Settings → License testing*, add your Gmail. Purchases from that account in the Play-installed test build use a test card and aren't charged.
8. **Closed test:** before you can release to everyone, run a closed test with 12+ testers for 14 days. Then go to *Production*.

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
