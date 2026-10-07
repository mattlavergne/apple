// Skill check for Hidden Rot: trigger rot when a snake is K tiles away, then
// flee (using the title-screen flee AI) until the poisoned snake withers.
// A player who does this well should usually get the kill.
// Usage: node tools/rotkite.mjs [trialsPerLevel]
import { Game } from '../js/engine.js';

const trials = +process.argv[2] || 40;
console.log('level  poisoned  -> withered (kill)  -> cured  bites  avg clear time');
for (let level = 3; level <= 14; level++) {
  let poisoned = 0, withered = 0, cured = 0, bites = 0, clearT = 0, clears = 0;
  for (let t = 0; t < trials; t++) {
    const g = new Game({ event: (n) => { if (n === 'poison') poisoned++; } });
    g.newRun({ mode: 'classic', level });
    g.event = null; g.applyEvent();
    g.state = 'play';
    const a = g.apple;
    let wasSick = new Set();
    for (let f = 0; f < 60 * 25 && g.state === 'play'; f++) {
      const live = g.snakes.filter(s => !s.dead);
      const anySick = live.some(s => s.sick);
      for (const s of g.snakes) {
        if (s.sick) wasSick.add(s);
        else if (wasSick.has(s) && !s.dead) { cured++; wasSick.delete(s); }
      }
      let input;
      if (anySick || a.rot > 0 && false) {
        // Kite: run from the sick snake.
        input = g.demoInput(1 / 60);
        input.actions = input.actions.filter(x => x === 'dash');
      } else {
        const near = live.length ? Math.min(...live.map(s => Math.abs(s.body[0].x - a.x) + Math.abs(s.body[0].y - a.y))) : 99;
        input = { taps: [], held: null, actions: near <= 2 && a.rotCd <= 0 ? ['rot'] : [] };
      }
      g.update(1 / 60, input);
    }
    withered += g.kills.poison;
    if (g.state === 'clear' || g.state === 'cleared') { clears++; clearT += g.levelTime; }
    bites += g.stats.maxBites - g.bites;
  }
  console.log(String(level).padStart(5), String(poisoned).padStart(9), String(withered).padStart(19), String(cured).padStart(9), String(bites).padStart(6), clears ? (clearT / clears).toFixed(1).padStart(10) + 's' : '         -');
}
