# The Apple 🍎

**Snake, flipped.** You're the apple. Lead the snake into walls, rocks, brambles, other snakes or its own tail. Whatever you do, don't get eaten.

Pure HTML/CSS/JS with no build step and no dependencies. All graphics are drawn on a canvas and all sounds are synthesized, so there are no image or audio files to load.

## How it plays

- **Move** with the Arrow keys or WASD. On touch screens, drag anywhere on the field.
- **Dash** (`Space`): zip a few tiles forward.
- **Bramble** (`E`): drop a thorn bush behind you. Snakes that hit it are out.
- **Hidden Rot** (`Q`, from level 3): secretly rot for a few seconds. A snake that bites you is poisoned. Older snakes can sometimes *sniff* the rot, so timing matters.
- **Decoy** (`R`): a shiny fake apple. Unlock it in the Orchard, or get it as a perk.
- **Pause** with `P` or `Esc`.

Snakes grow every few seconds, so time is on your side, but they also get smarter as you go:

| Levels | Snake brain |
|---|---|
| 1–2 | Greedy: heads straight for you and can't see brambles |
| 3+ | Pathfinding, plus a telegraphed **lunge** (watch for the red "!") |
| 4+ | Can see brambles |
| 6+ | Avoids dead ends more and more often |
| 10+ | Can sometimes sniff hidden rot |

Every 5th level is a **boss level** with King Cobra Carl. From level 11 on, there's always more than one snake. The world theme changes every 5 levels: Orchard, Meadow, Desert, Frost, Moonlit Garden and Candy Kingdom.

**Progression:**
- Stars you collect are saved in the browser and spent in **the Orchard** on permanent upgrades and apple skins.
- After each level you pick 1 of 3 power-ups for the current run.
- There are three modes: **Sprout** (relaxed, good for kids), **Classic**, and **Rotten Core**, which unlocks once you reach level 10 in Classic.

## Competitive depth

- **Nerve:** slipping right past a snake's nose (a *close call*) builds a combo that multiplies every point you earn, up to ×6. A lunging snake that just misses counts double, and big moments trigger a beat of slow motion. Playing safe lets it cool off, so careful players can survive while brave players chase the high scores.
- **Grades:** every cleared level is graded S/A/B/C on speed, bites taken and peak Nerve, with bonus stars for good grades.
- **Level events:** from level 3, most non-boss levels roll a twist: Star Shower, Thick Fog, Golden Snake, Earthquake, Mirror Twin, Hungry Hour, Tailwind or Bramble Bloom.
- **Daily Run:** one seeded run per day. Everyone gets the same layouts, events and power-up offers, and Orchard upgrades are switched off so it's fair. Your first Daily each day pays streak-boosted stars, and the result can be shared as an emoji card.

## Phones

- **Swipe** (default on touch screens): swipe to roll, swipe again to turn (even mid-drag), tap to stop. The apple also stops when it bumps into something. A hold-to-steer **joystick** is available in the menu.
- Haptics on bites, crashes, close calls and quakes (Android; iOS browsers don't expose vibration).
- Installable as an app with offline play (`manifest.webmanifest` + `sw.js`). The service worker serves from cache and refreshes in the background, so an update shows on the *second* launch after a push.

## Hosting

The game is a static site on **GitHub Pages**, at `https://mattlavergne.github.io/apple/`.

It appears at **mattlavergne.com/apple** through the homepage Worker in
[`mattlavergne/landing-page`](https://github.com/mattlavergne/landing-page). An
`/apple` entry in that Worker's `APPS` registry opens the game in a mattOS app
window and reverse-proxies `/apple/_app/*` to the GitHub Pages copy. Pushing
here updates the live game. No change to the homepage is needed.

All asset paths in this repo are relative, so the game works under any sub-path.

## Running locally

The scripts are ES modules, so open the game through a local server, not `file://`:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

Add `?debug` to the URL to expose `window.__game` (e.g. `__game.level = 15; __game.startLevel()`).

`node tools/sim.mjs [runs] [mode] [dailySeed]` runs a simple bot through many headless games. It's a quick way to sanity-check difficulty after tuning `levelParams` in `js/config.js`.

## Code map

| File | What it does |
|---|---|
| `js/config.js` | Worlds, snakes, difficulty curve, perks, upgrades, skins |
| `js/engine.js` | Simulation: movement, snake AI (greedy / BFS / flood-fill), abilities, pickups (no DOM) |
| `js/render.js` | Canvas drawing: field, snakes, apple, particles |
| `js/main.js` | Screens, HUD, game loop, save hooks |
| `js/input.js` | Keyboard and touch joystick |
| `js/audio.js` | WebAudio sound effects and generated music |
| `js/save.js` | localStorage progress |
