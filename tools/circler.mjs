// Exploit check: run laps around the border, reversing when a snake gets close
// ahead (dashing if one is right behind). Reports how long the circler
// survives and how many bites it takes per level.
// Usage: node tools/circler.mjs [trialsPerLevel]
import { Game } from '../js/engine.js';

const trials = +process.argv[2] || 30;
const LIMIT = 90;
console.log(`level  survived ${LIMIT}s  avg bites  levels cleared`);
for (let level = 1; level <= 12; level++) {
  let survived = 0, bites = 0, cleared = 0;
  for (let t = 0; t < trials; t++) {
    const g = new Game({});
    g.newRun({ mode: 'classic', level });
    g.event = null; g.applyEvent();
    g.bites = 99; g.stats.maxBites = 99; // count bites, don't end the run
    g.state = 'play';
    const a = g.apple;
    // Border loop, clockwise.
    const loop = [];
    for (let x = 0; x < g.cols; x++) loop.push({ x, y: 0 });
    for (let y = 1; y < g.rows; y++) loop.push({ x: g.cols - 1, y });
    for (let x = g.cols - 2; x >= 0; x--) loop.push({ x, y: g.rows - 1 });
    for (let y = g.rows - 2; y > 0; y--) loop.push({ x: 0, y });
    let dir = 1;
    for (let f = 0; f < 60 * LIMIT && g.state === 'play'; f++) {
      const input = { taps: [], held: null, actions: [] };
      const i = loop.findIndex(c => c.x === a.x && c.y === a.y);
      const heads = g.snakes.filter(s => !s.dead).map(s => s.body[0]);
      const near = k => heads.some(h => Math.abs(h.x - loop[k].x) + Math.abs(h.y - loop[k].y) <= 1);
      if (i < 0) {
        // Not on the border yet: head for the nearest edge.
        const opts = [{ x: 0, y: -1, d: a.y }, { x: 0, y: 1, d: g.rows - 1 - a.y }, { x: -1, y: 0, d: a.x }, { x: 1, y: 0, d: g.cols - 1 - a.x }];
        opts.sort((p, q) => p.d - q.d);
        input.held = opts[0];
      } else {
        const n = loop.length;
        const ahead = [1, 2, 3].map(k => (i + dir * k + n) % n);
        if (ahead.some(near)) dir = -dir;
        const nx = loop[(i + dir + n) % n];
        input.held = { x: Math.sign(nx.x - a.x), y: Math.sign(nx.y - a.y) };
        const behind = (i - dir + n) % n;
        if (near(behind)) input.actions.push('dash');
      }
      g.update(1 / 60, input);
    }
    if (g.state === 'play') survived++;
    if (g.state === 'clear' || g.state === 'cleared') cleared++;
    bites += 99 - g.bites;
  }
  console.log(String(level).padStart(5), String(Math.round(survived / trials * 100) + '%').padStart(14), (bites / trials).toFixed(1).padStart(10), String(Math.round(cleared / trials * 100) + '%').padStart(15));
}
