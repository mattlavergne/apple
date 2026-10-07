// Plays every Adventure level with the general flee bot (3 bites, no
// upgrades) and reports clear rates per world, so the difficulty curve and any
// broken levels are easy to spot.
// Usage: node tools/adventure.mjs [trialsPerLevel] [fromLevel] [toLevel]
import { Game } from '../js/engine.js';
import { adventureLevel, objectiveText } from '../js/levels.js';
import { WORLDS } from '../js/config.js';

const trials = +process.argv[2] || 6;
const from = +process.argv[3] || 1, to = +process.argv[4] || 100;
let world = -1, wClear = 0, wN = 0, wTime = 0;
const flush = () => { if (wN) console.log(`  world ${world + 1} ${WORLDS[world].name.padEnd(15)} clear ${String(Math.round(wClear / wN * 100)).padStart(3)}%  avg ${(wTime / Math.max(1, wClear)).toFixed(0)}s`); };
for (let n = from; n <= to; n++) {
  const def = adventureLevel(n);
  if (def.world !== world) { flush(); world = def.world; wClear = 0; wN = 0; wTime = 0; }
  let clears = 0, time = 0;
  for (let t = 0; t < trials; t++) {
    for (const [cols, rows] of [[25, 17], [17, 25]]) {
      const g = new Game({});
      g.newRun({ adventure: def, cols, rows });
      g.state = 'play';
      for (let f = 0; f < 60 * 150 && g.state === 'play'; f++) g.update(1 / 60, g.demoInput(1 / 60));
      if (g.state === 'clear' || g.state === 'cleared') { clears++; time += g.levelTime; }
      wN++;
    }
  }
  wClear += clears; wTime += time;
  if (process.argv.includes('-v')) console.log(`${String(n).padStart(3)} ${def.name.padEnd(16)} ${def.template.padEnd(9)} diff ${String(def.diff).padStart(2)} x${def.snakes} ${objectiveText(def.objective).padEnd(26)} ${def.event || ''}`.padEnd(95) + ` ${clears}/${trials * 2}`);
}
flush();
