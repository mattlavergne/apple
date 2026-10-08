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
3. **Money.** Decide before launch, since it changes the privacy answers and age rating. With a kid-friendly audience, the cleanest options are paid upfront, or free with a one-time "full game" unlock (e.g. worlds 1–2 free). Ads mean a tracking prompt on iOS, a consent form in Europe and different privacy labels. Selling stars or upgrades for real money in a game kids play draws extra scrutiny. In-app purchases would be a plugin wired through `js/platform.js`.
4. **iPad.** The app currently supports iPad (it plays well in landscape). That means also uploading iPad screenshots. To skip that, set Targeted Device Family to iPhone only in Xcode.
5. **Contact.** Both stores ask for a support URL and contact email. The privacy policy points to mattlavergne.com; make sure that has a way to reach you, or put an email in `privacy.html`.

## Building

```sh
npm install
npm run sync        # copies the game into www/ and into both native projects
```

Run `npm run sync` after every game change, before building the apps.

**Android** (Windows, Mac or Linux): install [Android Studio](https://developer.android.com/studio), run `npm run android`, then *Build → Generate Signed App Bundle* (.aab). Create an upload key when asked and back it up (with Play App Signing, Google holds the real signing key).

**iOS** needs Xcode, which only runs on a Mac. Without a Mac, use a cloud Mac build service (Codemagic, Ionic Appflow, or GitHub Actions' macOS runners). With a Mac: `npm run ios`, set your team under *Signing & Capabilities*, then *Product → Archive → Distribute App*.

Before each release, bump the version: `versionCode` / `versionName` in `android/app/build.gradle`, and *Version* / *Build* in Xcode.

## Store accounts and review

- **Apple Developer Program:** $99/year. Review usually takes a day or two.
- **Google Play Console:** $25 once. New personal accounts must run a **closed test with at least 12 testers for 14 days** before they can publish to everyone, so start that early.

**Listing assets:**
- Screenshots: iPhone 6.9", plus iPad 13" if iPad stays.
- Play: phone screenshots, a 512×512 icon (`assets/icon-512.png`) and a 1024×500 feature graphic.
- Short and full descriptions, and an age-rating questionnaire (expect cartoon violence: snakes crash).

**Privacy answers** (if nothing above changes):
- **Apple App Privacy:** if you count Sync, *Gameplay Content*, used for *App Functionality*, *not linked to the user* and *not used for tracking*. Otherwise *Data Not Collected*.
- **Google Data safety:** the same. Optional game progress is stored in the cloud, encrypted in transit (HTTPS), with no account and no sharing with third parties.

## Test on real phones before submitting

These can't be checked from a browser:
- How the haptics feel.
- The iPhone ringer switch muting sound.
- Notch and Dynamic Island layout.
- Speed on an older Android phone.

Also check whether Android's edge back gesture collides with fast swipes near the screen edges. A collision would only pause the game, but if it happens a lot, add gesture-exclusion zones.
