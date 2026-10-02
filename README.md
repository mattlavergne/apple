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

## Hosting at mattlavergne.com/apple

All paths are relative, so the whole folder works from any sub-path. There are two easy options:

1. **Copy the files** (`index.html`, `favicon.svg`, `css/`, `js/`, `assets/`) into an `apple/` folder on the main site.
2. **GitHub Pages:** if `mattlavergne.com` is the custom domain of your `<user>.github.io` site, any *project* repo with Pages turned on is served at `mattlavergne.com/<repo-name>/`. Rename this repo to `apple` (Settings → General), then turn on Pages (Settings → Pages → Deploy from branch → `main` / root). It will then be live at `mattlavergne.com/apple/` with no copying.

The `og:image` / `og:url` tags in `index.html` assume the final URL is `https://mattlavergne.com/apple/`.

### Link for the homepage

```html
<a href="/apple/" class="game-link">
  🍎 <strong>The Apple</strong> — Snake, but you're the apple. Make the snake crash!
</a>
```

## Running locally

The scripts are ES modules, so open the game through a local server, not `file://`:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

Add `?debug` to the URL to expose `window.__game` (e.g. `__game.level = 15; __game.startLevel()`).

`node tools/sim.mjs [runs] [mode]` runs a simple bot through many headless games. It's a quick way to sanity-check difficulty after tuning `levelParams` in `js/config.js`.

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
