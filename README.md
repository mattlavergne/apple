# The Apple 🍎

**Snake, flipped.** You're the apple. Lead the snake into walls, rocks, brambles, other snakes or its own tail. Whatever you do, don't get eaten.

Pure HTML/CSS/JS with no build step and no dependencies. All graphics are drawn on a canvas and all sounds are synthesized, so there are no image or audio files to load.

## Modes

- **Adventure** (the main mode): a Candy Crush-style map of **100 levels across 10 worlds** (Sunny Orchard, Sunset Meadow, Dusty Desert, Frosty Field, Moonlit Garden, Candy Kingdom, Autumn Woods, Seaside Dunes, Volcano Rim, Cloud Garden). Every 10th level is a boss. Each level has an **objective**: crash every snake, survive N seconds, collect N stars, or crash the golden snake (crashing every snake always wins too). Clear a level to unlock the next and earn **1–3 stars** (3 = no bites, 2 = one bite, 1 = cleared). Replay any unlocked level to improve.
  - Levels are generated from the level number with a fixed seed (`js/levels.js`), so **every player gets the same level 16**. Layout styles (pillars, fence rows, rooms, a walled arena, crossroads, islands, zigzags, mirrored patterns…) get more structured in later worlds, and each level has its own wall positions and a seeded mirror flip. Layouts are built on a 25×17 landscape grid and rotated for portrait phones, so the map is identical, just turned.
  - Difficulty is a gentle sawtooth: it dips at the start of each world, then climbs to the boss.
- **Endless**: one run, no end, with power-ups between levels, your nemesis, and Sprout / Classic / Rotten Core modes.
- **Daily Run**: the same seeded Endless run for everyone today.

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

Balance checks (headless bots, run per level):
- `node tools/camper.mjs [trials] [reaction]`: "drop a bramble and wait behind it". It should only pay off on the first couple of levels.
- `node tools/rotcamper.mjs [trials]`: "stand still and rot when the snake is close". It should almost never clear a level.
- `node tools/rotkite.mjs [trials]`: rot at the right moment, then run until the snake withers. This is the skill play, and it should usually work but take a while.
- `node tools/adventure.mjs [trials] [from] [to] [-v]`: plays every Adventure level (both orientations) and reports clear rates per world (`-v` for per-level detail).
- `node tools/bitetrap.mjs`: regression test. A snake that eats you in a dead end must back out, never hand you the level.
- `node tools/circler.mjs [trials]`: "run laps around the border". It should get bitten quickly.
- `node tools/nemesis.mjs [trials] [level]`: how often the general bot beats a normal snake versus a nemesis of rank 1–5.

`node tools/sim.mjs [runs] [mode] [dailySeed]` runs a simple bot through many headless games. It's a quick way to sanity-check difficulty after tuning `levelParams` in `js/config.js`.

## Code map

| File | What it does |
|---|---|
| `js/config.js` | Worlds, snakes, difficulty curve, perks, upgrades, skins |
| `js/levels.js` | The 100 Adventure levels: objectives, layout templates, deterministic generation |
| `js/engine.js` | Simulation: movement, snake AI (greedy / BFS / flood-fill), abilities, pickups (no DOM) |
| `js/render.js` | Canvas drawing: field, snakes, apple, particles |
| `js/main.js` | Screens, HUD, game loop, save hooks |
| `js/input.js` | Keyboard and touch joystick |
| `js/audio.js` | WebAudio sound effects and generated music |
| `js/save.js` | localStorage progress |
