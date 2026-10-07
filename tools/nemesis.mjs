// How hard is the nemesis ambush at each rank? The general flee bot plays the
// ambush level (with 3 bites) against a normal snake (rank 0) and ranks 1-5.
// Usage: node tools/nemesis.mjs [trials] [level]
import { Game } from '../js/engine.js';

const trials = +process.argv[2] || 60;
const level = +process.argv[3] || 4;
console.log(`level ${level}: rank  cleared  avg bites taken  avg time`);
for (let rank = 0; rank <= 5; rank++) {
  let cleared = 0, bites = 0, time = 0;
  for (let t = 0; t < trials; t++) {
    const g = new Game({});
    const nemesis = rank ? { species: 'viper', first: 'Vicky', rank, wins: rank } : null;
    g.newRun({ mode: 'classic', level, nemesis });
    if (nemesis) { g.nemesisLevel = level; g.startLevel(); }
    g.event = null; g.applyEvent();
    g.state = 'play';
    for (let f = 0; f < 60 * 90 && g.state === 'play'; f++) g.update(1 / 60, g.demoInput(1 / 60));
    if (g.state === 'clear' || g.state === 'cleared') { cleared++; time += g.levelTime; }
    bites += g.stats.maxBites - Math.max(0, g.bites);
  }
  console.log(`         ${rank}  ${String(Math.round(cleared / trials * 100) + '%').padStart(7)}  ${(bites / trials).toFixed(2).padStart(15)}  ${cleared ? (time / cleared).toFixed(0) + 's' : '-'}`);
}
