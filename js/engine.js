// Game simulation. No DOM access here, so it can also run headless (see tools/sim.mjs).
import {
  WORLDS, worldIndexFor, levelParams, speciesFor, baseStats, UPGRADES, PERKS, MODES, eventFor,
  SPECIES, nemesisName, nemesisBounty,
} from './config.js';

export const DIRS4 = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const easeOut = t => 1 - (1 - t) * (1 - t);

export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const hash = (...xs) => xs.reduce((h, x) => Math.imul(h ^ (x | 0), 2654435761) >>> 0, 0x9e3779b9);

// "Level" randomness: board layout, events, pickups and perk offers. In a Daily
// Run it is seeded, so every player gets the same days. Moment-to-moment noise
// (particles, snake jitter) stays on Math.random.
let lr = Math.random;
const lrand = (a, b) => a + lr() * (b - a);
const lrandi = (a, b) => Math.floor(lrand(a, b + 1));
const lpick = arr => arr[Math.floor(lr() * arr.length)];

const KILL_TEXT = {
  wall: 'BONK!', rock: 'BONK!', hedge: 'HEDGED!', self: 'KNOTTED!', tangle: 'TANGLED!', thorns: 'THORNED!', poison: 'POISONED!',
};
const KILL_MULT = { wall: 1, rock: 1, hedge: 1.5, self: 1, tangle: 1.5, thorns: 1.5, poison: 2 };
export const GRADE_STARS = { S: 15, A: 8, B: 3, C: 0 };

export class Game {
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.cols = 25;
    this.rows = 17;
    this.state = 'idle';
    this.time = 0;
    this.snakes = [];
    this.particles = [];
    this.floaters = [];
  }

  sfx(name) { if (!this.demo && this.hooks.sfx) this.hooks.sfx(name); }
  emit(name, data) { if (this.hooks.event) this.hooks.event(name, data, this); }

  // ---------------------------------------------------------------- run / level
  newRun({ mode = 'classic', upgrades = {}, demo = false, cols = 25, rows = 17, level = 1, seed = null, nemesis = null } = {}) {
    this.mode = mode;
    this.demo = demo;
    this.seed = seed;
    this.daily = seed != null;
    // Your nemesis ambushes you once per run, somewhere in levels 3-6.
    this.nemesis = nemesis && !demo && !this.daily ? { ...nemesis } : null;
    this.nemesisLevel = this.nemesis ? 3 + Math.floor(Math.random() * 4) : 0;
    this.nemesisBeaten = false;
    this.eatenBy = null;
    this.cols = cols;
    this.rows = rows;
    const s = baseStats(mode);
    for (const u of UPGRADES) {
      const n = upgrades[u.id] || 0;
      if (n) u.apply(s, n);
    }
    this.stats = s;
    this.perks = {};
    this.level = level;
    this.score = 0;
    this.starsRun = 0;
    this.starFrac = 0;
    this.bites = s.maxBites;
    this.kills = { wall: 0, rock: 0, hedge: 0, self: 0, tangle: 0, thorns: 0, poison: 0 };
    this.lastKill = -10;
    this.closeCalls = 0;
    this.nerveBest = 0;
    this.grades = [];
    this.startLevel();
  }

  // Close-call combo. Every near miss raises it; it fades after a few calm seconds.
  get nerveMult() { return 1 + 0.25 * this.nerve; }

  get rotUnlocked() { return this.demo || this.level >= 3 || this.mode === 'core'; }
  get starMult() { return (MODES[this.mode] || MODES.classic).starMult * this.stats.starBonus; }

  startLevel() {
    const { cols, rows } = this;
    lr = this.seed != null ? mulberry32(hash(this.seed, this.level)) : Math.random;
    this.perkRng = this.seed != null ? mulberry32(hash(this.seed, this.level, 77)) : Math.random;
    this.params = { ...levelParams(this.level, this.mode) };
    this.world = this.demo ? randi(0, WORLDS.length - 1) : worldIndexFor(this.level);
    this.event = this.demo ? null : eventFor(this.level, lr);
    this.applyEvent();
    this.rocks = new Uint8Array(cols * rows);
    this.brambles = new Map();
    this.pickups = [];
    this.particles = [];
    this.floaters = [];
    this.decoy = null;
    this.shake = 0;
    this.growT = 0;
    this.pickT = lrand(2, 4);
    this.nerve = 0;
    this.nerveT = 0;
    this.nervePeak = 0;
    this.slow = 0;
    this.levelBites = 0;
    this.hungerT = 0;
    this.hunger = 1;
    this.hungerStage = 0;
    this.ring = 0;        // how many outer rings have overgrown into hedge
    this.ringNext = 0;
    this.ringWarnT = 0;
    this.quakeT = 6;
    this.rockVersion = 0;
    this.ghost = this.event === 'mirror' ? { x: 0, y: 0, down: 0, hidden: false } : null;
    this.thorns = this.stats.thornCap;
    this.thornRegenT = 0;
    this.levelTime = 0;
    this.clearT = 0;
    this.levelSeed = lr() * 1e9;

    const cx = Math.floor(cols / 2), cy = Math.floor(rows / 2);
    this.apple = {
      x: cx, y: cy, fromX: cx, fromY: cy, animT: 1, animDur: 0.1, moveT: 0,
      // Rot starts each level half-charged so it can't open every level.
      facing: { x: 0, y: -1 }, prev: null, invuln: 0, rot: 0, rotCd: (this.stats.rotCd + this.stats.rotDur) * 0.5, dashCd: 0, decoyCd: 0,
      bump: 0, bumpDir: { x: 0, y: 0 }, squash: 0, dashFx: 0, drop: 1, dying: 0, aiT: 0,
    };

    // Snakes start short in a corner and grow out to full length.
    const spots = [
      { x: 2, y: 2, d: { x: 1, y: 0 } },
      { x: cols - 3, y: rows - 3, d: { x: -1, y: 0 } },
      { x: cols - 3, y: 2, d: { x: 0, y: 1 } },
      { x: 2, y: rows - 3, d: { x: 0, y: -1 } },
    ];
    for (let i = spots.length - 1; i > 0; i--) {
      const j = Math.floor(lr() * (i + 1));
      [spots[i], spots[j]] = [spots[j], spots[i]];
    }
    const p = this.params;
    this.snakes = [];
    for (let i = 0; i < p.snakeCount; i++) {
      const sp = spots[i];
      const body = [0, 1, 2].map(k => ({ x: sp.x - sp.d.x * k, y: sp.y - sp.d.y * k }));
      const species = speciesFor(this.level, i);
      this.snakes.push({
        id: i, species, body, old: body.map(c => ({ ...c })), dir: { ...sp.d }, acc: 0,
        interval: p.step, grow: p.startLen - 3, dead: false, deadT: 0, gone: false, popped: 0,
        stun: 0, chomp: 0, confused: 0, lunge: 'none', lungeT: 0, lungeCd: rand(1.5, p.lungeCd),
        fast: 0, sniffShown: false, sick: false, sickT: 0, tongue: rand(0.5, 2), tongueT: 0,
        blink: rand(2, 5), blinkT: 0, boss: species.id === 'cobra' && p.boss, cause: null,
      });
    }

    if (this.event === 'golden') this.snakes[lrandi(0, this.snakes.length - 1)].golden = true;
    if (this.nemesis && this.level === this.nemesisLevel && !this.nemesisBeaten) {
      // The grudge match: your nemesis takes the first slot, faster, smarter and longer.
      const s = this.snakes[0], n = this.nemesis;
      s.species = SPECIES.find(sp => sp.id === n.species) || s.species;
      s.nemesis = n;
      s.golden = false;
      s.speedMul = 1 + 0.03 * n.rank;
      s.grow += 1 + n.rank;
      s.lungeCd = rand(0.5, 1.5);
    }

    this.generateRocks();
    this.updateGhost();
    this.state = this.demo ? 'play' : 'countdown';
    this.countT = 3;
    this.lastCount = 99;
    this.emit('level');
  }

  // Hunger ramps snake speed during a level: HUNGRY at 1.3x, FRENZY at 1.6x.
  updateHunger(dt) {
    const p = this.params;
    this.hungerT += dt;
    this.hunger = Math.min(p.hungerCap, 1 + p.hungerRate * this.hungerT);
    const stage = this.hunger >= 1.6 ? 2 : this.hunger >= 1.3 ? 1 : 0;
    if (stage > this.hungerStage && !this.demo) {
      const cx = this.cols / 2, cy = this.rows / 2;
      if (stage === 1) this.floater(cx, cy - 2, 'The snakes are getting HUNGRY\u2026', '#ffb74d', 0.75, 1.8);
      else {
        this.floater(cx, cy - 2, 'FRENZY!', '#ff5252', 1.5, 1.8);
        this.shake = Math.max(this.shake, 0.6);
      }
      this.sfx(stage === 2 ? 'frenzy' : 'hiss');
      this.emit('hunger', stage);
      if (stage > this.ring && stage > this.ringNext) {
        // The orchard overgrows from the outside in: no more safe laps round the edge.
        this.ringNext = stage;
        this.ringWarnT = 3;
        this.floater(cx, cy - 0.9, 'The hedges are closing in!', '#a5d6a7', 0.6, 2.2);
        this.emit('hedgeWarn');
      }
    }
    this.hungerStage = stage;
  }

  edgeDist(x, y) { return Math.min(x, y, this.cols - 1 - x, this.rows - 1 - y); }

  closeRings(n) {
    let closed = 0;
    for (let y = 0; y < this.rows; y++) for (let x = 0; x < this.cols; x++) {
      const e = this.edgeDist(x, y);
      if (e < this.ring || e >= n) continue;
      const k = this.idx(x, y);
      if (this.rocks[k]) continue;
      this.rocks[k] = 2; // 2 = hedge
      this.brambles.delete(k);
      if (Math.random() < 0.35) this.burst(x + 0.5, y + 0.5, { n: 3, colors: ['#2e7d32', '#66bb6a', '#795548'], speed: 1.5, life: 0.6, size: 0.1, type: 'leaf' });
      closed++;
    }
    this.ring = n;
    this.pickups = this.pickups.filter(p => !this.rocks[this.idx(Math.round(p.x), Math.round(p.y))]);
    if (this.decoy && this.rocks[this.idx(this.decoy.x, this.decoy.y)]) this.decoy = null;
    this.rockVersion++;
    this.shake = Math.max(this.shake, 0.5);
    this.sfx('quake');
    this.emit('hedge', n);
    // Shove the apple inward if the hedge grew over it, or out of a sealed pocket.
    const a = this.apple;
    const g = this.appleBlockGrid();
    if (this.rocks[this.idx(a.x, a.y)] || this.flood(a.x, a.y, g, 12) < 12) {
      let best = null, bd = Infinity;
      for (let y = 0; y < this.rows; y++) for (let x = 0; x < this.cols; x++) {
        if (g[this.idx(x, y)] || this.flood(x, y, g, 12) < 12) continue;
        const d = Math.abs(x - a.x) + Math.abs(y - a.y);
        if (d < bd) { bd = d; best = { x, y }; }
      }
      if (best) {
        const rp = this.appleRenderPos();
        a.fromX = rp.x; a.fromY = rp.y; a.x = best.x; a.y = best.y;
        a.animT = 0; a.animDur = 0.18; a.squash = 1.2; a.prev = null;
        a.invuln = Math.max(a.invuln, 0.5);
      }
    }
    return closed;
  }

  // Smarter snakes aim where you're heading, not where you are. With two or
  // more snakes, every other one flanks while the first chases.
  interceptTarget(s) {
    const a = this.apple, h = s.body[0];
    const d = manhattan(h, a);
    if (d <= 2 || this.time - (a.lastMoveAt ?? -9) > 0.45) return a;
    if (this.time > (s.planUntil || 0)) {
      const live = this.snakes.filter(o => !o.dead);
      const flank = live.length > 1 && live.indexOf(s) % 2 === 1;
      s.intercepting = this.params.intercept > 0 && (flank || Math.random() < this.params.intercept);
      s.planUntil = this.time + 1.2 + Math.random();
    }
    if (!s.intercepting) return a;
    const lead = Math.min(5, Math.ceil(d / 2));
    let x = a.x + a.facing.x * lead, y = a.y + a.facing.y * lead;
    x = Math.max(0, Math.min(this.cols - 1, x));
    y = Math.max(0, Math.min(this.rows - 1, y));
    // Back off toward the apple until the cell is open.
    while ((x !== a.x || y !== a.y) && (this.rocks[this.idx(x, y)] || this.snakeAt(x, y))) {
      x -= Math.sign(x - a.x); y -= Math.sign(y - a.y);
    }
    return { x, y };
  }

  // Level events tweak the rules for one level so no two levels play the same.
  applyEvent() {
    const p = this.params;
    this.ev = { appleStep: 1, luck: 1, thornRegen: 1, thornLife: 1 };
    switch (this.event) {
      case 'hungry': p.growEvery *= 0.5; p.step *= 1.12; break;
      case 'tailwind': p.step *= 0.88; this.ev.appleStep = 0.78; break;
      case 'bloom': this.ev.thornRegen = 0.2; this.ev.thornLife = 0.55; break;
      case 'feast': this.ev.luck = 3.2; break;
    }
  }

  // The mirror twin copies the apple across the vertical centre line.
  updateGhost() {
    const g = this.ghost;
    if (!g) return;
    g.x = this.cols - 1 - this.apple.x;
    g.y = this.apple.y;
    const k = this.idx(g.x, g.y);
    g.hidden = g.down > 0 || !!this.rocks[k] || this.brambles.has(k) || !!this.snakeAt(g.x, g.y)
      || (g.x === this.apple.x && g.y === this.apple.y);
  }

  quake() {
    const { cols } = this;
    const rocks = [];
    for (let k = 0; k < this.rocks.length; k++) if (this.rocks[k] === 1) rocks.push(k);
    let moved = 0;
    for (let n = 0; n < 4 && rocks.length; n++) {
      const k = rocks.splice(Math.floor(lr() * rocks.length), 1)[0];
      const x = k % cols, y = (k - x) / cols;
      const d = lpick(DIRS4);
      const nx = x + d.x, ny = y + d.y;
      if (!this.appleCanEnter(nx, ny) || (nx === this.apple.x && ny === this.apple.y)) continue;
      if (this.pickups.some(p => Math.round(p.x) === nx && Math.round(p.y) === ny)) continue;
      this.rocks[k] = 0;
      this.rocks[this.idx(nx, ny)] = 1;
      // Never wall the apple in.
      const g = this.appleBlockGrid();
      const open = g.reduce((c, v) => c + (v ? 0 : 1), 0);
      if (this.flood(this.apple.x, this.apple.y, g, Infinity) < open * 0.8) {
        this.rocks[k] = 1; this.rocks[this.idx(nx, ny)] = 0; continue;
      }
      moved++;
      this.burst(nx + 0.5, ny + 0.5, { n: 8, colors: ['#9e9e9e', '#bdbdbd', '#795548'], speed: 2, life: 0.5, size: 0.1 });
    }
    if (moved) {
      this.rockVersion++;
      this.shake = Math.max(this.shake, 0.7);
      this.sfx('quake');
      this.emit('quake');
    }
  }

  generateRocks() {
    const { cols, rows } = this;
    const reserved = new Uint8Array(cols * rows);
    const reserve = (x, y, r) => {
      for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) {
        if (this.inB(xx, yy)) reserved[yy * cols + xx] = 1;
      }
    };
    reserve(this.apple.x, this.apple.y, 2);
    for (const s of this.snakes) {
      for (const c of s.body) reserve(c.x, c.y, 1);
      for (let k = 1; k <= 5; k++) reserve(s.body[0].x + s.dir.x * k, s.body[0].y + s.dir.y * k, 1);
    }
    for (let attempt = 0; attempt < 40; attempt++) {
      this.rocks.fill(0);
      for (let c = 0; c < this.params.rockClusters; c++) {
        let x = lrandi(1, cols - 2), y = lrandi(1, rows - 2);
        const size = lrandi(1, 4);
        for (let k = 0; k < size; k++) {
          if (this.inB(x, y) && !reserved[y * cols + x]) this.rocks[y * cols + x] = 1;
          const d = lpick(DIRS4);
          x += d.x; y += d.y;
        }
      }
      // Every open cell must stay reachable, otherwise retry.
      const open = this.rocks.reduce((n, r) => n + (r ? 0 : 1), 0);
      if (this.flood(this.apple.x, this.apple.y, this.rocks, Infinity) === open) return;
    }
    this.rocks.fill(0);
  }

  perkChoices(n = 3) {
    const pool = PERKS.filter(p => (this.perks[p.id] || 0) < p.max && (!p.when || p.when(this.stats)));
    const out = [];
    while (out.length < n && pool.length) out.push(pool.splice(Math.floor(this.perkRng() * pool.length), 1)[0]);
    return out;
  }

  applyPerk(id) {
    const perk = PERKS.find(p => p.id === id);
    if (!perk) return;
    perk.apply(this.stats);
    this.perks[id] = (this.perks[id] || 0) + 1;
    if (perk.heal) this.bites = this.stats.maxBites;
  }

  nextLevel() {
    this.level++;
    this.bites = Math.min(this.stats.maxBites, this.bites + 1);
    this.startLevel();
  }

  // ---------------------------------------------------------------- helpers
  inB(x, y) { return x >= 0 && y >= 0 && x < this.cols && y < this.rows; }
  idx(x, y) { return y * this.cols + x; }

  snakeAt(x, y) {
    for (const s of this.snakes) {
      if (s.gone) continue;
      for (let i = s.popped; i < s.body.length; i++) if (s.body[i].x === x && s.body[i].y === y) return s;
    }
    return null;
  }

  appleCanEnter(x, y) {
    if (!this.inB(x, y)) return false;
    const k = this.idx(x, y);
    if (this.rocks[k] || this.brambles.has(k)) return false;
    return !this.snakeAt(x, y);
  }

  appleBlockGrid() {
    const g = Uint8Array.from(this.rocks);
    for (const k of this.brambles.keys()) g[k] = 1;
    for (const s of this.snakes) {
      if (s.gone) continue;
      for (let i = s.popped; i < s.body.length; i++) g[this.idx(s.body[i].x, s.body[i].y)] = 1;
    }
    return g;
  }

  flood(sx, sy, blocked, limit) {
    const { cols, rows } = this;
    if (!this.inB(sx, sy) || blocked[sy * cols + sx]) return 0;
    const seen = new Uint8Array(cols * rows);
    const q = [sy * cols + sx];
    seen[q[0]] = 1;
    let n = 0;
    while (q.length && n < limit) {
      const k = q.pop();
      n++;
      const x = k % cols, y = (k - x) / cols;
      for (const d of DIRS4) {
        const nx = x + d.x, ny = y + d.y;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const nk = ny * cols + nx;
        if (seen[nk] || blocked[nk]) continue;
        seen[nk] = 1;
        q.push(nk);
      }
    }
    return n;
  }

  appleRenderPos() {
    const a = this.apple;
    const t = easeOut(Math.min(1, a.animT));
    return { x: a.fromX + (a.x - a.fromX) * t, y: a.fromY + (a.y - a.fromY) * t };
  }

  snakeRenderT(s) {
    if (s.dead || s.stun > 0 || s.lunge === 'windup' || this.state !== 'play') return 1;
    return Math.min(1, s.acc / s.interval);
  }

  // ---------------------------------------------------------------- update
  update(dt, input) {
    if (this.slow > 0 && this.state === 'play') {
      this.slow -= dt;
      dt *= 0.35;
    }
    this.time += dt;
    this.updateFx(dt);
    if (this.state === 'paused' || this.state === 'idle') return;

    for (const s of this.snakes) this.animateSnake(s, dt);
    const a = this.apple;
    a.animT = Math.min(1, a.animT + dt / a.animDur);
    a.squash = Math.max(0, a.squash - dt * 5);
    a.bump = Math.max(0, a.bump - dt * 6);
    a.drop = Math.max(0, a.drop - dt * 2.5);
    a.dashFx = Math.max(0, a.dashFx - dt * 4);

    if (this.state === 'countdown') {
      this.countT -= dt;
      const c = Math.ceil(this.countT);
      if (c !== this.lastCount && c > 0) { this.lastCount = c; this.sfx('count'); }
      if (this.countT <= 0) { this.state = 'play'; this.sfx('go'); this.emit('go'); }
      return;
    }
    if (this.state === 'clear') {
      this.clearT -= dt;
      if (this.clearT <= 0) {
        if (this.demo) { this.level = randi(2, 8); this.params = levelParams(this.level, this.mode); this.startLevel(); }
        else { this.state = 'cleared'; this.emit('cleared'); }
      }
      return;
    }
    if (this.state === 'dying') {
      a.dying += dt;
      if (a.dying > 1.8) { this.state = 'over'; this.emit('over'); }
      return;
    }
    if (this.state !== 'play') return;

    this.levelTime += dt;
    this.updateHunger(dt);
    if (!this.demo) this.score += dt * 5 * this.level * this.nerveMult;
    if (this.nerve > 0) {
      this.nerveT -= dt;
      if (this.nerveT <= 0) {
        const rp = this.appleRenderPos();
        this.floater(rp.x + 0.5, rp.y - 0.2, 'nerve cooled', '#b3e5fc', 0.45);
        this.nerve = 0;
        this.emit('nerve', 0);
      }
    }
    if (this.ringWarnT > 0) {
      this.ringWarnT -= dt;
      if (this.ringWarnT <= 0) this.closeRings(this.ringNext);
    }
    if (this.event === 'quake') {
      this.quakeT -= dt;
      if (this.quakeT <= 0) { this.quakeT = 6; this.quake(); }
    }
    if (this.ghost && this.ghost.down > 0) this.ghost.down -= dt;
    this.updateGhost();
    this.updateApple(dt, input);
    if (this.state !== 'play') return;
    this.updateSnakes(dt);
    if (this.state !== 'play') return;
    this.updateBrambles(dt);
    this.updatePickups(dt);

    this.growT += dt;
    if (this.growT >= this.params.growEvery) {
      this.growT -= this.params.growEvery;
      for (const s of this.snakes) if (!s.dead && !s.sick) s.grow++;
    }
  }

  // ---------------------------------------------------------------- apple
  updateApple(dt, input) {
    const a = this.apple, st = this.stats;
    a.invuln = Math.max(0, a.invuln - dt);
    a.rot = Math.max(0, a.rot - dt);
    a.rotCd = Math.max(0, a.rotCd - dt);
    a.dashCd = Math.max(0, a.dashCd - dt);
    a.decoyCd = Math.max(0, a.decoyCd - dt);
    if (this.thorns < st.thornCap) {
      this.thornRegenT += dt;
      if (this.thornRegenT >= st.thornRegen * this.ev.thornRegen) { this.thornRegenT = 0; this.thorns++; }
    } else this.thornRegenT = 0;

    if (this.demo) input = this.demoInput(dt);
    if (input) {
      while (input.actions.length) this.useAbility(input.actions.shift());
    }
    a.moveT -= dt;
    if (a.moveT <= 0 && input) {
      const d = input.taps.shift() || input.held;
      if (d) {
        a.facing = { x: d.x, y: d.y };
        if (this.tryMove(d)) a.moveT = st.appleStep * this.appleStepMul();
        else {
          if (a.bump <= 0.01) this.sfx('bump');
          this.emit('bump');
          a.bump = 1; a.bumpDir = { ...d }; a.moveT = 0.09;
        }
      }
    }
    if (a.moveT < -1) a.moveT = 0;
  }

  tryMove(d) {
    const a = this.apple;
    const nx = a.x + d.x, ny = a.y + d.y;
    if (!this.appleCanEnter(nx, ny)) return false;
    const rp = this.appleRenderPos();
    a.fromX = rp.x; a.fromY = rp.y;
    a.prev = { x: a.x, y: a.y };
    a.x = nx; a.y = ny;
    a.lastMoveAt = this.time;
    a.animT = 0;
    a.animDur = this.stats.appleStep * this.appleStepMul() * 0.95;
    a.squash = 1;
    return true;
  }

  useAbility(name) {
    if (this.state !== 'play') return;
    const ok = this['ability_' + name] ? this['ability_' + name]() : false;
    if (!ok) { this.sfx('nope'); this.emit('nope', name); }
  }

  ability_dash() {
    const a = this.apple;
    if (a.dashCd > 0) return false;
    const d = a.facing;
    let x = a.x, y = a.y, n = 0;
    const cells = [];
    for (let i = 0; i < this.stats.dashDist; i++) {
      if (!this.appleCanEnter(x + d.x, y + d.y)) break;
      x += d.x; y += d.y; n++;
      cells.push({ x, y });
    }
    if (!n) return false;
    const rp = this.appleRenderPos();
    a.fromX = rp.x; a.fromY = rp.y;
    a.prev = { x: x - d.x, y: y - d.y };
    a.x = x; a.y = y;
    a.animT = 0; a.animDur = 0.09; a.squash = 1.4; a.dashFx = 1;
    a.lastMoveAt = this.time;
    a.invuln = Math.max(a.invuln, 0.15);
    a.dashCd = this.stats.dashCd;
    a.moveT = Math.min(a.moveT, 0.05);
    for (const c of cells) this.burst(c.x + 0.5, c.y + 0.5, { n: 5, colors: ['#ffffff', '#e8f7ff'], speed: 1.5, life: 0.4, size: 0.12 });
    this.sfx('dash');
    return true;
  }

  ability_thorn() {
    const a = this.apple;
    if (this.thorns <= 0) return false;
    const free = (x, y) => this.appleCanEnter(x, y) && !(x === a.x && y === a.y) && !(this.decoy && this.decoy.x === x && this.decoy.y === y);
    let cell = null;
    if (a.prev && manhattan(a.prev, a) === 1 && free(a.prev.x, a.prev.y)) cell = a.prev;
    if (!cell && free(a.x - a.facing.x, a.y - a.facing.y)) cell = { x: a.x - a.facing.x, y: a.y - a.facing.y };
    if (!cell) {
      for (const d of DIRS4) if (free(a.x + d.x, a.y + d.y)) { cell = { x: a.x + d.x, y: a.y + d.y }; break; }
    }
    if (!cell) return false;
    this.brambles.set(this.idx(cell.x, cell.y), { x: cell.x, y: cell.y, age: 0, born: this.time, life: this.stats.thornLife * this.ev.thornLife, seed: Math.random() });
    this.thorns--;
    this.burst(cell.x + 0.5, cell.y + 0.5, { n: 8, colors: ['#5a8f29', '#8bc34a', '#6d4c2f'], speed: 2, life: 0.5, size: 0.1, type: 'leaf' });
    this.sfx('thorn');
    return true;
  }

  ability_rot() {
    const a = this.apple;
    if (!this.rotUnlocked || a.rotCd > 0 || a.rot > 0) return false;
    a.rot = this.stats.rotDur;
    a.rotAt = this.time;
    a.rotCd = this.stats.rotCd + this.stats.rotDur;
    for (const s of this.snakes) s.sniffShown = false;
    const rp = this.appleRenderPos();
    this.burst(rp.x + 0.5, rp.y + 0.5, { n: 12, colors: ['#7a5c2e', '#9b8a3c', '#5d4a1f'], speed: 1.6, life: 0.6, size: 0.1 });
    this.sfx('rot');
    return true;
  }

  ability_decoy() {
    const a = this.apple;
    if (!this.stats.decoy || a.decoyCd > 0) return false;
    this.decoy = { x: a.x, y: a.y, t: 0, life: this.stats.decoyDur };
    a.decoyCd = this.stats.decoyCd;
    this.burst(a.x + 0.5, a.y + 0.5, { n: 14, colors: ['#fff59d', '#ffffff', '#ffd54f'], speed: 2.2, life: 0.6, size: 0.1, type: 'star' });
    this.sfx('decoy');
    return true;
  }

  // Simple "flee" AI used for the title screen demo.
  demoInput(dt) {
    const a = this.apple;
    const out = { taps: [], held: null, actions: [] };
    if (a.moveT > 0) return out;
    const heads = this.snakes.filter(s => !s.dead).map(s => s.body[0]);
    if (!heads.length) return out;
    const g = this.appleBlockGrid();
    let best = null, bestScore = -Infinity;
    const near = Math.min(...heads.map(h => manhattan(h, a)));
    for (const d of [...DIRS4, { x: 0, y: 0 }]) {
      const nx = a.x + d.x, ny = a.y + d.y;
      if ((d.x || d.y) && !this.appleCanEnter(nx, ny)) continue;
      const dist = Math.min(...heads.map(h => manhattan(h, { x: nx, y: ny })));
      g[this.idx(a.x, a.y)] = 0;
      const area = this.flood(nx, ny, g, 40);
      const score = dist * 1.2 + area * 0.15 + Math.random() * 1.5 + (d.x || d.y ? 0 : (near > 6 ? 2 : -3));
      if (score > bestScore) { bestScore = score; best = d; }
    }
    if (near <= 2 && Math.random() < 0.4) out.actions.push(Math.random() < 0.5 ? 'rot' : 'dash');
    else if (near <= 5 && Math.random() < 0.08) out.actions.push('thorn');
    if (best && (best.x || best.y)) out.held = best;
    else a.moveT = 0.15;
    return out;
  }

  // ---------------------------------------------------------------- snakes
  animateSnake(s, dt) {
    s.tongue -= dt;
    if (s.tongue <= 0) { s.tongueT = 0.35; s.tongue = rand(1.2, 3.2); }
    s.tongueT = Math.max(0, s.tongueT - dt);
    s.blink -= dt;
    if (s.blink <= 0) { s.blinkT = 0.14; s.blink = rand(2, 5); }
    s.blinkT = Math.max(0, s.blinkT - dt);
    s.chomp = Math.max(0, s.chomp - dt);
    s.confused = Math.max(0, s.confused - dt);
    if (s.sick && !s.dead && Math.random() < dt * 8) {
      const c = s.body[Math.floor(Math.random() * s.body.length)];
      this.particles.push({
        x: c.x + 0.3 + Math.random() * 0.4, y: c.y + 0.4, vx: (Math.random() - 0.5) * 0.4, vy: -0.9,
        life: 0.7, max: 0.7, size: 0.05 + Math.random() * 0.06, color: Math.random() < 0.5 ? '#c5e1a5' : '#ce93d8',
        type: 'dot', grav: 0, rot: 0, vr: 0,
      });
    }
    if (s.dead && !s.gone) {
      s.deadT += dt;
      if (s.deadT > 0.7) {
        const target = Math.min(s.body.length, Math.floor((s.deadT - 0.7) / 0.045) + 1);
        while (s.popped < target) {
          const c = s.body[s.popped];
          const col = s.cause === 'poison' ? ['#8bc34a', '#9c6ade', s.species.body] : [s.species.body, s.species.belly, s.species.dark];
          this.burst(c.x + 0.5, c.y + 0.5, { n: s.popped === 0 ? 14 : 4, colors: col, speed: 2.5, life: 0.6, size: 0.13 });
          s.popped++;
          if (s.popped % 3 === 0) this.sfx('pop');
        }
        if (s.popped >= s.body.length) s.gone = true;
      }
    }
  }

  updateSnakes(dt) {
    const p = this.params;
    for (const s of this.snakes) {
      if (s.dead) continue;
      if (s.sick) {
        s.sickT += dt;
        if (s.sickT >= s.witherEvery) {
          s.sickT -= s.witherEvery;
          this.witherSnake(s);
          if (s.dead) { if (this.state !== 'play') return; continue; }
        }
      }
      if (s.stun > 0) {
        s.stun -= dt;
        if (s.stun <= 0) s.acc = 0;
        continue;
      }
      if (s.lunge === 'windup') {
        s.lungeT -= dt;
        if (s.lungeT <= 0) { s.lunge = 'go'; s.fast = p.lungeSteps + (s.nemesis ? 1 + Math.floor(s.nemesis.rank / 2) : 0); s.acc = 0; this.sfx('lunge'); }
        continue;
      }
      if (s.lunge === 'none') s.lungeCd -= dt;
      s.interval = (s.lunge === 'go' ? p.step * 0.45 : p.step * (s.sick ? 1.25 : 1)) / (this.hunger * (s.speedMul || 1));
      s.acc += dt;
      if (s.acc >= s.interval) {
        s.acc = Math.min(s.acc - s.interval, s.interval * 0.5);
        this.stepSnake(s);
        if (this.state !== 'play') return;
        if (s.dead) continue;
        if (s.lunge === 'go' && --s.fast <= 0) { s.lunge = 'none'; s.lungeCd = p.lungeCd / this.hunger / (s.nemesis ? 1 + 0.3 * s.nemesis.rank : 1); }
        else if (s.lunge === 'none' && p.lunge && s.lungeCd <= 0 && !this.decoy && s.stun <= 0 && !s.sick) {
          const dist = manhattan(s.body[0], this.apple);
          if (dist >= 2 && dist <= 4 && this.apple.invuln <= 0) {
            s.lunge = 'windup'; s.lungeT = 0.5; s.lungeAt = this.time; this.sfx('hiss');
          }
        }
      }
    }
  }

  snakeTarget(s) {
    if (this.decoy) return this.decoy;
    const a = this.apple;
    const g = this.ghost;
    if (g && !g.hidden && manhattan(s.body[0], g) < manhattan(s.body[0], a)) return g;
    if (this.smellsRot(s)) {
      if (!s.sniffShown) {
        s.sniffShown = true;
        this.floater(s.body[0].x + 0.5, s.body[0].y - 0.2, 'sniff\u2026 EW!', '#7a5c2e', 0.5);
      }
      return null;
    }
    return this.interceptTarget(s);
  }

  // Rot is only hidden for a moment: a snake within 3 tiles smells rot that has
  // been around for a while. A lunging snake is committed and smells nothing.
  smellsRot(s) {
    const a = this.apple;
    if (a.rot <= 0 || s.lunge === 'go' || s.sick) return false;
    // A nemesis has learned the trick: it smells rot sooner with every rank.
    const nose = s.nemesis ? Math.max(0.3, 1 - 0.15 * s.nemesis.rank) : 1;
    if (this.time - a.rotAt < this.params.smell * nose + this.stats.scent) return false;
    return manhattan(s.body[0], a) <= 3;
  }

  appleStepMul() {
    return this.ev.appleStep * (this.apple.rot > 0 ? 1.25 : 1);
  }

  planGrid(s) {
    const g = Uint8Array.from(this.rocks);
    // Fresh brambles go unnoticed for a moment: they only catch a snake that is
    // already right on your tail. Older ones are walls the snake steers around.
    // From level 4 snakes heed the flashing warning and steer off a ring
    // that's about to overgrow, so a hedge crush has to be set up.
    if (this.ringWarnT > 0 && this.params.intercept > 0) {
      for (let y = 0; y < this.rows; y++) for (let x = 0; x < this.cols; x++) {
        const e = this.edgeDist(x, y);
        if (e >= this.ring && e < this.ringNext) g[this.idx(x, y)] = 1;
      }
    }
    // A lunging snake planned its strike: it sees every bramble that was there
    // when its "!" appeared, and only thorns dropped in reply can catch it.
    const react = this.params.thornReact * (s.nemesis ? Math.max(0.4, 1 - 0.12 * s.nemesis.rank) : 1);
    const lunging = s.lunge === 'windup' || s.lunge === 'go';
    for (const [k, b] of this.brambles) {
      if (lunging ? b.born <= s.lungeAt : b.age >= react) g[k] = 1;
    }
    for (const o of this.snakes) {
      if (o.gone) continue;
      const len = o.body.length - (o === s && o.grow === 0 ? 1 : 0);
      for (let i = o.popped; i < len; i++) g[this.idx(o.body[i].x, o.body[i].y)] = 1;
    }
    const a = this.apple;
    if (this.smellsRot(s)) g[this.idx(a.x, a.y)] = 1;
    return g;
  }

  bfsFirst(h, target, blocked) {
    const { cols, rows } = this;
    const first = new Int8Array(cols * rows).fill(-1);
    const start = h.y * cols + h.x;
    const tk = target.y * cols + target.x;
    const q = [];
    for (let i = 0; i < 4; i++) {
      const d = DIRS4[i];
      const nx = h.x + d.x, ny = h.y + d.y;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const k = ny * cols + nx;
      if (blocked[k] && k !== tk) continue;
      first[k] = i;
      if (k === tk) return i;
      q.push(k);
    }
    first[start] = 9;
    for (let qi = 0; qi < q.length; qi++) {
      const k = q[qi];
      const x = k % cols, y = (k - x) / cols;
      for (const d of DIRS4) {
        const nx = x + d.x, ny = y + d.y;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const nk = ny * cols + nx;
        if (first[nk] !== -1 || (blocked[nk] && nk !== tk)) continue;
        first[nk] = first[k];
        if (nk === tk) return first[k];
        q.push(nk);
      }
    }
    return -1;
  }

  decide(s) {
    const p = this.params;
    const h = s.body[0];
    const target = this.snakeTarget(s);
    const blocked = this.planGrid(s);
    const safe = [];
    for (const d of DIRS4) {
      if (d.x === -s.dir.x && d.y === -s.dir.y) continue;
      const nx = h.x + d.x, ny = h.y + d.y;
      if (this.inB(nx, ny) && !blocked[this.idx(nx, ny)]) safe.push({ d, x: nx, y: ny });
    }
    s.doomed = !safe.length;
    if (s.doomed) return s.dir; // trapped: crash straight ahead

    // Instinct: never squeeze into a tiny dead end, not even for a bite. A
    // bramble fortress buys you time; it doesn't trap the snake for free.
    const instinct = Math.min(s.body.length + s.grow, s.nemesis ? 99 : 2 + Math.floor(this.level / 2));
    const roomy = safe.filter(o => this.flood(o.x, o.y, blocked, instinct) >= instinct);
    const opts = roomy.length ? roomy : safe;

    const maxArea = (prefer) => {
      let best = null, bestScore = -Infinity;
      for (const o of opts) {
        const area = this.flood(o.x, o.y, blocked, 400);
        const tie = prefer ? -manhattan(o, prefer) * 0.01 : (o.d.x === s.dir.x && o.d.y === s.dir.y ? 0.5 : 0);
        const score = area + tie + Math.random() * 0.1;
        if (score > bestScore) { bestScore = score; best = o; }
      }
      return best.d;
    };

    if (!target) return maxArea(null);

    if (p.ai === 'greedy') {
      if (Math.random() < 0.1) return pick(opts).d;
      opts.sort((a, b) => manhattan(a, target) - manhattan(b, target) + (Math.random() - 0.5) * 0.5);
      return opts[0].d;
    }

    const fi = this.bfsFirst(h, target, blocked);
    let choice = fi >= 0 ? opts.find(o => o.d === DIRS4[fi]) : null;
    // A nemesis always checks it won't trap itself.
    if (choice && (s.nemesis || Math.random() < p.smart)) {
      const need = s.body.length + s.grow + 2;
      if (this.flood(choice.x, choice.y, blocked, need) < need) choice = null;
    }
    return choice ? choice.d : maxArea(target);
  }

  collide(s, nx, ny) {
    if (!this.inB(nx, ny)) return 'wall';
    const k = this.idx(nx, ny);
    if (this.rocks[k]) return this.rocks[k] === 2 ? 'hedge' : 'rock';
    if (this.brambles.has(k)) return 'thorns';
    for (const o of this.snakes) {
      if (o.gone) continue;
      const len = o.body.length - (o === s && o.grow === 0 ? 1 : 0);
      for (let i = o.popped; i < len; i++) {
        if (o.body[i].x === nx && o.body[i].y === ny) return o === s ? 'self' : 'tangle';
      }
    }
    return null;
  }

  stepSnake(s) {
    const d = this.decide(s);
    const h = s.body[0];
    const nx = h.x + d.x, ny = h.y + d.y;
    s.old = s.body.map(c => ({ x: c.x, y: c.y }));
    s.dir = { x: d.x, y: d.y };
    const cause = this.collide(s, nx, ny);
    if (cause) {
      if (cause === 'thorns') {
        const k = this.idx(nx, ny);
        this.brambles.delete(k);
        this.burst(nx + 0.5, ny + 0.5, { n: 14, colors: ['#5a8f29', '#8bc34a', '#6d4c2f'], speed: 3, life: 0.7, size: 0.12, type: 'leaf' });
        // Thorns kill a lunging snake, a trapped one, or any snake on the first
        // levels. Otherwise the snake just gets a nasty scratch.
        if (s.lunge !== 'go' && !s.doomed && !this.params.thornsKill) { this.scratchSnake(s, nx, ny); return; }
      }
      this.killSnake(s, cause, nx, ny);
      return;
    }
    s.body.unshift({ x: nx, y: ny });
    if (s.grow > 0) s.grow--;
    else s.body.pop();

    const a = this.apple;
    if (nx === a.x && ny === a.y) {
      this.biteApple(s);
      return;
    }
    if (this.decoy && nx === this.decoy.x && ny === this.decoy.y) {
      this.burst(nx + 0.5, ny + 0.5, { n: 16, colors: ['#fff59d', '#ffffff', '#ffd54f'], speed: 3, life: 0.6, size: 0.1, type: 'star' });
      this.floater(nx + 0.5, ny, 'FAKE!?', '#f9a825', 0.6);
      this.decoy = null;
      s.stun = 1.1; s.confused = 1.1;
      this.sfx('decoyPop');
      return;
    }
    const g = this.ghost;
    if (g && !g.hidden && nx === g.x && ny === g.y) {
      this.burst(nx + 0.5, ny + 0.5, { n: 16, colors: ['#e1f5fe', '#ffffff', '#b39ddb'], speed: 3, life: 0.6, size: 0.12 });
      this.floater(nx + 0.5, ny, 'just a reflection!', '#b39ddb', 0.5);
      g.down = 4;
      s.stun = 0.9; s.confused = 0.9;
      this.sfx('decoyPop');
    }
    if (manhattan(s.body[0], a) === 1 && a.invuln <= 0 && !a.dying) this.closeCall(s);
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      if (Math.round(pk.x) === nx && Math.round(pk.y) === ny) {
        this.pickups.splice(i, 1);
        this.burst(nx + 0.5, ny + 0.5, { n: 6, colors: ['#ffffff', '#dddddd'], speed: 1.5, life: 0.4, size: 0.1 });
      }
    }
  }

  // Poison doesn't kill on the spot: the snake gags, turns sickly, slows down,
  // stops growing and withers away a segment at a time. It still hunts you.
  poisonSnake(s) {
    s.sick = true;
    s.sickT = 0;
    s.grow = 0;
    // Wither over a few seconds (longer on later levels), whatever its length.
    const sickFor = (5 + 0.4 * Math.min(this.level, 15)) * (s.nemesis ? 1 + 0.3 * s.nemesis.rank : 1);
    s.witherEvery = sickFor / Math.max(1, s.body.length - 3);
    s.stun = 0.7;
    s.confused = 0.7;
    s.lunge = 'none';
    const h = s.body[0];
    if (!this.demo) this.score += 100 * this.level * this.nerveMult;
    this.floater(h.x + 0.5, Math.max(0.8, h.y), 'POISONED!', '#8e44ad', 0.9);
    this.shake = Math.max(this.shake, 0.4);
    this.sfx('poison');
    this.emit('poison');
  }

  witherSnake(s) {
    const c = s.body[s.body.length - 1];
    if (s.body.length <= 3) {
      this.killSnake(s, 'poison', s.body[0].x, s.body[0].y);
      return;
    }
    s.body.pop();
    if (s.old.length > s.body.length) s.old.pop();
    this.burst(c.x + 0.5, c.y + 0.5, { n: 5, colors: ['#9ccc65', '#ab47bc', '#c5e1a5'], speed: 1.5, life: 0.5, size: 0.1 });
  }

  // After a poisoned bite the apple pops one tile out of the snake's mouth,
  // away from the head, instead of teleporting to safety.
  bounceApple(s) {
    const a = this.apple, h = s.body[0], back = s.body[1] || h;
    let best = null, bestD = -1;
    for (const d of DIRS4) {
      const x = a.x + d.x, y = a.y + d.y;
      if (!this.appleCanEnter(x, y)) continue;
      const dist = manhattan({ x, y }, back) + (d.x === s.dir.x && d.y === s.dir.y ? 0.5 : 0);
      if (dist > bestD) { bestD = dist; best = { x, y }; }
    }
    if (!best) { this.relocateApple(0.8); return; }
    const rp = this.appleRenderPos();
    a.fromX = rp.x; a.fromY = rp.y;
    a.x = best.x; a.y = best.y;
    a.animT = 0; a.animDur = 0.12; a.squash = 1.2;
    a.prev = null;
    a.invuln = Math.max(a.invuln, 0.5);
  }

  scratchSnake(s, nx, ny) {
    s.stun = 1.1;
    s.confused = 1.1;
    s.lunge = 'none';
    // Lose a couple of tail segments, never below a stub of 3.
    for (let i = 0; i < 2 && s.body.length > 3; i++) {
      const c = s.body.pop();
      this.burst(c.x + 0.5, c.y + 0.5, { n: 5, colors: [s.species.body, s.species.belly], speed: 2, life: 0.4, size: 0.1 });
    }
    s.old = s.body.map(c => ({ x: c.x, y: c.y }));
    if (!this.demo) this.score += 50 * this.level * this.nerveMult;
    this.floater(nx + 0.5, ny, 'OUCH!', '#ffab40', 0.7);
    this.burst(s.body[0].x + 0.5, s.body[0].y + 0.2, { n: 6, colors: ['#fff59d', '#ffffff'], speed: 1.5, life: 0.6, size: 0.1, type: 'star' });
    this.shake = Math.max(this.shake, 0.3);
    this.sfx('thorn');
    this.emit('scratch');
  }

  closeCall(s) {
    if (this.demo || this.state !== 'play') return;
    if (this.time - (s.nearAt || -9) < 0.45) return;
    s.nearAt = this.time;
    const lunging = s.lunge === 'go';
    this.nerve = Math.min(20, this.nerve + (lunging ? 2 : 1));
    this.nerveT = 4;
    this.nervePeak = Math.max(this.nervePeak, this.nerve);
    this.nerveBest = Math.max(this.nerveBest, this.nerve);
    this.closeCalls++;
    this.score += 25 * this.level * this.nerveMult;
    const rp = this.appleRenderPos();
    this.floater(rp.x + 0.5, rp.y - 0.3, lunging ? 'DODGED!' : 'CLOSE!', '#80deea', lunging ? 0.75 : 0.6, 0.8);
    this.burst(rp.x + 0.5, rp.y + 0.5, { n: 6, colors: ['#e0f7fa', '#80deea'], speed: 2.5, life: 0.35, size: 0.08, type: 'ring' });
    if (this.nerve === 1 || lunging || this.nerve % 5 === 0) this.slow = 0.25;
    this.emit('nerve', this.nerve);
  }

  killSnake(s, cause, nx, ny) {
    const lunging = s.lunge === 'go';
    s.dead = true;
    s.deadT = 0;
    s.cause = cause;
    s.lunge = 'none';
    let pts = Math.round(250 * this.level * KILL_MULT[cause] * this.nerveMult * (s.golden ? 3 : 1));
    let text = s.golden ? 'GOLDEN ' + KILL_TEXT[cause] : KILL_TEXT[cause];
    const double = this.time - this.lastKill < 2.5;
    if (double) { pts *= 2; text = 'DOUBLE KO!'; }
    if (s.nemesis) text = 'NEMESIS DOWN!';
    this.lastKill = this.time;
    if (!this.demo) {
      this.score += pts;
      this.kills[cause]++;
    }
    const hx = Math.max(0, Math.min(this.cols - 1, nx)), hy = Math.max(0, Math.min(this.rows - 1, ny));
    this.floater(hx + 0.5, Math.max(0.8, hy), text, cause === 'poison' ? '#8e44ad' : '#ff5252', 1);
    if (!this.demo) this.floater(hx + 0.5, Math.max(0.8, hy) + 0.7, '+' + pts, '#ffffff', 0.6);
    this.burst(hx + 0.5, hy + 0.5, { n: 18, colors: ['#ffeb3b', '#ffffff', '#ff9800'], speed: 4, life: 0.7, size: 0.14, type: 'star' });
    this.shake = Math.max(this.shake, 0.6);
    this.sfx(cause === 'poison' ? 'poison' : 'crash');
    if (s.golden && !this.demo) {
      this.addStars(10);
      this.burst(hx + 0.5, hy + 0.5, { n: 30, colors: ['#ffd700', '#fff59d', '#ffffff'], speed: 5, life: 1, size: 0.14, type: 'star' });
    }
    if (s.nemesis && !this.demo) {
      const bounty = nemesisBounty(s.nemesis);
      this.addStars(bounty);
      this.nemesisBeaten = true;
      this.floater(this.cols / 2, 2.2, `${nemesisName(s.nemesis)} is beaten! +${bounty}\u2605`, '#ffd54f', 0.75, 2.6);
      this.burst(hx + 0.5, hy + 0.5, { n: 40, colors: ['#ff5252', '#ffd700', '#ffffff'], speed: 6, life: 1.1, size: 0.15, type: 'star' });
      this.emit('nemesis', { ...s.nemesis, bounty });
    }
    this.emit('kill', { cause, pts, lunging, double, golden: !!s.golden, nemesis: !!s.nemesis });
    if (this.snakes.every(o => o.dead)) {
      this.state = 'clear';
      this.clearT = 2.4;
      if (!this.demo) {
        const g = this.gradeLevel();
        this.grades.push(g);
        this.lastGrade = g;
        const stars = this.addStars(5 + this.level * 2 + GRADE_STARS[g]);
        this.floater(this.cols / 2, this.rows / 2 - 1, 'LEVEL CLEAR!', '#ffeb3b', 1.4, 2.2);
        this.floater(this.cols / 2, this.rows / 2 + 0.6, '+' + stars + ' ★', '#ffd54f', 0.9, 2.2);
      }
      this.sfx('win');
    }
  }

  // S: no bites, fast, and brave. A: no bites. B: at most one bite. C: survived.
  gradeLevel() {
    const par = 25 + this.level * 2.5 + this.params.snakeCount * 10;
    const t = this.levelTime, b = this.levelBites;
    this.par = par;
    if (b === 0 && t <= par && this.nervePeak >= 4) return 'S';
    if (b === 0 && t <= par * 1.35) return 'A';
    if (b <= 1) return 'B';
    return 'C';
  }

  biteApple(s) {
    const a = this.apple;
    if (a.invuln > 0 || a.dying) return;
    const rp = this.appleRenderPos();
    if (a.rot > 0) {
      a.rot = 0;
      this.burst(rp.x + 0.5, rp.y + 0.5, { n: 20, colors: ['#8bc34a', '#9c6ade', '#6d4c2f'], speed: 3, life: 0.8, size: 0.14 });
      if (s.sick) {
        // A second dose finishes it off.
        this.killSnake(s, 'poison', a.x, a.y);
        this.relocateApple(0.8);
        return;
      }
      this.poisonSnake(s);
      this.bounceApple(s);
      return;
    }
    this.bites--;
    this.levelBites++;
    // A fed snake calms down a little.
    this.hungerT = Math.max(0, this.hungerT - 8);
    this.updateHunger(0);
    if (this.nerve > 0) { this.nerve = 0; this.emit('nerve', 0); }
    if (this.demo) this.bites = Math.max(1, this.bites);
    if (s.sick) {
      // A fresh apple is the cure. Keep away from a poisoned snake!
      s.sick = false;
      this.floater(s.body[0].x + 0.5, Math.max(0.8, s.body[0].y - 0.6), 'CURED!', '#7cb342', 0.6);
    }
    s.grow += 3;
    s.chomp = 0.5;
    s.stun = 0.45;
    s.lunge = 'none';
    s.lungeCd = this.params.lungeCd;
    const skin = this.hooks.skin ? this.hooks.skin() : null;
    this.burst(rp.x + 0.5, rp.y + 0.5, { n: 22, colors: [skin ? skin.base : '#e8392f', '#fff3d6', '#ffe0a3'], speed: 4, life: 0.7, size: 0.14, grav: 6 });
    this.floater(rp.x + 0.5, rp.y, 'CHOMP!', '#ffffff', 0.9);
    this.shake = Math.max(this.shake, 0.8);
    this.sfx('crunch');
    this.emit('bite');
    if (this.bites <= 0) {
      this.eatenBy = { species: s.species.id, first: s.species.name.split(' ')[0], nemesis: !!s.nemesis };
      this.state = 'dying';
      a.dying = 0.001;
      this.sfx('lose');
      return;
    }
    this.relocateApple(2.2);
  }

  relocateApple(invuln) {
    const a = this.apple;
    const heads = this.snakes.filter(s => !s.dead).map(s => s.body[0]);
    const g = this.appleBlockGrid();
    const cands = [];
    for (let y = 0; y < this.rows; y++) for (let x = 0; x < this.cols; x++) {
      if (g[this.idx(x, y)]) continue;
      if (this.pickups.some(p => Math.round(p.x) === x && Math.round(p.y) === y)) continue;
      const dist = heads.length ? Math.min(...heads.map(h => manhattan(h, { x, y }))) : 10;
      if (dist < 3) continue;
      cands.push({ x, y, dist });
    }
    cands.sort((p, q) => q.dist - p.dist);
    let chosen = null;
    for (const c of cands.slice(0, 25)) {
      if (this.flood(c.x, c.y, g, 20) >= 20) { chosen = c; if (Math.random() < 0.5) break; }
    }
    chosen = chosen || cands[0] || { x: a.x, y: a.y };
    a.x = chosen.x; a.y = chosen.y; a.fromX = a.x; a.fromY = a.y; a.animT = 1;
    a.prev = null; a.drop = 1; a.invuln = invuln; a.moveT = 0.15;
    this.burst(a.x + 0.5, a.y + 0.5, { n: 10, colors: ['#ffffff'], speed: 2, life: 0.5, size: 0.16 });
  }

  // ---------------------------------------------------------------- world objects
  updateBrambles(dt) {
    for (const [k, b] of this.brambles) {
      b.age += dt;
      if (b.age >= b.life) {
        this.brambles.delete(k);
        this.burst(b.x + 0.5, b.y + 0.5, { n: 6, colors: ['#8d6e63', '#a1887f'], speed: 1, life: 0.5, size: 0.1, type: 'leaf' });
      }
    }
    if (this.decoy) {
      this.decoy.t += dt;
      if (this.decoy.t >= this.decoy.life) {
        this.burst(this.decoy.x + 0.5, this.decoy.y + 0.5, { n: 10, colors: ['#fff59d', '#ffffff'], speed: 1.5, life: 0.5, size: 0.1, type: 'star' });
        this.decoy = null;
      }
    }
  }

  updatePickups(dt) {
    this.pickT -= dt * this.stats.luck * this.ev.luck;
    if (this.pickT <= 0) {
      this.pickT = lrand(3.5, 6);
      if (this.pickups.length < (this.event === 'feast' ? 8 : 4)) this.spawnPickup();
    }
    const a = this.apple;
    const rp = this.appleRenderPos();
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.t += dt;
      if (p.t >= p.life) {
        this.pickups.splice(i, 1);
        this.burst(p.x + 0.5, p.y + 0.5, { n: 6, colors: ['#ffffff'], speed: 1, life: 0.4, size: 0.1 });
        continue;
      }
      const dx = rp.x - p.x, dy = rp.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (p.type === 'star' && this.stats.magnet > 0 && dist < this.stats.magnet + 1 && dist > 0.01) {
        const sp = Math.min(dist, dt * 7);
        p.x += dx / dist * sp; p.y += dy / dist * sp;
      }
      if (dist < 0.6 && !a.dying) {
        this.pickups.splice(i, 1);
        this.collect(p);
      }
    }
  }

  spawnPickup() {
    const a = this.apple;
    const r = lr();
    let type = 'star';
    if (this.event === 'feast') type = r < 0.1 ? 'seed' : 'star';
    else if (r < 0.08 && this.bites < this.stats.maxBites) type = 'heart';
    else if (r < 0.3) type = 'seed';
    for (let tries = 0; tries < 60; tries++) {
      const x = lrandi(0, this.cols - 1), y = lrandi(0, this.rows - 1);
      if (!this.appleCanEnter(x, y) || manhattan({ x, y }, a) < 3) continue;
      if (this.pickups.some(p => Math.round(p.x) === x && Math.round(p.y) === y)) continue;
      this.pickups.push({ type, x, y, t: 0, life: 11, seed: Math.random() * 10 });
      return;
    }
  }

  addStars(n) {
    if (this.demo) return 0;
    this.starFrac += n * this.starMult;
    const whole = Math.floor(this.starFrac);
    this.starFrac -= whole;
    this.starsRun += whole;
    if (whole) this.emit('stars', whole);
    return whole;
  }

  collect(p) {
    const cx = p.x + 0.5, cy = p.y + 0.5;
    if (p.type === 'star') {
      this.addStars(1);
      if (!this.demo) this.score += 20 * this.level * this.nerveMult;
      this.burst(cx, cy, { n: 10, colors: ['#ffeb3b', '#fff59d', '#ffffff'], speed: 2.5, life: 0.5, size: 0.1, type: 'star' });
      this.floater(cx, cy - 0.3, '+★', '#ffd54f', 0.55);
      this.sfx('star');
    } else if (p.type === 'seed') {
      const before = this.thorns;
      this.thorns = Math.min(this.stats.thornCap, this.thorns + 2);
      if (!this.demo) this.score += 10 * this.level;
      this.burst(cx, cy, { n: 8, colors: ['#8bc34a', '#c5e1a5', '#795548'], speed: 2, life: 0.5, size: 0.1, type: 'leaf' });
      this.floater(cx, cy - 0.3, this.thorns > before ? '+' + (this.thorns - before) + ' bramble' : 'full!', '#aed581', 0.5);
      this.sfx('seed');
    } else if (p.type === 'heart') {
      this.bites = Math.min(this.stats.maxBites, this.bites + 1);
      this.burst(cx, cy, { n: 12, colors: ['#ff5c8a', '#ffb3c7', '#ffffff'], speed: 2.5, life: 0.6, size: 0.12, type: 'heart' });
      this.floater(cx, cy - 0.3, '+1 bite', '#ff8fab', 0.55);
      this.sfx('heart');
    }
    this.emit('collect', p.type);
  }

  // ---------------------------------------------------------------- effects
  burst(x, y, { n = 8, colors = ['#fff'], speed = 2, life = 0.5, size = 0.1, type = 'dot', grav = 0 } = {}) {
    if (this.particles.length > 600) return;
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = speed * (0.4 + Math.random() * 0.8);
      this.particles.push({
        x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - (grav ? speed * 0.6 : 0),
        life: life * (0.6 + Math.random() * 0.6), max: life, size: size * (0.6 + Math.random() * 0.8),
        color: pick(colors), type, grav, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10,
      });
    }
  }

  floater(x, y, text, color, size = 0.6, life = 1.1) {
    this.floaters.push({ x, y, text, color, size, t: 0, life });
  }

  updateFx(dt) {
    this.shake = Math.max(0, this.shake - dt * 2.2);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.vy += p.grav * dt;
      p.vx *= 1 - dt * 2.5;
      p.vy *= 1 - dt * (p.grav ? 0.5 : 2.5);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.t += dt;
      f.y -= dt * 0.7;
      if (f.t >= f.life) this.floaters.splice(i, 1);
    }
  }
}
