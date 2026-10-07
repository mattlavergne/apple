// Exploit check: a "camper" steps away from the nearest snake, drops a bramble
// behind itself and stands still on the far side. If brambles are balanced,
// this lazy strategy should rarely clear a level.
// Usage: node tools/camper.mjs [trialsPerLevel] [reactionSeconds=0.3]
import { Game } from '../js/engine.js';

const trials = +process.argv[2] || 40;
const REACTION = process.argv[3] != null ? +process.argv[3] : 0.3;
console.log('level  camper wins  (thorn kills / bites taken)');
for (let level = 1; level <= 10; level++) {
  let wins = 0, thornKills = 0, bites = 0;
  for (let t = 0; t < trials; t++) {
    const g = new Game({});
    g.newRun({ mode: 'classic', level });
    g.event = null; g.applyEvent();
    g.state = 'play';
    const a = g.apple;
    let seen = 0;
    for (let f = 0; f < 60 * 30 && g.state === 'play'; f++) {
      const heads = g.snakes.filter(s => !s.dead).map(s => s.body[0]);
      if (heads.length && g.thorns > 0 && a.moveT <= 0) {
        const h = heads.reduce((p, q) => (Math.abs(q.x - a.x) + Math.abs(q.y - a.y) < Math.abs(p.x - a.x) + Math.abs(p.y - a.y) ? q : p));
        const dist = Math.abs(h.x - a.x) + Math.abs(h.y - a.y);
        const dx = Math.sign(a.x - h.x), dy = Math.sign(a.y - h.y);
        const away = Math.abs(h.x - a.x) >= Math.abs(h.y - a.y) ? { x: dx || 1, y: 0 } : { x: 0, y: dy || 1 };
        const between = g.brambles.has(g.idx(a.x - away.x, a.y - away.y));
        // What a player does: step away from the snake, drop a bramble behind you, then wait.
        // Humans need ~0.3s to notice a snake closing in and react.
        if (dist <= 6 && !between) seen += 1 / 60; else seen = 0;
        if (seen >= REACTION && g.tryMove(away)) { a.facing = away; g.ability_thorn(); a.moveT = 0.12; seen = 0; }
      }
      g.update(1 / 60, { taps: [], held: null, actions: [] });
    }
    if (g.state === 'clear' || g.state === 'cleared') wins++;
    thornKills += g.kills.thorns;
    bites += g.stats.maxBites - g.bites + (g.state === 'dying' || g.state === 'over' ? 0 : 0);
  }
  console.log(String(level).padStart(5), String(Math.round(wins / trials * 100) + '%').padStart(10), `   (${thornKills} / ${bites})`);
}
