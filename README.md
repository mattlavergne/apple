# The Apple 🍎

**Snake, flipped.** You're the apple. Lead the snake into walls, rocks, brambles, other snakes or its own tail. Whatever you do, don't get eaten.

Pure HTML/CSS/JS with no build step. All graphics are drawn on a canvas and all sounds are synthesized, so there are no image or audio files to load. The same files also run the App Store / Google Play app (see [STORE.md](STORE.md)).

## Modes

- **Adventure** (the main mode): a Candy Crush-style map of **100 levels across 10 worlds** (Sunny Orchard, Sunset Meadow, Dusty Desert, Frosty Field, Moonlit Garden, Candy Kingdom, Autumn Woods, Seaside Dunes, Volcano Rim, Cloud Garden). Every 10th level is a boss. Each level has an **objective**: crash every snake, survive N seconds, collect N stars, or crash the golden snake (crashing every snake always wins too). Clear a level to unlock the next and earn **1–3 stars** (3 = no bites, 2 = one bite, 1 = cleared). Replay any unlocked level to improve.
  - Levels are generated from the level number with a fixed seed (`js/levels.js`), so **every player gets the same level 16**. Layout styles (pillars, fence rows, rooms, a walled arena, crossroads, islands, zigzags, mirrored patterns…) get more structured in later worlds, and each level has its own wall positions and a seeded mirror flip. Layouts are built on a 25×17 landscape grid and rotated for portrait phones, so the map is identical, just turned.
  - Difficulty is a gentle sawtooth: it dips at the start of each world, then climbs to the boss.
- **Endless**: one run, no end, with power-ups between levels, your nemesis, and Sprout / Classic / Rotten Core modes.
- **Daily Run**: the same seeded Endless run for everyone today.

## Cloud sync

Progress can follow you between devices with no account: **Sync** on the title screen makes a random 12-character code. Type it (or paste the message *Send code* makes) into Sync on another device to link it. Saves are stored by the homepage Worker in [`mattlavergne/landing-page`](https://github.com/mattlavergne/landing-page) (`src/apple-api.js`, a Cloudflare D1 table) at `mattlavergne.com/api/apple`. No personal data is stored.

**Fast:** changes go up within a second. Another device picks them up when the game opens, comes back to the front, the map opens or a menu is tapped. While a menu is on screen it also checks every 10 seconds (every 30 when the window isn't focused).

**Progress never goes backwards.** Each layer checks this on its own:
- **Merging only adds.** Unlocked levels, best stars and scores, upgrades, skins and lifetime stats take the best of both devices. The star balance is a per-device ledger, so balances from two devices add up instead of overwriting each other. The daily run and contracts merge by day. Choices (equipped skin, mode, settings, nemesis) come from whichever device changed most recently. The merge gives the same result whichever device runs it, so devices settle instead of re-uploading forever.
- **Every merge is double-checked** (`safeMerge` in `js/sync.js`) against both saves before it's used. If anything would go down, sync stops and the device keeps its own save.
- **The server only accepts a save based on its latest revision** (compare-and-swap). It sends back the newer save, and the game merges and retries. It also refuses any save with less progress than the one it has, even from an older game version.
- **History:** the server keeps the last 10 versions of each save plus the last one of each day for 14 days (`apple_save_history`). Each device keeps its last 10 saves from before a merge replaced them (`the-apple.save.backups` in local storage). A save that can't be read is set aside, never overwritten.
- **Two tabs** on one computer merge each other's saves instead of overwriting them.

**Minimal data:** only progress is uploaded. Settings stay on each device. Cloud saves nobody has synced for 6 months are deleted with their history. **Delete cloud copy** on the Sync screen removes a save and its history at once; other devices still using that code are told and turn sync off instead of uploading it again.

Every top-level save field must be listed in `SAVE_FIELDS` in `js/sync.js`. A new progress field also needs a merge rule and a progress check, on both the game and the server.

## How it plays

- **Move** with the Arrow keys or WASD. On touch screens, drag anywhere on the field.
- **Dash** (`Space`): zip a few tiles forward.
- **Bramble** (`E`): drop a thorn bush behind you. Snakes take a moment to notice fresh thorns (they shimmer until spotted). A chasing snake that runs into fresh thorns gets scratched: stunned, dizzy and shorter. A **lunging** snake that hits thorns you dropped after its "!" is out. Old thorns are walls for building traps, and a trapped snake forced into them is out too. On levels 1–2 (and early Sprout levels) thorns always kill.
- **Hidden Rot** (`Q`, from level 3): secretly rot for a few seconds (you move a bit slower while rotten). A snake that bites you gets **sick**: it gags, slows down, stops growing and lunging, and withers away over several seconds. If it bites a fresh apple first, it's cured, so keep away. Rot a sick snake again for an instant knockout. Snakes within 3 tiles smell rot after a moment, so trigger it at the last second. Lunging snakes can't smell anything. Rot starts each level half-charged.
- **Decoy** (`R`): a shiny fake apple. Unlock it in the Orchard, or get it as a perk.
- **Pause** with `P` or `Esc`.

Snakes grow every few seconds and get **hungrier** the longer a level lasts: they speed up (HUNGRY at 1.3×, FRENZY at 1.6×, up to 1.9×), the music speeds up with them, and by FRENZY they're faster than you. Getting bitten calms them down a little. Sprout mode ramps at half speed and caps at 1.45×.

**The hedges close in.** At HUNGRY the outermost ring of the field flashes for 3 seconds, then overgrows into a solid thorn hedge; at FRENZY the next ring does too, so the arena shrinks as the pace rises. Running laps around the edge stops working. Any snake caught on a closing ring is **HEDGED!** (1.5× points). From level 4 snakes heed the warning and steer off the ring, so a hedge crush has to be set up. You can't leave the field: walking into the edge just bumps.

Snakes also get smarter as you go:

| Levels | Snake brain |
|---|---|
| All | Won't squeeze into a tiny dead end, not even to bite you (the safe pocket size grows with level) |
| 1–2 | Greedy: heads straight for you. Thorns kill on contact |
| 3+ | Pathfinding, plus a telegraphed **lunge** (watch for the red "!") |
| 1–10 | Notices fresh thorns faster each level (about 3 snake steps at level 1, about 1.5 by level 10) |
| 4+ | **Intercepts:** often aims where you're heading instead of where you are; with two or more snakes, one chases while the other flanks |
| 6+ | Checks it won't trap itself more and more often |
| 3+ | Smells active rot within 3 tiles, faster each level |

Every 5th level is a **boss level** with King Cobra Carl. From level 11 on, there's always more than one snake. The world theme changes every 5 levels: Orchard, Meadow, Desert, Frost, Moonlit Garden and Candy Kingdom.

**Progression:**
- Stars you collect are saved in the browser and spent in **the Orchard** on permanent upgrades and apple skins.
- After each level you pick 1 of 3 power-ups for the current run.
- There are three modes: **Sprout** (relaxed, good for kids), **Classic**, and **Rotten Core**, which unlocks once you reach level 10 in Classic.

## Competitive depth

- **Nerve:** slipping right past a snake's nose (a *close call*) builds a combo that multiplies every point you earn, up to ×6. A lunging snake that just misses counts double, and big moments trigger a beat of slow motion. Playing safe lets it cool off, so careful players can survive while brave players chase the high scores.
- **Grades:** every cleared level is graded S/A/B/C on speed, bites taken and peak Nerve, with bonus stars for good grades.
- **Level events:** from level 3, most non-boss levels roll a twist: Star Shower, Thick Fog, Golden Snake, Earthquake, Mirror Twin, Hungry Hour, Tailwind or Bramble Bloom.
- **Nemesis:** the snake that ends your run remembers you. It gets a name and title (*Vicky the Apple-Eater*) and ambushes a later run somewhere in levels 3–6 with a scar and a red glow. Each rank makes it smarter, a bit faster, quicker to lunge, quicker to smell rot and slower to wither. Every time it eats you again it ranks up (up to 5) and its bounty grows. Beat it to claim the bounty. Its WANTED poster sits on the title screen. Daily runs don't involve the nemesis.
- **Daily Contracts:** three challenges a day (one easy, one medium, one hard), the same for everyone, e.g. "Scratch 3 snakes with fresh thorns", "Reach Nerve ×3", "Thorn a lunging snake". Each pays stars, plus a bonus for all three.
- **Daily Run:** one seeded run per day. Everyone gets the same layouts, events and power-up offers, and Orchard upgrades are switched off so it's fair. Your first Daily each day pays streak-boosted stars, and the result can be shared as an emoji card.

## Phones

- **Swipe** (default on touch screens): swipe to roll, swipe again to turn (even mid-drag), tap to stop. The apple also stops when it bumps into something. A hold-to-steer **joystick** is available in the menu.
- Haptics on bites, crashes, close calls and quakes (Android browsers and both store apps; Safari on iPhone has no vibration).
- The store app plays offline. The web copy (a private test site) has no offline mode: its old service worker is retired (`sw.js` now only removes itself).

## Store app

The app is free to play with ads: levels 1–20 and the Daily Run are free, and one $2.99 purchase unlocks all 100 levels and Endless and removes the ads. Ads only show on menus, never during play. The web copy is the developer's private test site: it has everything and no ads, and its test tools can switch it to the free app's paywall and ad layout. Details are in `js/monetization.js` and STORE.md.

`ios/` and `android/` are [Capacitor](https://capacitorjs.com) projects that wrap these same files. `npm install && npm run sync` copies the game in (via `tools/build-www.mjs`), then build in Xcode or Android Studio. Anything device-specific (saving, haptics, sharing, back button, backgrounding) goes through `js/platform.js`, which falls back to plain web APIs in a browser, so features only need to be written once. [STORE.md](STORE.md) has the full release checklist.

## Hosting

Players get the game from the App Store. The web copy is the developer's
private test site at **mattlavergne.com/apple** (which opens
`/apple/test/`), locked with Cloudflare Access and served through the homepage
Worker in [`mattlavergne/landing-page`](https://github.com/mattlavergne/landing-page).
The Worker reverse-proxies `/apple/test/*` to **GitHub Pages**, or reads this
repo directly with a token once it's private (STORE.md, "Make the repo
private"). Pushing here updates the test site within a minute or two.

Opened directly at `mattlavergne.github.io/apple`, the game doesn't run; it
says it's coming to the App Store. The privacy policy (`privacy.html`) ships
inside the app; its public copy at mattlavergne.com/privacy/apple lives in
landing-page (`public/privacy/apple.html`), so change both together.

On the test site, the 🛠️ button opens test tools (`js/admin.js`): a separate
test save that never syncs, a free app / bought switch, and level, star and
play tools. STORE.md, "Test site", has the details. The app never includes
them.

All asset paths in this repo are relative, so the game works under any sub-path.

## Running locally

The scripts are ES modules, so open the game through a local server, not `file://`:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

Add `?debug` to the URL to expose `window.__game` (e.g. `__game.level = 15; __game.startLevel()`).

Balance checks (headless bots, run per level):
- `node tools/camper.mjs [trials] [reaction]`: "drop a bramble and wait behind it". It should only pay off on the first couple of levels.
- `node tools/rotcamper.mjs [trials]`: "stand still and rot when the snake is close". It should almost never clear a level.
- `node tools/rotkite.mjs [trials]`: rot at the right moment, then run until the snake withers. This is the skill play, and it should usually work but take a while.
- `node tools/adventure.mjs [trials] [from] [to] [-v]`: plays every Adventure level (both orientations) and reports clear rates per world (`-v` for per-level detail).
- `node tools/test-site.mjs`: the test site's tools (test save, free app / bought, level tools), and that none of it touches the real save or syncs.
- `node tools/bitetrap.mjs`: regression test. A snake that eats you in a dead end must back out, never hand you the level.
- `node tools/circler.mjs [trials]`: "run laps around the border". It should get bitten quickly.
- `node tools/nemesis.mjs [trials] [level]`: how often the general bot beats a normal snake versus a nemesis of rank 1–5.

Sync checks (Node 22+; they run the real server code from a landing-page checkout next to this repo):
- `node tools/sync-fuzz.mjs [runs]`: hundreds of random multi-device runs with dropped requests, lost replies, restarts, offline spells, clock skew and an old game version writing stale saves. It checks that no device or cloud save ever goes backwards and that every device ends up with everything. It also injects broken merges and broken uploads to check that the guards stop them.
- `node tools/sync-e2e.mjs`: the real game in two browsers (phone and computer) plus two tabs. It checks that progress made on one appears on the other without reloading, and that tabs never overwrite each other.

App checks:
- `npm run build && node tools/native-smoke.mjs [ios|android]`: loads the app build in Chromium with a fake native bridge. It checks saving, haptics, the back button, backgrounding and the launch screen. It also checks the free tier: ads only on menus, the paywall, the bonus-stars ad, buying, and restoring after a reinstall.
- `node tools/make-icons.mjs`: redraws the icons and launch screen from the in-game apple.

`node tools/sim.mjs [runs] [mode] [dailySeed]` runs a simple bot through many headless games. It's a quick way to sanity-check difficulty after tuning `levelParams` in `js/config.js`.

## Code map

| File | What it does |
|---|---|
| `js/config.js` | Worlds, snakes, difficulty curve, perks, upgrades, skins |
| `js/sync.js` | Cloud sync: save merging, the progress guards, and the sync engine |
| `js/levels.js` | The 100 Adventure levels: objectives, layout templates, deterministic generation |
| `js/engine.js` | Simulation: movement, snake AI (greedy / BFS / flood-fill), abilities, pickups (no DOM) |
| `js/render.js` | Canvas drawing: field, snakes, apple, particles |
| `js/main.js` | Screens, HUD, game loop, save hooks |
| `js/input.js` | Keyboard and touch joystick |
| `js/audio.js` | WebAudio sound effects and generated music |
| `js/save.js` | Saved progress |
| `js/platform.js` | Browser vs. store app: storage, haptics, sharing, back button, app lifecycle, purchases, ads |
| `js/monetization.js` | Free tier, product ID, price and AdMob IDs |
