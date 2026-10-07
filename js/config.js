// Static game data: worlds, snakes, difficulty curve, perks, upgrades, skins.

export const WORLDS = [
  {
    name: 'Sunny Orchard', grass: ['#9ad66f', '#8fcd64'], edge: '#6f9e45',
    border: '#7a5230', borderLight: '#a8743f', obstacle: 'rock',
    deco: ['#ffffff', '#ffe066', '#ff8fab'], tuft: '#6fae44', bg: ['#d8f3c4', '#a9dd8a'],
  },
  {
    name: 'Sunset Meadow', grass: ['#c9d86a', '#bfcf5f'], edge: '#98a643',
    border: '#8b4a2b', borderLight: '#c06a3c', obstacle: 'stump',
    deco: ['#ff9f43', '#ffd166', '#f78fb3'], tuft: '#9aab3e', bg: ['#ffe0b8', '#f7a87a'],
  },
  {
    name: 'Dusty Desert', grass: ['#f3d9a4', '#ecd096'], edge: '#d2b073',
    border: '#b5793f', borderLight: '#dca562', obstacle: 'cactus',
    deco: ['#e8b86d', '#ffffff', '#ff7aa2'], tuft: '#c9a560', bg: ['#fff1cf', '#f4c98a'],
  },
  {
    name: 'Frosty Field', grass: ['#eaf5fc', '#dcedf8'], edge: '#b4d3ea',
    border: '#5c8fb8', borderLight: '#8fc0e3', obstacle: 'ice',
    deco: ['#ffffff', '#b8e1ff', '#d6c8ff'], tuft: '#a9cde6', bg: ['#f2f9ff', '#bcdcf5'],
  },
  {
    name: 'Moonlit Garden', grass: ['#3d5f58', '#375750'], edge: '#28423d',
    border: '#24303f', borderLight: '#3d4f66', obstacle: 'mushroom',
    deco: ['#b8f2e6', '#ffe66d', '#c3a6ff'], tuft: '#2f4d47', bg: ['#2b3a55', '#141c2b'],
    dark: true,
  },
  {
    name: 'Candy Kingdom', grass: ['#ffe0ee', '#ffd3e6'], edge: '#f6b3d0',
    border: '#d94f8a', borderLight: '#ff86b7', obstacle: 'gumdrop',
    deco: ['#7ad7f0', '#ffe066', '#b892ff'], tuft: '#f5b0cf', bg: ['#fff0f7', '#ffc2dc'],
  },
  {
    name: 'Autumn Woods', grass: ['#d8b25c', '#cfa751'], edge: '#a8813b',
    border: '#6b3a1f', borderLight: '#9a5a2e', obstacle: 'stump',
    deco: ['#e85d2a', '#f2a541', '#b5482a'], tuft: '#b8903f', bg: ['#fde3c0', '#e9a466'],
  },
  {
    name: 'Seaside Dunes', grass: ['#f5e6bf', '#eedcb0'], edge: '#d9c48f',
    border: '#2f7fa8', borderLight: '#5fb2d9', obstacle: 'rock',
    deco: ['#ff8a80', '#ffffff', '#80deea'], tuft: '#cdb67e', bg: ['#d9f3ff', '#86cdef'],
  },
  {
    name: 'Volcano Rim', grass: ['#5a4741', '#52403b'], edge: '#3b2b27',
    border: '#3a1d17', borderLight: '#7a2e1c', obstacle: 'rock',
    deco: ['#ff7043', '#ffab40', '#ffd54f'], tuft: '#4a3a35', bg: ['#4a2a22', '#1e0f0c'],
    dark: true,
  },
  {
    name: 'Cloud Garden', grass: ['#eef2ff', '#e4eafd'], edge: '#c8d3f5',
    border: '#8e9ad6', borderLight: '#b9c3f0', obstacle: 'gumdrop',
    deco: ['#ffd6f0', '#c9f2ff', '#fff3b0'], tuft: '#ccd6f6', bg: ['#f6f4ff', '#c9d4ff'],
  },
];

export function worldIndexFor(level) {
  return Math.floor((level - 1) / 5) % WORLDS.length;
}

export const SPECIES = [
  { id: 'garden', name: 'Gary the Garden Snake', body: '#4fb34f', dark: '#2e7d32', belly: '#b9f0a8', pattern: 'spots', patternColor: '#2f8f3a' },
  { id: 'grass', name: 'Gus the Grass Snake', body: '#38a3a5', dark: '#1f6f71', belly: '#b8f3f0', pattern: 'stripes', patternColor: '#22787a' },
  { id: 'viper', name: 'Vicky the Viper', body: '#8e5bd6', dark: '#5a2f99', belly: '#e2cffc', pattern: 'diamonds', patternColor: '#5d33a0' },
  { id: 'python', name: 'Monty the Python', body: '#e2a93b', dark: '#9b6a12', belly: '#fff0c4', pattern: 'spots', patternColor: '#7a4f0e' },
  { id: 'cobra', name: 'King Cobra Carl', body: '#e4572e', dark: '#9c2c12', belly: '#ffd6b8', pattern: 'stripes', patternColor: '#3b1d10', hood: true },
];

export const MODES = {
  sprout: { name: 'Sprout', desc: 'Relaxed. Slower snakes, more bites.', speed: 0.8, aiOffset: -1, growMult: 1.3, bites: 5, starMult: 0.75 },
  classic: { name: 'Classic', desc: 'The real deal.', speed: 1, aiOffset: 0, growMult: 1, bites: 3, starMult: 1 },
  core: { name: 'Rotten Core', desc: 'Smart, fast snakes. One mistake hurts.', speed: 1.15, aiOffset: 4, growMult: 0.85, bites: 2, starMult: 1.6 },
};

// Difficulty curve. `level` starts at 1 and never ends.
export function levelParams(level, mode) {
  const m = MODES[mode] || MODES.classic;
  const L = level;
  const eff = Math.max(1, L + m.aiOffset);
  const boss = L % 5 === 0;
  return {
    boss,
    snakeCount: Math.min(3, 1 + (boss ? 1 : 0) + (L >= 11 ? 1 : 0)),
    step: Math.max(0.085, 0.21 - 0.0085 * (L - 1)) / m.speed,
    growEvery: Math.max(1.1, 2.6 - 0.09 * (L - 1)) * m.growMult,
    ai: eff <= 2 ? 'greedy' : 'bfs',
    smart: eff >= 6 ? Math.min(0.95, (eff - 5) * 0.14) : 0,
    // Seconds before a fresh bramble is noticed. ~3 snake steps at level 1,
    // ~1.5 by level 10.
    thornReact: Math.max(0.22, 0.72 - 0.055 * (eff - 1)) * (mode === 'sprout' ? 1.35 : 1),
    // Early levels (before snakes learn to lunge) let thorns kill outright.
    thornsKill: eff <= 2 || (mode === 'sprout' && L < 6),
    lunge: eff >= 3 && !(mode === 'sprout' && L < 6),
    lungeCd: Math.max(2.4, 6.5 - 0.25 * L),
    lungeSteps: 4 + Math.floor(L / 6),
    // Seconds before a snake within 3 tiles smells active rot.
    smell: Math.max(0.3, 1.0 - 0.07 * Math.max(0, eff - 3)),
    startLen: 4 + Math.floor(L / 3),
    // Hunger: snakes speed up the longer a level lasts (x faster per second),
    // so waiting it out stops being safe. Sprout stays gentle.
    hungerRate: (0.011 + 0.0006 * Math.min(L, 20)) * (mode === 'sprout' ? 0.5 : mode === 'core' ? 1.3 : 1),
    hungerCap: mode === 'sprout' ? 1.45 : 1.9,
    // How often a snake aims where you're going instead of where you are.
    intercept: eff >= 4 ? Math.min(0.9, 0.35 + 0.08 * (eff - 4)) : 0,
    rockClusters: Math.min(9, 1 + Math.floor(L / 2)),
  };
}

export function speciesFor(level, i) {
  if (i > 0 && level % 5 === 0 && i === 1) return SPECIES[4]; // the boss
  const base = Math.min(SPECIES.length - 2, Math.floor((level - 1) / 3));
  if (i === 0) return SPECIES[base];
  return SPECIES[(base + i) % (SPECIES.length - 1)];
}

export const TIPS = {
  1: 'Move with the Arrow keys or WASD (or swipe). Lead the snake into a wall, a rock, or its own tail. Don’t dawdle: snakes get HUNGRY and faster the longer a level lasts!',
  2: 'Drop a bramble behind you (E) while a snake chases you. It needs a moment to spot fresh thorns, so if it\u2019s right on your tail: OUCH! Slipping right past a snake\u2019s nose builds NERVE, which multiplies your score.',
  3: 'Snakes now LUNGE (watch for the red “!”): a lunging snake can’t dodge fresh thorns. NEW: Hidden Rot (Q)! A snake that bites you while you’re rotten gets SICK and withers away, unless it bites a fresh apple first. Run!',
  4: 'Snakes now aim where you’re GOING, not where you are. Running laps gets you cut off: fake one way, then cut back.',
  5: 'BOSS LEVEL! King Cobra Carl brought a friend. Get them to crash into each other!',
  6: 'Snakes are getting clever. They try to avoid dead ends now, so you’ll need real traps.',
  10: 'Snakes smell rot faster now. Go rotten at the very last second, or bait a lunge: lunging snakes can’t smell a thing.',
  11: 'Two snakes from now on. Tangle them together for bonus points!',
};

export const GENERIC_TIPS = [
  'Snakes grow longer every few seconds. Run them out of room!',
  'Grab stars to unlock upgrades and skins in the Orchard.',
  'Seed pickups refill your brambles.',
  'Sick snakes are slow and can’t lunge. Rot one again for an instant knockout!',
  'Corners are dangerous for you AND the snake.',
  'Drop a bramble right after a sharp turn. Snakes can’t stop!',
  'Hearts heal one bite.',
  'When the edge starts to flash, the hedge is coming. Lure a snake along it: HEDGED!',
  'Clever snakes aim where you’re going. Fake one way, then cut back.',
  'Two snakes hunt as a team: one chases, the other cuts you off.',
  'Getting bitten calms a hungry snake down a little. Small comfort.',
  'The snake that ends your run becomes your NEMESIS. Beat it for its bounty!',
  'Check the title screen for today’s contracts. They change every day.',
  'A sick snake that bites you is cured. Keep your distance until it withers!',
  'NERVE multiplies everything, even crash bonuses. Dance close before you spring the trap!',
  'A lunging snake that just misses you counts double for NERVE.',
  'S grades need no bites, a quick clear and a NERVE of 4 or more.',
  'Two snakes bumping into each other counts as TANGLED. That’s worth 1.5× points!',
];

// Run-time stats every run starts from. Orchard upgrades and perks modify a copy.
export function baseStats(mode) {
  return {
    maxBites: (MODES[mode] || MODES.classic).bites,
    appleStep: 0.115,
    dashCd: 4,
    dashDist: 3,
    thornCap: 3,
    thornLife: 10,
    thornRegen: 15,
    rotDur: 2.5,
    rotCd: 14,
    decoy: false,
    decoyCd: 16,
    decoyDur: 5,
    magnet: 0,
    scent: 0,
    luck: 1,
    starBonus: 1,
  };
}

export const UPGRADES = [
  { id: 'bite', icon: '❤️', name: 'Thick Skin', desc: '+1 bite before you’re eaten.', costs: [150, 450], apply: (s, n) => { s.maxBites += n; } },
  { id: 'speed', icon: '🍃', name: 'Swift Stem', desc: 'Roll 6% faster per level.', costs: [60, 160, 320], apply: (s, n) => { s.appleStep *= Math.pow(0.94, n); } },
  { id: 'dash', icon: '💨', name: 'Dash Mastery', desc: 'Dash recharges 12% faster per level.', costs: [60, 160, 320], apply: (s, n) => { s.dashCd *= Math.pow(0.88, n); } },
  { id: 'thorns', icon: '🌿', name: 'Bramble Bag', desc: 'Carry +1 bramble per level.', costs: [80, 200, 400], apply: (s, n) => { s.thornCap += n; } },
  { id: 'rot', icon: '🦠', name: 'Deeper Rot', desc: 'Rot lasts +0.5s per level.', costs: [100, 260, 500], apply: (s, n) => { s.rotDur += 0.5 * n; } },
  { id: 'decoy', icon: '✨', name: 'Decoy Apple', desc: 'Unlock the Decoy (R): a shiny fake that snakes chase.', costs: [300], apply: (s, n) => { if (n) s.decoy = true; } },
  { id: 'magnet', icon: '🧲', name: 'Star Magnet', desc: 'Pull nearby stars toward you.', costs: [150, 350], apply: (s, n) => { s.magnet += n * 1.5; } },
];

export const PERKS = [
  { id: 'quick', icon: '🍃', name: 'Quick Roll', desc: 'Move 10% faster.', max: 3, apply: s => { s.appleStep *= 0.9; } },
  { id: 'longdash', icon: '🚀', name: 'Long Dash', desc: 'Dash 1 tile further.', max: 2, apply: s => { s.dashDist += 1; } },
  { id: 'fastdash', icon: '💨', name: 'Second Wind', desc: 'Dash recharges 25% faster.', max: 3, apply: s => { s.dashCd *= 0.75; } },
  { id: 'pouch', icon: '🌿', name: 'Thorn Pouch', desc: '+2 bramble capacity.', max: 3, apply: s => { s.thornCap += 2; } },
  { id: 'sturdy', icon: '🌵', name: 'Sturdy Thorns', desc: 'Brambles last 5s longer.', max: 3, apply: s => { s.thornLife += 5; } },
  { id: 'regrow', icon: '🌱', name: 'Regrowth', desc: 'Brambles regrow twice as fast.', max: 2, apply: s => { s.thornRegen *= 0.5; } },
  { id: 'deeprot', icon: '🦠', name: 'Deep Rot', desc: 'Rot lasts 1s longer.', max: 3, apply: s => { s.rotDur += 1; } },
  { id: 'rotspread', icon: '🍂', name: 'Fast Decay', desc: 'Rot recharges 25% faster.', max: 3, apply: s => { s.rotCd *= 0.75; } },
  { id: 'odorless', icon: '🤫', name: 'Faint Scent', desc: 'Snakes take 0.4s longer to smell your rot.', max: 2, apply: s => { s.scent += 0.4; } },
  { id: 'skin', icon: '❤️', name: 'Extra Crunchy', desc: '+1 max bite and heal fully.', max: 2, apply: s => { s.maxBites += 1; } , heal: true },
  { id: 'magnet', icon: '🧲', name: 'Star Magnet', desc: 'Pull stars from further away.', max: 2, apply: s => { s.magnet += 1.5; } },
  { id: 'lucky', icon: '🍀', name: 'Lucky Leaf', desc: 'Pickups appear more often.', max: 2, apply: s => { s.luck *= 1.35; } },
  { id: 'decoy', icon: '✨', name: 'Decoy Apple', desc: 'Unlock the Decoy (R) for this run.', max: 1, apply: s => { s.decoy = true; }, when: s => !s.decoy },
  { id: 'greedy', icon: '⭐', name: 'Star Struck', desc: 'Earn 25% more stars.', max: 3, apply: s => { s.starBonus *= 1.25; } },
];

export const SKINS = [
  { id: 'red', name: 'Red Delicious', cost: 0, base: '#e8392f', dark: '#a3171a', light: '#ff9a86', leaf: '#4caf50' },
  { id: 'granny', name: 'Granny Smith', cost: 100, base: '#7fcb4b', dark: '#3f8a22', light: '#d4f7a6', leaf: '#2e7d32' },
  { id: 'golden', name: 'Golden Delicious', cost: 250, base: '#f7cf3d', dark: '#c48a12', light: '#fff4b0', leaf: '#5aa846' },
  { id: 'pink', name: 'Pink Lady', cost: 400, base: '#ff79a6', dark: '#c93a6e', light: '#ffd0e0', leaf: '#4caf50' },
  { id: 'candy', name: 'Candy Apple', cost: 700, base: '#d3122e', dark: '#6e0010', light: '#ff8a9a', leaf: '#4caf50', gloss: true, stick: true },
  { id: 'cosmic', name: 'Cosmic Crisp', cost: 1200, base: '#6d44d9', dark: '#2f1580', light: '#c2adff', leaf: '#35c4a8', sparkle: true },
  { id: 'gold', name: 'Solid Gold', cost: 2500, base: '#f2c230', dark: '#8a5d00', light: '#fffbe0', leaf: '#e0a800', gloss: true, sparkle: true },
];

export const CORE_UNLOCK_LEVEL = 10;

// One-level rule twists. From level 3 on, most non-boss levels roll one.
export const EVENTS = {
  feast: { name: 'Star Shower', icon: '🌠', desc: 'Stars rain down. Grab them before the snakes do!' },
  fog: { name: 'Thick Fog', icon: '🌫️', desc: 'You can only see what’s close. Watch for glowing eyes.' },
  golden: { name: 'Golden Snake', icon: '👑', desc: 'One snake is pure gold: 3× points and 10 stars if it crashes.' },
  quake: { name: 'Earthquake', icon: '🌋', desc: 'The ground shifts. Rocks move every few seconds.' },
  mirror: { name: 'Mirror Twin', icon: '🪞', desc: 'A ghost twin mirrors your moves. Snakes chase whichever is closer.' },
  hungry: { name: 'Hungry Hour', icon: '🍽️', desc: 'Snakes grow twice as fast but move a little slower.' },
  tailwind: { name: 'Tailwind', icon: '🌬️', desc: 'Everyone speeds up. You most of all.' },
  bloom: { name: 'Bramble Bloom', icon: '🌹', desc: 'Brambles regrow in seconds, but wilt fast.' },
};
const EVENT_IDS = Object.keys(EVENTS);

export function eventFor(level, rnd) {
  if (level < 3 || level % 5 === 0) return null;
  const roll = rnd();
  if (roll < 0.3) return null;
  return EVENT_IDS[Math.floor(rnd() * EVENT_IDS.length)];
}

export const GRADE_COLORS = { S: '#ffb300', A: '#43a047', B: '#1e88e5', C: '#8d6e63' };

// The snake that ends your run becomes your nemesis and ranks up each time it
// gets you again. Index = rank - 1.
export const NEMESIS_TITLES = ['the Hungry', 'the Apple-Eater', 'the Orchard Terror', 'the Core Crusher', 'the Legend'];
export const nemesisName = n => `${n.first} ${NEMESIS_TITLES[Math.min(NEMESIS_TITLES.length, n.rank) - 1]}`;
export const nemesisBounty = n => 25 * n.rank + 10 * (n.wins - 1);

// Daily Contracts: three challenges a day (one per tier), the same for everyone.
// `n` lists possible targets; the day's seed picks one.
export const CONTRACTS = [
  { id: 'close', tier: 0, icon: '⚡', n: [15, 25], text: n => `Make ${n} close calls` },
  { id: 'stars', tier: 0, icon: '⭐', n: [30, 50], text: n => `Collect ${n} stars` },
  { id: 'level', tier: 0, icon: '🏁', n: [5, 6], text: n => `Reach level ${n} in one run` },
  { id: 'walls', tier: 0, icon: '🧱', n: [3, 5], text: n => `Bonk ${n} snakes into walls, rocks or hedges` },
  { id: 'scratch', tier: 0, icon: '🌿', n: [3, 5], text: n => `Scratch ${n} snakes with fresh thorns` },
  { id: 'nerve', tier: 1, icon: '🔥', n: [8, 10], text: n => `Reach Nerve ×${1 + 0.25 * n}` },
  { id: 'poison', tier: 1, icon: '🦠', n: [2, 3], text: n => `Wither ${n} snakes with Hidden Rot` },
  { id: 'self', tier: 1, icon: '🪢', n: [2, 3], text: n => `Tie ${n} snakes in knots` },
  { id: 'unbitten', tier: 1, icon: '🛡️', n: [3, 4], text: n => `Clear ${n} levels without a bite` },
  { id: 'frenzy', tier: 1, icon: '🌶️', n: [1, 2], text: n => `Clear ${n === 1 ? 'a level' : n + ' levels'} during a FRENZY` },
  { id: 'lunge', tier: 2, icon: '🎯', n: [1, 2], text: n => `Thorn ${n === 1 ? 'a lunging snake' : n + ' lunging snakes'}` },
  { id: 'grade', tier: 2, icon: '🌟', n: [1, 2], text: n => `Earn ${n === 1 ? 'an S grade' : n + ' S grades'}` },
  { id: 'tangle', tier: 2, icon: '🕸️', n: [1, 2], text: n => `Tangle snakes together ${n === 1 ? 'once' : n + ' times'}` },
  { id: 'double', tier: 2, icon: '💥', n: [1], text: () => 'Get a DOUBLE KO' },
  { id: 'deep', tier: 2, icon: '🏔️', n: [9, 11], text: n => `Reach level ${n} in one run` },
];
export const CONTRACT_REWARD = [15, 25, 40];
export const CONTRACT_BONUS = 30;
