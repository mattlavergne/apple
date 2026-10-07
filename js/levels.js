// Adventure mode: 100 hand-tuned-by-rules levels. Everything here is derived
// from the level number with a fixed seed, so every player gets the exact same
// level 16. Layouts are built on a canonical 25x17 landscape grid and rotated
// (transposed) for portrait screens, so the map is the same, just turned.
import { WORLDS, EVENTS } from './config.js';

export const ADVENTURE_LEVELS = 100;
export const LEVELS_PER_WORLD = 10;
const W = 25, H = 17;

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Which layout styles each world draws from: later worlds get more structure.
const WORLD_TEMPLATES = [
  ['open', 'scatter', 'pillars'],
  ['scatter', 'pillars', 'bars'],
  ['pillars', 'bars', 'islands'],
  ['bars', 'ring', 'islands'],
  ['ring', 'rooms', 'scatter'],
  ['rooms', 'symmetric', 'zigzag'],
  ['zigzag', 'cross', 'rooms'],
  ['islands', 'symmetric', 'ring'],
  ['cross', 'zigzag', 'rooms', 'bars'],
  ['rooms', 'ring', 'cross', 'zigzag', 'symmetric', 'pillars'],
];

const TEMPLATE_NAMES = {
  open: ['First Steps', 'Open Field', 'Clear Skies'],
  scatter: ['Pebble Patch', 'Stony Ground', 'Boulder Bumps'],
  pillars: ['Pillar Grove', 'Post Maze', 'Colonnade'],
  bars: ['Fence Rows', 'The Gaps', 'Hurdles'],
  ring: ['The Arena', 'Ring Road', 'Inner Circle'],
  rooms: ['Four Rooms', 'Doorways', 'The Hallways'],
  symmetric: ['Mirror Garden', 'Kaleidoscope', 'Twin Paths'],
  zigzag: ['Switchbacks', 'Staircase', 'Lightning'],
  cross: ['Crossroads', 'Compass', 'The Plus'],
  islands: ['Islands', 'Stepping Stones', 'Archipelago'],
};

const OBJECTIVE_TEXT = {
  crash: () => 'Crash every snake',
  survive: o => `Survive ${o.target} seconds`,
  stars: o => `Collect ${o.target} stars`,
  golden: () => 'Crash the golden snake',
};
export const objectiveText = o => OBJECTIVE_TEXT[o.type](o);
export const OBJECTIVE_ICON = { crash: '💥', survive: '⏱️', stars: '⭐', golden: '👑' };

// The full definition of adventure level n (1-100).
export function adventureLevel(n) {
  const rnd = mulberry32(n * 9973 + 17);
  const world = Math.min(WORLDS.length - 1, Math.floor((n - 1) / LEVELS_PER_WORLD));
  const k = (n - 1) % LEVELS_PER_WORLD;
  const boss = k === LEVELS_PER_WORLD - 1;
  // Difficulty (in Endless-level units): a gentle sawtooth that dips at the
  // start of each new world, then climbs to the world's boss.
  const diff = Math.max(1, Math.round(1 + world * 1.35 + k * 0.3));

  let objective;
  if (boss) objective = { type: 'crash' };
  else if (n <= 3) objective = [{ type: 'crash' }, { type: 'survive', target: 25 }, { type: 'crash' }][n - 1];
  else {
    const r = rnd();
    if (r < 0.38) objective = { type: 'crash' };
    else if (r < 0.68) objective = { type: 'survive', target: 30 + world * 3 + Math.round(rnd() * 6) };
    else if (r < 0.86 || n < 12) objective = { type: 'stars', target: 8 + world + Math.round(rnd() * 3) };
    else objective = { type: 'golden' };
  }

  let snakes = boss ? (world >= 6 ? 3 : 2) : 1 + (world >= 3 && rnd() < 0.35 ? 1 : 0) + (world >= 7 && rnd() < 0.25 ? 1 : 0);
  if (objective.type === 'golden') snakes = Math.max(2, snakes);
  snakes = Math.min(3, snakes);

  let event = null;
  if (objective.type === 'golden') event = 'golden';
  else if (!boss && n >= 8 && rnd() < 0.3) {
    const pool = Object.keys(EVENTS).filter(e => e !== 'golden');
    event = pool[Math.floor(rnd() * pool.length)];
  }

  const pool = WORLD_TEMPLATES[world];
  const template = n === 1 ? 'open' : pool[Math.floor(rnd() * pool.length)];
  const names = TEMPLATE_NAMES[template];
  let name = names[n % names.length];
  // Number repeats within a world: "Four Rooms", "Four Rooms II", ...
  let repeat = 0;
  for (let m = world * LEVELS_PER_WORLD + 1; m < n; m++) if (adventureLevel(m).name === name || adventureLevel(m).baseName === name) repeat++;
  const baseName = name;
  if (repeat) name += ' ' + ['II', 'III', 'IV', 'V', 'VI'][Math.min(4, repeat - 1)];

  return { baseName, n, world, k, boss, diff, objective, snakes, event, template, name, seed: n * 7919 + 1 };
}

// ------------------------------------------------------------------ layouts
export function buildLayout(def, cols, rows) {
  const rnd = mulberry32(def.seed);
  const g = new Uint8Array(W * H);
  const inB = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const set = (x, y) => { if (inB(x, y)) g[y * W + x] = 1; };
  const clr = (x, y) => { if (inB(x, y)) g[y * W + x] = 0; };
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const density = def.k / (LEVELS_PER_WORLD - 1); // 0..1 within the world

  const walk = (n, size) => {
    for (let c = 0; c < n; c++) {
      let x = ri(1, W - 2), y = ri(1, H - 2);
      for (let s = 0; s < size; s++) {
        set(x, y);
        const d = [[1, 0], [-1, 0], [0, 1], [0, -1]][ri(0, 3)];
        x += d[0]; y += d[1];
      }
    }
  };
  const hLine = (y, x0, x1, gaps) => {
    for (let x = x0; x <= x1; x++) set(x, y);
    for (let i = 0; i < gaps; i++) { const gx = ri(x0, x1 - 1); clr(gx, y); clr(gx + 1, y); }
  };
  const vLine = (x, y0, y1, gaps) => {
    for (let y = y0; y <= y1; y++) set(x, y);
    for (let i = 0; i < gaps; i++) { const gy = ri(y0, y1 - 1); clr(x, gy); clr(x, gy + 1); }
  };

  switch (def.template) {
    case 'open': walk(2 + Math.round(density * 2), 1); break;
    case 'scatter': walk(3 + Math.round(density * 5), ri(2, 4)); break;
    case 'pillars': {
      const step = density > 0.5 ? 3 : 4, ox = ri(1, 2), oy = ri(1, 2), big = rnd() < 0.4;
      for (let y = oy + 1; y < H - 1; y += step) for (let x = ox + 1; x < W - 1; x += step) {
        if (rnd() < 0.18) continue;
        set(x, y);
        if (big) set(x + 1, y);
      }
      break;
    }
    case 'bars': {
      const n = density > 0.4 ? 3 : 2;
      for (let i = 1; i <= n; i++) hLine(Math.round(i * H / (n + 1)), 3, W - 4, density > 0.6 ? 1 : 2);
      break;
    }
    case 'ring': {
      const x0 = 5, x1 = W - 6, y0 = 4, y1 = H - 5;
      hLine(y0, x0, x1, 0); hLine(y1, x0, x1, 0); vLine(x0, y0, y1, 0); vLine(x1, y0, y1, 0);
      // a door on every side, placed by the seed
      const dx = ri(x0 + 2, x1 - 3), dy = ri(y0 + 2, y1 - 3);
      clr(dx, y0); clr(dx + 1, y0); clr(W - 1 - dx, y1); clr(W - 2 - dx, y1);
      clr(x0, dy); clr(x0, dy + 1); clr(x1, H - 1 - dy); clr(x1, H - 2 - dy);
      if (density > 0.5) walk(2, 2);
      break;
    }
    case 'rooms': {
      const xa = ri(6, 9), xb = ri(15, 18), ym = ri(6, 10);
      vLine(xa, 0, H - 1, 2); vLine(xb, 0, H - 1, 2);
      for (const [a, b] of [[0, xa - 1], [xa + 1, xb - 1], [xb + 1, W - 1]]) {
        if (rnd() < 0.25) continue; // sometimes a room opens straight through
        for (let x = a; x <= b; x++) set(x, ym);
        const gx = ri(a, b - 1); clr(gx, ym); clr(gx + 1, ym);
      }
      if (density > 0.5) walk(2, 2);
      break;
    }
    case 'cross': {
      const vx = ri(10, 14), hy = ri(6, 10);
      vLine(vx, 2, H - 3, 0); hLine(hy, 3, W - 4, 0);
      for (const [x, y, h] of [[vx, ri(2, 5), 0], [vx, ri(11, H - 3), 0], [ri(3, 8), hy, 1], [ri(16, W - 4), hy, 1]]) { clr(x, y); clr(x + h, y + 1 - h); }
      if (density > 0.4) walk(3, 2);
      break;
    }
    case 'islands': {
      for (let y = 3; y < H - 2; y += 5) for (let x = 3; x < W - 3; x += 6) {
        const jx = x + ri(-1, 1), jy = y + ri(-1, 1), w = ri(2, 3), h = ri(1, 2);
        for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) set(jx + xx, jy + yy);
      }
      break;
    }
    case 'zigzag': {
      const n = density > 0.5 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        let x = 4 + i * Math.floor((W - 8) / n), y = ri(1, 3);
        const down = rnd() < 0.5 ? 1 : -1;
        if (down < 0) y = H - 1 - y;
        for (let s = 0; s < 6; s++) { set(x, y); set(x + 1, y); x += 1; y += down * 2; set(x, y - down); }
      }
      break;
    }
    case 'symmetric': {
      const n = 2 + Math.round(density * 3);
      for (let c = 0; c < n; c++) {
        let x = ri(1, 11), y = ri(1, 7);
        for (let s = 0; s < ri(2, 4); s++) {
          set(x, y); set(W - 1 - x, y); set(x, H - 1 - y); set(W - 1 - x, H - 1 - y);
          const d = [[1, 0], [0, 1]][ri(0, 1)];
          x = Math.min(11, x + d[0]); y = Math.min(7, y + d[1]);
        }
      }
      break;
    }
  }

  // A seeded mirror flip, so two levels of the same style still look different.
  const fx = rnd() < 0.5, fy = rnd() < 0.5;
  if (fx || fy) {
    const c = g.slice();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g[y * W + x] = c[(fy ? H - 1 - y : y) * W + (fx ? W - 1 - x : x)];
  }

  // Keep the apple's start and each possible snake spawn (in both
  // orientations) open, and only cut a lane to a corner if it is walled off.
  const cx = 12, cy = 8;
  for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) clr(x, y);
  const corners = [[2, 2], [W - 3, 2], [2, H - 3], [W - 3, H - 3]];
  for (const [sx, sy] of corners) {
    // A snake spawns 3 long with its tail at the edge, heading inward along a
    // row (landscape) or a column (portrait): clear that plus 3 tiles ahead.
    const ix = sx < cx ? 1 : -1, iy = sy < cy ? 1 : -1;
    for (let d = -2; d <= 3; d++) { clr(sx + d * ix, sy); clr(sx, sy + d * iy); }
  }
  const reach = () => {
    const seen = new Uint8Array(W * H);
    const q = [cy * W + cx];
    seen[q[0]] = 1;
    while (q.length) {
      const k = q.pop(), x = k % W, y = (k - x) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!inB(nx, ny)) continue;
        const nk = ny * W + nx;
        if (seen[nk] || g[nk]) continue;
        seen[nk] = 1; q.push(nk);
      }
    }
    return seen;
  };
  let seen = reach();
  for (const [sx, sy] of corners) {
    if (seen[sy * W + sx]) continue;
    // Walled off: open a door along the shortest straight route to the centre.
    for (let x = Math.min(sx, cx); x <= Math.max(sx, cx); x++) clr(x, sy);
    for (let y = Math.min(sy, cy); y <= Math.max(sy, cy); y++) clr(cx, y);
    seen = reach();
  }
  // Seal any pocket you couldn't reach anyway.
  for (let k = 0; k < g.length; k++) if (!g[k] && !seen[k]) g[k] = 1;

  // Map onto the actual grid (rotated for portrait).
  const out = new Uint8Array(cols * rows);
  const portrait = cols < rows;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const k = portrait ? x * W + y : y * W + x;
    out[y * cols + x] = g[k] || 0;
  }
  return out;
}
