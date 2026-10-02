// Game simulation. No DOM access here, so it can also run headless (see tools/sim.mjs).
import {
  WORLDS, worldIndexFor, levelParams, speciesFor, baseStats, UPGRADES, PERKS, MODES,
} from './config.js';

export const DIRS4 = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const easeOut = t => 1 - (1 - t) * (1 - t);

const KILL_TEXT = {
  wall: 'BONK!', rock: 'BONK!', self: 'KNOTTED!', tangle: 'TANGLED!', thorns: 'THORNED!', poison: 'POISONED!',
};
const KILL_MULT = { wall: 1, rock: 1, self: 1, tangle: 1.5, thorns: 1.5, poison: 2 };

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
  newRun({ mode = 'classic', upgrades = {}, demo = false, cols = 25, rows = 17, level = 1 } = {}) {
    this.mode = mode;
    this.demo = demo;
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
    this.kills = { wall: 0, rock: 0, self: 0, tangle: 0, thorns: 0, poison: 0 };
    this.lastKill = -10;
    this.startLevel();
  }

  get rotUnlocked() { return this.demo || this.level >= 3 || this.mode === 'core'; }
  get starMult() { return (MODES[this.mode] || MODES.classic).starMult * this.stats.starBonus; }

  startLevel() {
    const { cols, rows } = this;
    this.params = levelParams(this.level, this.mode);
    this.world = this.demo ? randi(0, WORLDS.length - 1) : worldIndexFor(this.level);
    this.rocks = new Uint8Array(cols * rows);
    this.brambles = new Map();
    this.pickups = [];
    this.particles = [];
    this.floaters = [];
    this.decoy = null;
    this.shake = 0;
    this.growT = 0;
    this.pickT = rand(2, 4);
    this.thorns = this.stats.thornCap;
    this.thornRegenT = 0;
    this.levelTime = 0;
    this.clearT = 0;
    this.levelSeed = Math.random() * 1e9;

    const cx = Math.floor(cols / 2), cy = Math.floor(rows / 2);
    this.apple = {
      x: cx, y: cy, fromX: cx, fromY: cy, animT: 1, animDur: 0.1, moveT: 0,
      facing: { x: 0, y: -1 }, prev: null, invuln: 0, rot: 0, rotCd: 0, dashCd: 0, decoyCd: 0,
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
      const j = Math.floor(Math.random() * (i + 1));
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
        fast: 0, sniffed: false, sniffShown: false, tongue: rand(0.5, 2), tongueT: 0,
        blink: rand(2, 5), blinkT: 0, boss: species.id === 'cobra' && p.boss, cause: null,
      });
    }

    this.generateRocks();
    this.state = this.demo ? 'play' : 'countdown';
    this.countT = 3;
    this.lastCount = 99;
    this.emit('level');
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
        let x = randi(1, cols - 2), y = randi(1, rows - 2);
        const size = randi(1, 4);
        for (let k = 0; k < size; k++) {
          if (this.inB(x, y) && !reserved[y * cols + x]) this.rocks[y * cols + x] = 1;
          const d = pick(DIRS4);
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
    while (out.length < n && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
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
    if (!this.demo) this.score += dt * 5 * this.level;
    this.updateApple(dt, input);
    if (this.state !== 'play') return;
    this.updateSnakes(dt);
    if (this.state !== 'play') return;
    this.updateBrambles(dt);
    this.updatePickups(dt);

    this.growT += dt;
    if (this.growT >= this.params.growEvery) {
      this.growT -= this.params.growEvery;
      for (const s of this.snakes) if (!s.dead) s.grow++;
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
      if (this.thornRegenT >= st.thornRegen) { this.thornRegenT = 0; this.thorns++; }
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
        if (this.tryMove(d)) a.moveT = st.appleStep;
        else {
          if (a.bump <= 0.01) this.sfx('bump');
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
    a.animT = 0;
    a.animDur = this.stats.appleStep * 0.95;
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
    this.brambles.set(this.idx(cell.x, cell.y), { x: cell.x, y: cell.y, age: 0, life: this.stats.thornLife, seed: Math.random() });
    this.thorns--;
    this.burst(cell.x + 0.5, cell.y + 0.5, { n: 8, colors: ['#5a8f29', '#8bc34a', '#6d4c2f'], speed: 2, life: 0.5, size: 0.1, type: 'leaf' });
    this.sfx('thorn');
    return true;
  }

  ability_rot() {
    const a = this.apple;
    if (!this.rotUnlocked || a.rotCd > 0 || a.rot > 0) return false;
    a.rot = this.stats.rotDur;
    a.rotCd = this.stats.rotCd + this.stats.rotDur;
    for (const s of this.snakes) {
      s.sniffed = !this.stats.odorless && Math.random() < this.params.sniff;
      s.sniffShown = false;
    }
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
      if (s.stun > 0) {
        s.stun -= dt;
        if (s.stun <= 0) s.acc = 0;
        continue;
      }
      if (s.lunge === 'windup') {
        s.lungeT -= dt;
        if (s.lungeT <= 0) { s.lunge = 'go'; s.fast = p.lungeSteps; s.acc = 0; this.sfx('lunge'); }
        continue;
      }
      if (s.lunge === 'none') s.lungeCd -= dt;
      s.interval = s.lunge === 'go' ? p.step * 0.45 : p.step;
      s.acc += dt;
      if (s.acc >= s.interval) {
        s.acc = Math.min(s.acc - s.interval, s.interval * 0.5);
        this.stepSnake(s);
        if (this.state !== 'play') return;
        if (s.dead) continue;
        if (s.lunge === 'go' && --s.fast <= 0) { s.lunge = 'none'; s.lungeCd = p.lungeCd; }
        else if (s.lunge === 'none' && p.lunge && s.lungeCd <= 0 && !this.decoy && s.stun <= 0) {
          const dist = manhattan(s.body[0], this.apple);
          if (dist >= 2 && dist <= 4 && this.apple.invuln <= 0) {
            s.lunge = 'windup'; s.lungeT = 0.5; this.sfx('hiss');
          }
        }
      }
    }
  }

  snakeTarget(s) {
    if (this.decoy) return this.decoy;
    const a = this.apple;
    if (a.rot > 0 && s.sniffed && manhattan(s.body[0], a) <= 3) {
      if (!s.sniffShown) {
        s.sniffShown = true;
        this.floater(s.body[0].x + 0.5, s.body[0].y - 0.2, 'sniff sniff…', '#7a5c2e', 0.5);
      }
      return null;
    }
    return a;
  }

  planGrid(s) {
    const g = Uint8Array.from(this.rocks);
    if (this.params.seesThorns) for (const k of this.brambles.keys()) g[k] = 1;
    for (const o of this.snakes) {
      if (o.gone) continue;
      const len = o.body.length - (o === s && o.grow === 0 ? 1 : 0);
      for (let i = o.popped; i < len; i++) g[this.idx(o.body[i].x, o.body[i].y)] = 1;
    }
    const a = this.apple;
    if (a.rot > 0 && s.sniffed && manhattan(s.body[0], a) <= 3) g[this.idx(a.x, a.y)] = 1;
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
    if (!safe.length) return s.dir; // doomed: crash straight ahead

    const maxArea = (prefer) => {
      let best = null, bestScore = -Infinity;
      for (const o of safe) {
        const area = this.flood(o.x, o.y, blocked, 400);
        const tie = prefer ? -manhattan(o, prefer) * 0.01 : (o.d.x === s.dir.x && o.d.y === s.dir.y ? 0.5 : 0);
        const score = area + tie + Math.random() * 0.1;
        if (score > bestScore) { bestScore = score; best = o; }
      }
      return best.d;
    };

    if (!target) return maxArea(null);

    if (p.ai === 'greedy') {
      if (Math.random() < 0.1) return pick(safe).d;
      safe.sort((a, b) => manhattan(a, target) - manhattan(b, target) + (Math.random() - 0.5) * 0.5);
      return safe[0].d;
    }

    const fi = this.bfsFirst(h, target, blocked);
    let choice = fi >= 0 ? safe.find(o => o.d === DIRS4[fi]) : null;
    if (choice && Math.random() < p.smart) {
      const need = s.body.length + s.grow + 2;
      if (this.flood(choice.x, choice.y, blocked, need) < need) choice = null;
    }
    return choice ? choice.d : maxArea(target);
  }

  collide(s, nx, ny) {
    if (!this.inB(nx, ny)) return 'wall';
    const k = this.idx(nx, ny);
    if (this.rocks[k]) return 'rock';
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
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      if (Math.round(pk.x) === nx && Math.round(pk.y) === ny) {
        this.pickups.splice(i, 1);
        this.burst(nx + 0.5, ny + 0.5, { n: 6, colors: ['#ffffff', '#dddddd'], speed: 1.5, life: 0.4, size: 0.1 });
      }
    }
  }

  killSnake(s, cause, nx, ny) {
    s.dead = true;
    s.deadT = 0;
    s.cause = cause;
    s.lunge = 'none';
    let pts = Math.round(250 * this.level * KILL_MULT[cause]);
    let text = KILL_TEXT[cause];
    if (this.time - this.lastKill < 2.5) { pts *= 2; text = 'DOUBLE KO!'; }
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
    this.emit('kill', { cause, pts });
    if (this.snakes.every(o => o.dead)) {
      this.state = 'clear';
      this.clearT = 2.4;
      if (!this.demo) {
        const stars = this.addStars(5 + this.level * 2);
        this.floater(this.cols / 2, this.rows / 2 - 1, 'LEVEL CLEAR!', '#ffeb3b', 1.4, 2.2);
        this.floater(this.cols / 2, this.rows / 2 + 0.6, '+' + stars + ' ★', '#ffd54f', 0.9, 2.2);
      }
      this.sfx('win');
    }
  }

  biteApple(s) {
    const a = this.apple;
    if (a.invuln > 0 || a.dying) return;
    const rp = this.appleRenderPos();
    if (a.rot > 0) {
      a.rot = 0;
      this.burst(rp.x + 0.5, rp.y + 0.5, { n: 20, colors: ['#8bc34a', '#9c6ade', '#6d4c2f'], speed: 3, life: 0.8, size: 0.14 });
      // The apple survives: push it out of the snake's mouth.
      this.killSnake(s, 'poison', a.x, a.y);
      this.relocateApple(0.8);
      return;
    }
    this.bites--;
    if (this.demo) this.bites = Math.max(1, this.bites);
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
    this.pickT -= dt * this.stats.luck;
    if (this.pickT <= 0) {
      this.pickT = rand(3.5, 6);
      if (this.pickups.length < 4) this.spawnPickup();
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
    const r = Math.random();
    let type = 'star';
    if (r < 0.08 && this.bites < this.stats.maxBites) type = 'heart';
    else if (r < 0.3) type = 'seed';
    for (let tries = 0; tries < 60; tries++) {
      const x = randi(0, this.cols - 1), y = randi(0, this.rows - 1);
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
      if (!this.demo) this.score += 20 * this.level;
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
