// Headless balance/smoke test: a simple bot plays many runs.
// Usage: node tools/sim.mjs [runs] [mode] [dailySeed]
import { Game } from '../js/engine.js';

const runs = +process.argv[2] || 20;
const mode = process.argv[3] || 'classic';
const seed = process.argv[4] ? +process.argv[4] : null;
const results = [];
for (let r = 0; r < runs; r++) {
  let over = false;
  const g = new Game({ event: (n) => { if (n === 'over') over = true; } });
  g.newRun({ mode, seed });
  let t = 0;
  const levelTimes = [];
  while (!over && t < 1800 && g.level <= 30) {
    if (g.state === 'cleared') { levelTimes.push(g.levelTime.toFixed(0)); g.applyPerk(g.perkChoices()[0].id); g.nextLevel(); }
    const inp = g.state === 'play' ? g.demoInput(1 / 60) : null;
    g.update(1 / 60, inp);
    t += 1 / 60;
  }
  results.push({ level: g.level, score: Math.round(g.score), stars: g.starsRun, grades: g.grades.join(''), closeCalls: g.closeCalls, nerveBest: g.nerveBest, kills: g.kills, levelTimes: levelTimes.join(',') });
}
for (const r of results) console.log(JSON.stringify(r));
const avg = results.reduce((s, r) => s + r.level, 0) / results.length;
console.log('avg level reached', avg.toFixed(2));
