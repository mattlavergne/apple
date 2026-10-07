// Tiny synthesized sound effects and background music. No audio files needed.

let ctx = null, master, sfxBus, musicBus;
let sfxOn = true, musicOn = true;
let noiseBuf = null;
let musicTimer = null, nextNoteTime = 0, step = 0, song = null, tempoMul = 1;

// The music speeds up with the snakes' hunger (1 = calm).
export function setIntensity(hunger) {
  tempoMul = 1 + Math.max(0, hunger - 1) * 0.5;
}

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.gain.value = sfxOn ? 0.55 : 0; sfxBus.connect(master);
  musicBus = ctx.createGain(); musicBus.gain.value = musicOn ? 0.18 : 0; musicBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

function tone(freq, dur, { type = 'sine', vol = 0.5, slide = null, delay = 0, attack = 0.005, bus = sfxBus } = {}) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(bus);
  o.start(t); o.stop(t + dur + 0.05);
}

function noise(dur, { vol = 0.4, filter = 'lowpass', freq = 1200, q = 1, delay = 0, sweep = null } = {}) {
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = filter; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(sfxBus);
  src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
}

const SFX = {
  click: () => tone(660, 0.06, { type: 'triangle', vol: 0.3 }),
  bump: () => tone(160, 0.08, { type: 'square', vol: 0.12, slide: 90 }),
  nope: () => { tone(220, 0.08, { type: 'square', vol: 0.12 }); tone(180, 0.1, { type: 'square', vol: 0.12, delay: 0.07 }); },
  dash: () => { noise(0.2, { vol: 0.35, filter: 'bandpass', freq: 800, sweep: 4000, q: 2 }); tone(300, 0.15, { type: 'triangle', vol: 0.2, slide: 900 }); },
  thorn: () => { tone(520, 0.12, { type: 'triangle', vol: 0.35, slide: 180 }); noise(0.08, { vol: 0.2, freq: 2000 }); },
  rot: () => { tone(220, 0.35, { type: 'sawtooth', vol: 0.12, slide: 70 }); noise(0.3, { vol: 0.15, freq: 500, filter: 'lowpass' }); },
  decoy: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.15, { type: 'triangle', vol: 0.2, delay: i * 0.05 })),
  decoyPop: () => { tone(900, 0.2, { type: 'triangle', vol: 0.25, slide: 300 }); noise(0.1, { vol: 0.2, freq: 3000, filter: 'highpass' }); },
  star: () => { tone(988, 0.08, { type: 'square', vol: 0.12 }); tone(1319, 0.18, { type: 'square', vol: 0.12, delay: 0.07 }); },
  seed: () => { tone(500, 0.1, { type: 'triangle', vol: 0.3, slide: 800 }); tone(800, 0.12, { type: 'triangle', vol: 0.2, delay: 0.08 }); },
  heart: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, { type: 'triangle', vol: 0.25, delay: i * 0.06 })),
  crunch: () => { noise(0.12, { vol: 0.7, filter: 'bandpass', freq: 1800, q: 0.8 }); noise(0.14, { vol: 0.6, filter: 'bandpass', freq: 1200, q: 0.8, delay: 0.09 }); tone(120, 0.15, { type: 'square', vol: 0.15, slide: 60 }); },
  hiss: () => noise(0.45, { vol: 0.25, filter: 'highpass', freq: 3500 }),
  lunge: () => noise(0.15, { vol: 0.3, filter: 'bandpass', freq: 2500, sweep: 600 }),
  crash: () => { noise(0.4, { vol: 0.6, filter: 'lowpass', freq: 900, sweep: 100 }); tone(220, 0.35, { type: 'square', vol: 0.18, slide: 40 }); tone(880, 0.12, { type: 'triangle', vol: 0.15, delay: 0.05 }); },
  poison: () => { tone(400, 0.5, { type: 'sawtooth', vol: 0.15, slide: 60 }); [0, 0.1, 0.2].forEach(d => tone(300 + Math.random() * 400, 0.08, { type: 'sine', vol: 0.2, delay: 0.2 + d })); },
  pop: () => tone(600 + Math.random() * 500, 0.06, { type: 'sine', vol: 0.15, slide: 1200 }),
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, { type: 'triangle', vol: 0.3, delay: 0.25 + i * 0.09 })),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, { type: 'triangle', vol: 0.3, delay: 0.2 + i * 0.16 })),
  count: () => tone(523, 0.12, { type: 'square', vol: 0.12 }),
  go: () => tone(1047, 0.25, { type: 'square', vol: 0.14 }),
  frenzy: () => { noise(0.6, { vol: 0.35, filter: 'highpass', freq: 2500 }); [196, 233, 277, 330].forEach((f, i) => tone(f, 0.18, { type: 'sawtooth', vol: 0.08, delay: i * 0.07 })); },
  nemesis: () => [110, 104, 98].forEach((f, i) => tone(f, 0.5, { type: 'sawtooth', vol: 0.14, delay: i * 0.25 })),
  quake: () => { noise(0.9, { vol: 0.6, filter: 'lowpass', freq: 220, sweep: 60 }); tone(55, 0.8, { type: 'sawtooth', vol: 0.12, slide: 35 }); },
  grade: () => [784, 1047, 1568].forEach((f, i) => tone(f, 0.25, { type: 'square', vol: 0.12, delay: i * 0.08 })),
  buy: () => [659, 880, 1319].forEach((f, i) => tone(f, 0.15, { type: 'square', vol: 0.12, delay: i * 0.06 })),
};

export function play(name) {
  if (!sfxOn || !ensure() || ctx.state !== 'running') return;
  const fn = SFX[name];
  if (fn) fn();
}

export function unlock() {
  if (!ensure()) return;
  if (ctx.state === 'suspended') ctx.resume();
}

export function setSfx(on) {
  sfxOn = on;
  if (sfxBus) sfxBus.gain.value = on ? 0.55 : 0;
}

export function setMusic(on) {
  musicOn = on;
  if (musicBus) musicBus.gain.value = on ? 0.18 : 0;
}

// ------------------------------------------------------------------ music
// A gentle generated tune in a major pentatonic scale. Each world gets its own key and tempo.
const KEYS = [60, 57, 62, 64, 55, 65];
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];
const PROG = [0, 7, 9, 5]; // I V vi IV
const midi = n => 440 * Math.pow(2, (n - 69) / 12);

function makeSong(world, boss) {
  let seed = world * 9973 + 17;
  const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const melody = [];
  let idx = 3;
  for (let i = 0; i < 64; i++) {
    if (r() < 0.32) { melody.push(null); continue; }
    idx = Math.max(0, Math.min(PENTA.length - 1, idx + Math.floor(r() * 5) - 2));
    melody.push(PENTA[idx]);
  }
  return { root: KEYS[world % KEYS.length], melody, tempo: boss ? 132 : 112 + world * 3 };
}

function schedule() {
  if (!musicOn) { nextNoteTime = ctx.currentTime + 0.1; return; }
  const spb = 60 / (song.tempo * tempoMul) / 2; // eighth notes
  while (nextNoteTime < ctx.currentTime + 0.15) {
    const bar = Math.floor(step / 8) % 4;
    const chord = song.root + PROG[bar];
    const t = nextNoteTime - ctx.currentTime;
    if (step % 4 === 0) tone(midi(chord - 24), spb * 3.5, { type: 'triangle', vol: 0.5, delay: t, bus: musicBus, attack: 0.01 });
    if (step % 2 === 1) tone(midi(chord - 12 + (step % 4 === 1 ? 4 : 7)), spb * 0.9, { type: 'sine', vol: 0.18, delay: t, bus: musicBus });
    const m = song.melody[step % song.melody.length];
    if (m != null) tone(midi(song.root + 12 + m), spb * 1.6, { type: 'square', vol: 0.07, delay: t, bus: musicBus, attack: 0.01 });
    nextNoteTime += spb;
    step++;
  }
}

export function startMusic(world = 0, boss = false) {
  if (!ensure()) return;
  stopMusic();
  song = makeSong(world, boss);
  step = 0;
  nextNoteTime = ctx.currentTime + 0.1;
  musicTimer = setInterval(() => { if (ctx.state === 'running') schedule(); }, 40);
}

export function stopMusic() {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
}

// Close-call chime: climbs a pentatonic scale as the Nerve combo grows.
const NEAR_STEPS = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
export function playNear(n) {
  if (!sfxOn || !ensure() || ctx.state !== 'running') return;
  const semis = NEAR_STEPS[Math.min(NEAR_STEPS.length - 1, n - 1)];
  const f = 660 * Math.pow(2, semis / 12);
  tone(f, 0.12, { type: 'triangle', vol: 0.25 });
  tone(f * 1.5, 0.18, { type: 'sine', vol: 0.12, delay: 0.05 });
  noise(0.12, { vol: 0.15, filter: 'highpass', freq: 5000 });
}
