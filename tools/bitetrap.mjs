// Regression test for the "bite trap": the apple waits in a 1-tile pocket on
// the border with brambles either side. A snake that comes in and eats it must
// not then die stuck in the pocket (getting eaten should never win a level).
// Usage: node tools/bitetrap.mjs
import { Game } from '../js/engine.js';

let failures = 0;
for (const level of [1, 2, 3, 4, 6, 9]) {
  for (const fresh of [true, false]) {
    const g = new Game({});
    g.newRun({ mode: 'classic', level });
    g.event = null; g.applyEvent();
    g.rocks.fill(0);
    g.snakes.length = 1;
    const s = g.snakes[0];
    s.body = [{ x: 12, y: 5 }, { x: 12, y: 6 }, { x: 12, y: 7 }, { x: 12, y: 8 }, { x: 12, y: 9 }];
    s.old = s.body.map(c => ({ ...c })); s.dir = { x: 0, y: -1 }; s.grow = 0; s.lungeCd = 99;
    const a = g.apple;
    a.x = 12; a.y = 0; a.fromX = 12; a.fromY = 0; a.rotCd = 99;
    const plant = () => { for (const x of [11, 13]) g.brambles.set(g.idx(x, 0), { x, y: 0, age: 0, born: g.time, life: 30, seed: 0.5 }); };
    // "old": thorns planted well before the snake arrives; "fresh": planted as it closes in.
    if (!fresh) plant();
    let planted = !fresh;
    g.bites = 3;
    g.state = 'play';
    let bitten = false;
    const origBite = g.biteApple.bind(g);
    g.biteApple = sn => { bitten = true; return origBite(sn); };
    for (let f = 0; f < 60 * 6 && g.state === 'play'; f++) {
      if (!planted && s.body[0].y <= 2) { plant(); planted = true; }
      g.update(1 / 60, { taps: [], held: null, actions: [] });
    }
    const cleared = g.state === 'clear' || g.state === 'cleared';
    const bad = bitten && cleared;
    if (bad) failures++;
    console.log(`level ${level} ${fresh ? 'fresh' : 'old  '} thorns: bitten=${bitten} snakeDead=${s.dead}${s.cause ? '(' + s.cause + ')' : ''} levelCleared=${cleared}${bad ? '  <-- BUG' : ''}`);
  }
}
console.log(failures ? `${failures} failing case(s)` : 'all good');
process.exit(failures ? 1 : 0);
