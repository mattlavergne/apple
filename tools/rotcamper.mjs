// Exploit check for Hidden Rot: stand still and trigger rot when the nearest
// snake head is K cells away (the best K is what a practiced player would
// learn). Rot should pay off with good timing, but camping on it should not
// clear levels on its own.
// Usage: node tools/rotcamper.mjs [trialsPerLevel]
import { Game } from '../js/engine.js';

const trials = +process.argv[2] || 40;
console.log('level  best K  camper wins  poison kills  bites taken');
for (let level = 3; level <= 12; level++) {
  let best = null;
  for (const K of [1, 2, 3]) {
    let wins = 0, poison = 0, bites = 0;
    for (let t = 0; t < trials; t++) {
      const g = new Game({});
      g.newRun({ mode: 'classic', level });
      g.event = null; g.applyEvent();
      g.state = 'play';
      const a = g.apple;
      for (let f = 0; f < 60 * 30 && g.state === 'play'; f++) {
        const heads = g.snakes.filter(s => !s.dead).map(s => s.body[0]);
        const near = heads.length ? Math.min(...heads.map(h => Math.abs(h.x - a.x) + Math.abs(h.y - a.y))) : 99;
        const actions = near <= K && a.rotCd <= 0 && a.rot <= 0 ? ['rot'] : [];
        g.update(1 / 60, { taps: [], held: null, actions });
      }
      if (g.state === 'clear' || g.state === 'cleared') wins++;
      poison += g.kills.poison;
      bites += g.stats.maxBites - g.bites;
    }
    if (!best || wins > best.wins) best = { K, wins, poison, bites };
  }
  console.log(String(level).padStart(5), String(best.K).padStart(7), String(Math.round(best.wins / trials * 100) + '%').padStart(12), String(best.poison).padStart(13), String(best.bites).padStart(12));
}
