# Shipping The Apple to the App Store and Google Play

The store app is the same web game in a native shell ([Capacitor](https://capacitorjs.com)). There is one codebase: `index.html`, `css/` and `js/` run both the apps and your private web test site (see [Test site](#test-site-mattlavergnecomapple)). The `ios/` and `android/` folders are the native projects, generated once and checked in.

## Rule for future features

Anything that touches the device goes through **`js/platform.js`**: saving, haptics, sharing, the back button, going to the background, the launch screen. Game code never calls `localStorage`, `navigator.vibrate`, `navigator.share` or a Capacitor plugin directly. Follow that, and new levels, modes, art and sounds work in the browser and both apps with no extra work. Also keep everything local: no CDN scripts, fonts or images (the app must work offline and App Review tests it that way).

After changing the game, `node tools/native-smoke.mjs` (after `npm run build`) checks the app-side behavior in a browser with a fake native bridge, and `node tools/test-site.mjs` checks the web test site's test tools.

## What's already done

| | |
|---|---|
| Saves | Kept in native storage (iOS UserDefaults / Android SharedPreferences, included in device backups), not only in the WebView's localStorage, which the OS may wipe when space runs low. Older WebView-only saves are copied over automatically. |
| Haptics | Native haptics on iPhone and Android (Safari has none). Each game event has its own feel (light tap for close calls, error buzz for a bite, success for contracts). |
| Back button | Android back steps out one screen; during play it pauses; on the title it sends the app to the background. |
| Background | Pauses the game, silences audio, saves, and sends any unsynced progress. |
| Audio | In the app, sound follows the ringer switch and mixes with the player's own music, the way games are expected to behave on iOS. The website keeps playing through the switch (that fixed "no sound" in Safari). |
| Screen | Status bar hidden, notch and home indicator handled. Phones are locked to portrait; iPads and Android tablets rotate freely. |
| Offline | The font is bundled. No network needed except for Sync. |
| Launch | Icon, Android adaptive icon and launch screen drawn from the in-game apple (`tools/make-icons.mjs` → `resources/` → `npx @capacitor/assets generate --assetPath resources`). |
| Privacy | `privacy.html` ships inside the app: *How to play → Privacy policy* opens it in the app. The same page is public at https://mattlavergne.com/privacy/apple for the App Store listing and AdMob. Covers sync, ads and purchases. No analytics or accounts. |
| No website links | The app never sends players to mattlavergne.com. Share links to the App Store page once it exists (`STORE_URLS` in `js/monetization.js`), sync uses just the code, and the privacy policy is built in. |
| Sync | The server answers at mattlavergne.com/api/apple, outside the locked `/apple`, and accepts requests from the apps (`capacitor://localhost`, `https://localhost`). |
| Test site | mattlavergne.com/apple is your private copy with test tools; it's never in the app. See [Test site](#test-site-mattlavergnecomapple). |
| Android | Verified: the debug APK builds (targets Android 16 / API 36). The app asks for Internet and Vibrate; Google's ad and billing libraries add their own (advertising ID, billing). None of them show a prompt. |

## Decisions to make before submitting

1. **Store name.** The home-screen label is "The Apple" (`capacitor.config.json`). The store listing name is set separately in App Store Connect / Play Console. "The Apple" alone is hard to find in search (Apple's own apps own that query) and invites a trademark question in review. A listing name that makes the fruit and the game obvious, like *The Apple: Snake in Reverse*, avoids both.
2. **App ID.** `com.mattlavergne.theapple`. It can never change after the first upload. Change it now (in `capacitor.config.json`, `android/app/build.gradle` and the Xcode project) if you want something else.
3. **Money: decided.** The app is free with ads, and one purchase unlocks the full game. It's built; see [Money](#money-free-with-ads-one-purchase) for the account setup it needs.
4. **iPad.** The app currently supports iPad (it plays well in landscape). That means also uploading iPad screenshots. To skip that, set Targeted Device Family to iPhone only in Xcode.
5. **EU: decided, not sold there.** Untick the 27 EU countries in App Store Connect (see [Apple](#apple-app-store-connect), step 3). That way Apple needs no public trader details (address, phone). Adding the EU later means giving them; a P.O. box works.
6. **Kids category: probably not.** The game is fine for a 4+ rating without being *in* Apple's Kids category. That category adds rules, such as a parental gate before any link that leaves the app (the privacy link counts).

**Contact details for both stores:** support email `contact@mattlavergne.com` (also in the privacy policy). Support URL: https://mattlavergne.com/privacy/apple#contact (all store links are in `store/listing.md`).

## Building

```sh
npm install
npm run sync        # copies the game into www/ and into both native projects
```

Run `npm run sync` after every game change, before building the apps.

**Android** (Windows, Mac or Linux): install [Android Studio](https://developer.android.com/studio), run `npm run android`, then *Build → Generate Signed App Bundle* (.aab). Create an upload key when asked and back it up (with Play App Signing, Google holds the real signing key).

**iOS** needs Xcode, which only runs on a Mac. Everything up to the upload is free. The $99 Apple Developer Program is only needed for TestFlight and the App Store, so you can finish and test the app first.

#### Before paying Apple: finish the app on your Mac (free)

1. Install **Xcode** from the Mac App Store (it's big, so allow an hour), open it once so it finishes installing, then install **Node.js** (the LTS version from nodejs.org).
2. In Terminal:
   ```sh
   git clone https://github.com/mattlavergne/apple.git
   cd apple
   npm install
   npm run ios
   ```
   Xcode opens with the app. This is a **test build**: Google's test ads, everything else real.
3. **Purchases without a developer account.** `ios/App/TheApple.storekit` is a pretend App Store with the $2.99 *Full Game* in it. Turn it on once:
   1. In Finder, drag `ios/App/TheApple.storekit` onto *App* at the top of Xcode's left sidebar. When Xcode asks, untick *App* under *Add to targets*.
   2. *Product → Scheme → Edit Scheme… → Run → Options → StoreKit Configuration*: choose **TheApple.storekit**, then *Close*.

   Unlock now shows Apple's real purchase sheet, and nothing is charged. To relock, use *Debug → StoreKit → Manage Transactions*, select the purchase and delete it. This only applies to runs from Xcode; uploaded builds use the real App Store.
4. **Play it in the Simulator:** pick an iPhone (or iPad) at the top of Xcode and press ▶. No Apple ID needed.
5. **Play it on your iPhone:**
   1. Plug in the phone and pick it as the run destination at the top of Xcode.
   2. Under *App → Signing & Capabilities*, set **Team** to your Apple ID (Xcode → Settings → Accounts to add it), then press ▶.
   3. The first time, the iPhone needs two settings: *Settings → Privacy & Security → Developer Mode* turned on, and the developer trusted under *Settings → General → VPN & Device Management*.
   4. A free Apple ID's install lasts 7 days; press ▶ again to renew it.
6. **Make your iPhone an AdMob test device** (see [Ads](#ads-set-up-admob), step 9) while it's plugged in.
7. **Check everything** before paying: the free tier and its ads, Unlock and Restore, sync with an iPad or the test site, and the [real-phone checks](#test-on-real-phones-before-submitting).

#### After paying Apple: the last mile (about a week)

Each step waits on Apple a little: enrollment approval (a day or two), the Paid Apps agreement turning Active (up to a day), and review (usually a day or two).

1. Join the program and set up App Store Connect: see [Apple](#apple-app-store-connect). Creating the app record gives the app its Apple ID (a number under *App Information*). Send it to me so Share links to the App Store page (`STORE_URLS`).
2. Make the **store build**: `npm run release:ios`. In Xcode, set Team to the paid team, raise *Build* by one, then *Product → Archive → Distribute App → App Store Connect → Upload*.
3. The build shows up under *TestFlight* in about 15 minutes. Install it with the TestFlight app and check it once:
   - purchases go through Apple's sandbox and are free;
   - ads are your real ad units, but your phone gets test ads if it's in `TEST_DEVICES`.
4. Attach the build and the *Full Game* purchase to the version, then *Submit for Review*.

Before each release, bump the version: `versionCode` / `versionName` in `android/app/build.gradle`, and *Version* / *Build* in Xcode.

**Store listing:** the copy, screenshots and Play feature graphic are ready in [`store/`](store/listing.md). `node tools/store-shots.mjs` regenerates the images from the current game.

## Money: free with ads, one purchase

**What players get:**
- **Free:** Adventure levels 1–20 and the Daily Run.
  - A banner ad sits at the bottom of menu screens. It never shows during play, while paused or on the purchase screen.
  - The level-complete screen offers an optional ad for bonus stars.
- **The full game ($2.99, one time):** all 100 levels, Endless mode, and no ads.
  - Level 21, the locked worlds and the Endless button lead to the purchase screen, which has Buy, *Restore purchase* and *Not now*. *Restore purchase* is also on the How to play screen; Apple requires a restore option.
- **The web test site** has everything and no ads, unless its test tools are set to *Free app*.

**Where the settings live:**
- Everything is in [`js/monetization.js`](js/monetization.js): the free level count, product ID, fallback price, ad unit IDs, your AdMob test devices, the store page links and the child-directed switch.
- The code is `js/platform.js` (`store`, `ads`).
- Purchases use the [`@capgo/native-purchases`](https://github.com/Cap-go/capacitor-native-purchases) plugin, which talks to Apple and Google directly with no third-party purchase service. Ads use [`@capacitor-community/admob`](https://github.com/capacitor-community/admob).

**Safety rules:**
- **A purchase is only ever granted, never taken away by the app.** If the store is offline or signed out, a paying player keeps the full game.
- **A reinstall restores the purchase automatically** from the store account.
- **Store builds can't ship broken ad settings.** `npm run release:ios` and `npm run release:android` refuse to build while any AdMob ID is missing, mistyped, still one of Google's test IDs, or from a different AdMob account than the others.
- **Test builds always show Google's test ads,** even though your real ad unit IDs are in the code (the AdMob plugin swaps in Google's test units; `tools/native-smoke.mjs` checks this).
- **Your own phone gets test ads, even from the App Store,** once its ID is in `TEST_DEVICES` (Ads, step 9). Until then, never tap an ad in a store build on your phone: Google bans accounts for clicks on their own ads.

### Ads: set up AdMob

Your publisher ID is `pub-2529441843817238`, so every ID below starts with `ca-app-pub-2529441843817238`.

1. **Apps:** done. You created *The Apple* for Android and for iOS.
2. **Ad units:** done. The four ad unit IDs (a banner and a rewarded ad for each app) are in `js/monetization.js` (`AD_UNITS`).
3. **App IDs:** done. Android `ca-app-pub-2529441843817238~5240359513` is in `android/app/src/main/res/values/strings.xml` (`admob_app_id`); iOS `ca-app-pub-2529441843817238~1624548130` is in `ios/App/App/Info.plist` (`GADApplicationIdentifier`). Store builds now build.
4. **Link the apps to the stores:** later, once each app is live, open it in AdMob → *App settings* → *Add app store details* and search for it. AdMob reviews an app only after it's linked, and serves few ads until that review passes.
5. **Consent form for the EU and UK:**
   1. Go to *Privacy & messaging*, then *European regulations* → *Create message*.
   2. **Apps:** select both.
   3. **Privacy policy:** AdMob asks for one URL per app. Use https://mattlavergne.com/privacy/apple for both. It's the policy the app shows, and it already covers ads and consent. (If you already published the message with the older `/apple/_app/privacy.html` address, edit it: that address will be behind the test site's sign-in.) If AdMob or a store ever says it can't open the page, use https://mattlavergne.github.io/apple/privacy.html instead: the same page, without Cloudflare's bot check in front of it.
   4. Leave everything else (language, consent options, look) as it is.
   5. Click *Publish*.

   The game shows this form by itself, but only once it's published here. Skip the *IDFA explainer* message: the game never asks iOS's tracking question, so it would never be shown.
6. **app-ads.txt:** done. It's served at https://mattlavergne.com/app-ads.txt by Landing-Page.
   - AdMob verifies it once the app is published and its store listing names mattlavergne.com as the website (`store/listing.md` uses mattlavergne.com everywhere).
   - Check *Apps → app-ads.txt* in AdMob a day after launch.
   - If it says the file can't be found, look in Cloudflare *Security → Events* for blocked requests to `/app-ads.txt`.
7. **Getting paid.** AdMob unlocks these steps as earnings grow:
   - **Tax info, now:** *Payments → Manage settings → Payments profile → United States tax info → Manage tax info*. It's a short W-9 interview (legal name, address, SSN). Use the same legal name and address as your bank account.
   - **Identity and address, around $10 earned:** AdMob may ask for an ID, then mails a PIN to your payment address. It can take 2–3 weeks to arrive; enter it under *Payments*. No payout happens without it.
   - **Bank account, at $10 earned:** *Payments → Add payment method → Add new bank account*. A small test deposit (under $1.10) shows up in 2–5 days; enter that amount in *Payments* to confirm the account.
   - **Payout:** monthly, around the 21st, once your balance passes $100. Smaller balances carry over.
8. **Kids:** if the Play Console *Target audience* includes under-13s, set `CHILD_DIRECTED = true` in `js/monetization.js`.
9. **Your phone as a test device.** Then AdMob sends your phone test ads even in the store build and the App Store version, so you can use the real app without risking your account. (AdMob's own *Test devices* page needs the iPhone's advertising ID, which the game never asks for, so it's done in code instead.)
   1. Run the app from Xcode on your iPhone (see [Building](#before-paying-apple-finish-the-app-on-your-mac-free)) and go to a menu so a banner loads.
   2. Open Xcode's console (*View → Debug Area → Activate Console*) and type `testDeviceIdentifiers` in its search field (bottom right). Google's ad library prints a line like:
      `<Google> To get test ads on this device, set: GADMobileAds.sharedInstance.requestConfiguration.testDeviceIdentifiers = @[ @"2077ef9a63d2b398840261c8221a0c9b" ];`
   3. Send me the 32-character ID in quotes, or add it to `TEST_DEVICES` in `js/monetization.js` yourself. Do the same for an iPad.

   If you delete every app of yours from the phone and reinstall, the ID can change; check the console again.

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
   5. **Leave out the EU.** On the app's *Pricing and Availability* page, untick the 27 EU countries. Apple only needs public trader details (address, phone, email) for apps sold in the EU. If App Store Connect still asks about trader status, answer that you're not a trader. To add the EU later, give Apple trader details; a P.O. box works for the address.
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

**On hold for now.** New personal Play accounts must run a closed test with 12+ testers on Android for 14 days in a row before publishing. Organization accounts (a business such as an LLC, with a free D-U-N-S number) don't have this rule. The Android app is built and ready for whenever this changes.

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
4. **Make the upload file** (on any computer: Windows, Mac or Linux):
   ```sh
   npm install
   npm run android        # test build (Google's test ads), opens Android Studio
   ```
   1. In Android Studio, go to *Build → Generate Signed App Bundle or APK → Android App Bundle*.
   2. **Key store:** choose *Create new*. Save it **outside** the project (e.g. `~/keys/the-apple-upload.jks`), with a strong password and alias `upload`.
   3. **Back up the key store and its password** (password manager plus cloud). Every future update must be signed with it.
   4. Build variant **release**. The file lands in `android/app/release/app-release.aab`.

   Use test builds (`npm run android`, Google's test ads) for internal and closed testing, so you and your testers never tap real ads. For production, run `npm run release:android` instead, raise `versionCode` in `android/app/build.gradle`, and sign it the same way with the same key.
5. **Upload it to internal testing:**
   1. Go to *Test and release → Testing → Internal testing → Create new release*. Keep *Play App Signing* with a Google-generated key (the default).
   2. Upload `app-release.aab`, then *Next → Save → Start rollout*. Play may ask you to fill in a few *App content* forms first.
   3. Under *Testers*, create an email list with your Gmail, then open the *join* link on your Android phone and install the app from Play.
6. **Create the product.** Google only allows this once a build with billing is uploaded.
   1. Go to *Monetize with Play → Products → One-time products* (older consoles call it *In-app products*) → *Create*.
   2. Product ID `com.mattlavergne.theapple.full`; name *Full Game*; description *All 100 levels, Endless mode and no ads.*
   3. Add a *purchase option*, then set the price to **$2.99** (Google converts it for other countries).
   4. *Save*, then **Activate**.
7. **Free test purchases:** in the Play Console's account-level *Settings → License testing*, add your Gmail, and later your closed testers' too. Purchases from those accounts in a Play-installed build use a test card and aren't charged. Anyone not on that list pays real money, even in a test.
8. **Closed test:** before you can release to everyone, run a closed test with 12+ testers for 14 days. Then go to *Production*.

## Test vs. production

"Test" and "production" aren't settings in Xcode or the developer program. They're which command builds the app, and where the build goes:

| | What it's for | Ads | Purchases | Needs |
|---|---|---|---|---|
| **Web test site** (mattlavergne.com/apple, only you) | Trying a change minutes after merging, with test tools | None, or pretend ads in *Free app* mode | Pretend | Nothing |
| **Test build** (`npm run ios`, ▶ in Xcode) | The real app in the Simulator or on your iPhone | Google's test ads | Xcode's StoreKit file: free, resettable | A Mac and a free Apple ID |
| **Store build in TestFlight** (`npm run release:ios`, then Archive) | The exact build you'll submit | Real (test ads on your `TEST_DEVICES`) | Apple's sandbox: free | The $99 program |
| **App Store** (the same store build, approved) | Players | Real | Real | Apple's review |

**Every release goes the same way:**
1. Merge the change and try it on the web test site.
2. Run a test build on your iPhone from Xcode.
3. Make the store build, check it in TestFlight, and submit it.

**There's no separate test sync server, on purpose:**
- **Server changes are already tested before they deploy.** `tools/sync-fuzz.mjs` and `tools/sync-e2e.mjs` run the real server code against a real database.
- **A bad server deploy can be undone in one click:** Cloudflare → Workers → *Deployments* → *Rollback*.
- **Saves can be restored too.** D1 can restore the whole database to an earlier point in time (*Time Travel*), and each save also keeps its own history.
- **When it's worth adding one:** if the sync server grows (accounts, leaderboards), add a staging copy of the Worker with its own database then.

## Test site (mattlavergne.com/apple)

The web copy of the game is now only for you: players get the app, and the app never links to it. https://mattlavergne.com/apple opens it full-screen at `/apple/test/`. Your homepage lists The Apple as in progress, with no way in.

**If it ever won't start:** after a few seconds the page says "The game didn't start" and offers *Back to my real save*. You can also open https://mattlavergne.com/apple/test/?realsave yourself. Either way, the test tools' settings are switched off and nothing is deleted.

**Lock it (once), the same way as Chat and What To Eat:**
1. Merge the landing-page pull request first. It moves the two things the app needs out of `/apple`: the sync server to `/api/apple` and the privacy policy to `/privacy/apple`.
2. In the Cloudflare dashboard, go to *Zero Trust → Access → Applications → Add an application → Self-hosted*.
3. **Name:** *The Apple test site*. **Session duration:** 1 month, so you rarely sign in.
4. **Destination:** domain `mattlavergne.com`, path `apple`. Only that path, never the whole domain: the app's sync and the privacy policy must stay public.
5. **Policy:** the one Chat uses (*Allow*, your email). Then *Save*.
6. Check it in a private window:
   - https://mattlavergne.com/apple asks you to sign in;
   - https://mattlavergne.com/privacy/apple shows the privacy policy;
   - https://mattlavergne.com/api/apple/save/AAAAAAAAAAAA shows a short `{"error": …}` message, not a sign-in page;
   - https://mattlavergne.com/apple-touch-icon.png shows the homepage icon. If it asks you to sign in instead, tell me.

**Test tools:** the 🛠️ button in the bottom-left corner (hidden while you're playing; there when paused).
- **Save in use:** *My real save* (your own progress, synced with your devices) or *Test save*: a separate save that never syncs. *Copy my real save in* starts the test save from your real progress, without its sync code.
- **Full game:** *Everything unlocked*, *Free app* (levels 1–20, pretend ads, and Unlock asks to pretend-buy) or *Bought*. *Free app* locks it again.
- **Progress** (test save): unlock all levels, lock them again, unlock up to a level, +1,000 stars, all skins, max upgrades, reset today's Daily Run, show the first-time help again.
- **Play** (test save): open any level. *Win this level* and *Lose this level* work while a level is paused.
- **Save data:** copy the save as JSON, or load JSON into the test save.

Anything that changes progress only works on the test save, so a test can't change your real progress or reach your phone through sync. `node tools/test-site.mjs` checks all of this. The app never contains the tools (`tools/build-www.mjs` leaves `js/admin.js` and `js/boot-check.js` out), and the GitHub Pages copy at mattlavergne.github.io/apple just says the game is coming to the App Store.

### Make the repo private

The test site and its files come from GitHub Pages, which only serves public repos on GitHub's free plan. Making the repo private on its own would turn the test site off. (The privacy policy doesn't depend on it: landing-page has its own copy.) So first let the homepage Worker read the repo directly:

1. **Make a read-only token.** On GitHub, go to *Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token*:
   - **Name:** *mattlavergne.com test site*. **Expiration:** the longest offered. Put a reminder in your calendar a week before it ends.
   - **Repository access:** *Only select repositories* → `mattlavergne/apple`.
   - **Permissions → Repository permissions → Contents:** *Read-only*. Nothing else.
   - *Generate token*, and copy it.
2. **Give it to the Worker.** In Cloudflare, go to *Workers & Pages → trafficmap-proxy → Settings → Variables and Secrets → Add*: type **Secret**, name `GITHUB_TOKEN`, paste the token, then *Deploy*. A secret stays when GitHub Actions deploys the Worker again.
3. **Check it:** https://mattlavergne.com/apple/test/__source should say *The repo, with the GitHub token*. The test site should still load.
4. **Make it private:** on GitHub, open the repo's *Settings → General → Danger Zone → Change visibility → Private*. GitHub Pages turns itself off.
5. **Check again:** the test site still loads, and https://mattlavergne.com/privacy/apple still shows the policy.

When the token expires, only the test site stops loading, with a message naming the token. The app, sync and the privacy policy keep working. Make a new token and replace the secret.

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
