// Wires the engine, renderer, audio and DOM screens together.
import { Game, GRADE_STARS, mulberry32 } from './engine.js';
import { Renderer, drawApple } from './render.js';
import * as audio from './audio.js';
import { Input } from './input.js';
import { load, store } from './save.js';
import { ADVENTURE_LEVELS, LEVELS_PER_WORLD, adventureLevel, objectiveText, OBJECTIVE_ICON } from './levels.js';
import {
  WORLDS, MODES, UPGRADES, SKINS, TIPS, GENERIC_TIPS, CORE_UNLOCK_LEVEL, EVENTS, GRADE_COLORS,
  CONTRACTS, CONTRACT_REWARD, CONTRACT_BONUS, nemesisName, nemesisBounty,
} from './config.js';

const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];

const save = load();
const canvas = $('#game');
const renderer = new Renderer(canvas);
const input = new Input();
const skin = () => SKINS.find(s => s.id === save.skin) || SKINS[0];
save.settings = { controls: 'swipe', haptics: true, ...save.settings };
save.daily = { day: '', best: null, attempts: 0, streak: 0, lastDay: '', ...(save.daily || {}) };
save.nemesis = save.nemesis || null;
// Adventure progress: highest unlocked level, best stars (1-3) and score per level.
save.adventure = { unlocked: 1, stars: {}, best: {}, ...(save.adventure || {}) };
let advLevel = 1;
const totalAdvStars = () => Object.values(save.adventure.stars).reduce((a, b) => a + b, 0);
// 3 stars: no bites. 2 stars: one bite. 1 star: cleared.
const starsFor = bites => (bites === 0 ? 3 : bites === 1 ? 2 : 1);
const starStr = n => '\u2605'.repeat(n) + '\u2606'.repeat(3 - n);
save.stats.nemesesBeaten = save.stats.nemesesBeaten || 0;

const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const canVibrate = typeof navigator.vibrate === 'function';
document.documentElement.classList.toggle('is-touch', isTouch);
document.documentElement.classList.toggle('has-haptics', canVibrate && isTouch);
const buzz = pattern => { if (canVibrate && save.settings.haptics) try { navigator.vibrate(pattern); } catch { /* unsupported */ } };

// ------------------------------------------------------------------ daily run
// Everyone gets the same seeded levels, events and perk offers each local day.
const DAY_ONE = Date.UTC(2026, 9, 1);
function today(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const num = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - DAY_ONE) / 864e5) + 1;
  return { key, seed: d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(), num };
}
function syncDailyDay() {
  const t = today();
  if (save.daily.day !== t.key) {
    save.daily.day = t.key;
    save.daily.best = null;
    save.daily.attempts = 0;
  }
  // A streak survives only if yesterday (or today) was played.
  if (save.daily.lastDay && save.daily.lastDay !== t.key && save.daily.lastDay !== today(-1).key) save.daily.streak = 0;
}
let runKind = 'normal';

let screen = 'title';      // title | play | paused | perks | over
let returnTo = 'title';    // where "Back" from help/orchard goes
let saveTimer = null;
const persist = (now = false) => {
  clearTimeout(saveTimer);
  if (now) store(save);
  else saveTimer = setTimeout(() => store(save), 400);
};

const game = new Game({
  sfx: name => audio.play(name),
  skin,
  event: onEvent,
});

// ------------------------------------------------------------------ grid shape
function gridFor() {
  const r = $('#stage').getBoundingClientRect();
  return r.height > r.width * 1.15 ? { cols: 17, rows: 25 } : { cols: 25, rows: 17 };
}

function startDemo() {
  game.newRun({ mode: 'classic', demo: true, level: 3, ...gridFor() });
}

// ------------------------------------------------------------------ screens
function show(id) {
  $$('.screen').forEach(s => s.classList.toggle('show', s.id === 'screen-' + id));
}
function hideScreens() {
  $$('.screen').forEach(s => s.classList.remove('show'));
  // A focused button on a hidden screen would otherwise react to Space.
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
}

function setPlaying(on) {
  $('#hud').classList.toggle('hidden', !on);
  $('#abilities').classList.toggle('hidden', !on);
  input.enabled = on;
  requestAnimationFrame(() => renderer.resize());
}

function goTitle() {
  screen = 'title';
  audio.setIntensity(1);
  setPlaying(false);
  hideBanner();
  renderTitle();
  show('title');
  requestAnimationFrame(() => { renderer.resize(); startDemo(); });
  audio.startMusic(0);
}

function startRun(kind = runKind) {
  runKind = kind;
  audio.unlock();
  if (!save.seenHelp) {
    save.seenHelp = true;
    persist();
    returnTo = 'start';
    show('help');
    return;
  }
  hideScreens();
  screen = 'play';
  setPlaying(true);
  input.clear();
  save.stats.runs++;
  persist();
  requestAnimationFrame(() => {
    renderer.resize();
    if (runKind === 'adventure') {
      game.newRun({ adventure: adventureLevel(advLevel), upgrades: save.upgrades, ...gridFor() });
    } else if (runKind === 'daily') {
      // Daily runs are fair: Classic rules, no Orchard upgrades.
      syncDailyDay();
      save.daily.attempts++;
      persist();
      game.newRun({ mode: 'classic', upgrades: {}, seed: today().seed, daily: true, ...gridFor() });
    } else {
      game.newRun({ mode: save.mode, upgrades: save.upgrades, nemesis: save.nemesis, ...gridFor() });
    }
  });
}

function pause() {
  if (screen !== 'play') return;
  screen = 'paused';
  input.clear();
  syncToggles();
  show('pause');
}
function resume() {
  if (screen !== 'paused') return;
  hideScreens();
  screen = 'play';
  input.clear();
}

// ------------------------------------------------------------------ title
function renderTitle() {
  $('#title-stars').textContent = save.stars;
  const best = save.best[save.mode] || { score: 0, level: 0 };
  $('#title-best').textContent = best.level ? `Best: Lv ${best.level} · ${best.score.toLocaleString()}` : 'Best: —';
  const wrap = $('#modes');
  wrap.innerHTML = '';
  const coreOpen = (save.best.classic.level || 0) >= CORE_UNLOCK_LEVEL;
  for (const [id, m] of Object.entries(MODES)) {
    const locked = id === 'core' && !coreOpen;
    const b = document.createElement('button');
    b.className = 'mode' + (locked ? ' locked' : '');
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(save.mode === id));
    b.innerHTML = `<b>${locked ? '🔒 ' : ''}${m.name}</b><small>${locked ? `Reach level ${CORE_UNLOCK_LEVEL} in Classic` : m.desc}</small>`;
    b.addEventListener('click', () => {
      audio.unlock();
      if (locked) { audio.play('nope'); b.classList.remove('nope'); void b.offsetWidth; return; }
      save.mode = id;
      persist();
      audio.play('click');
      renderTitle();
    });
    wrap.appendChild(b);
  }
  if (save.mode === 'core' && !coreOpen) { save.mode = 'classic'; renderTitle(); }

  syncDailyDay();
  const t = today(), d = save.daily;
  $('#daily-title').textContent = `Daily Run #${t.num}`;
  $('#daily-streak').textContent = `\ud83d\udd25 ${d.streak}`;
  $('#daily-best').textContent = d.best ? `Today: Lv ${d.best.level} \u00b7 ${d.best.score.toLocaleString()}` : 'Not played today';
  $('#daily-sub').textContent = d.best ? `${d.attempts} ${d.attempts === 1 ? 'try' : 'tries'} \u00b7 beat your score!` : 'Same levels for everyone today';
  $('#btn-daily').classList.toggle('done', !!d.best);
  renderContracts();
  const next = Math.min(ADVENTURE_LEVELS, save.adventure.unlocked);
  $('#adv-sub').textContent = `Level ${next} \u00b7 \u2605 ${totalAdvStars()}/${ADVENTURE_LEVELS * 3}`;
  const w = $('#wanted');
  w.classList.toggle('hidden', !save.nemesis);
  if (save.nemesis) {
    const n = save.nemesis;
    w.innerHTML = `<span class="w-skull">\u2620</span><span class="w-text"><b>${nemesisName(n)}</b><small>${'\u2605'.repeat(n.rank)} \u00b7 ate you ${n.wins}\u00d7 \u00b7 lurking somewhere in levels 3\u20136</small></span><span class="w-bounty">${nemesisBounty(n)}\u2605<small>bounty</small></span>`;
  }
}

// ------------------------------------------------------------------ adventure map
const MAP_ROW = 84;
function openMap() {
  screen = 'map';
  audio.setIntensity(1);
  setPlaying(false);
  hideBanner();
  renderMap();
  show('map');
  if (game.state !== 'idle' && !game.demo) requestAnimationFrame(() => { renderer.resize(); startDemo(); });
  // Scroll so the next level to play is in view.
  requestAnimationFrame(() => {
    const cur = $('#map-scroll .node.current') || $('#map-scroll .node');
    if (cur) cur.scrollIntoView({ block: 'center' });
  });
}

function renderMap() {
  const A = save.adventure;
  $('#map-stars').textContent = totalAdvStars();
  const wrap = $('#map-scroll');
  wrap.innerHTML = '';
  for (let w = 0; w < ADVENTURE_LEVELS / LEVELS_PER_WORLD; w++) {
    const W = WORLDS[w];
    const first = w * LEVELS_PER_WORLD + 1;
    let wStars = 0;
    for (let i = 0; i < LEVELS_PER_WORLD; i++) wStars += A.stars[first + i] || 0;
    const sec = document.createElement('section');
    sec.className = 'map-world' + (W.dark ? ' dark' : '') + (first > A.unlocked ? ' locked' : '');
    sec.style.background = `linear-gradient(${W.bg[0]}, ${W.bg[1]})`;
    const h = LEVELS_PER_WORLD * MAP_ROW;
    const pts = [];
    let nodes = '';
    for (let i = 0; i < LEVELS_PER_WORLD; i++) {
      const n = first + i;
      const x = 50 + 30 * Math.sin(n * 0.85), y = i * MAP_ROW + MAP_ROW / 2;
      pts.push(`${x},${y}`);
      const d = adventureLevel(n);
      const st = A.stars[n] || 0;
      const cls = ['node', d.boss ? 'boss' : '', n > A.unlocked ? 'locked' : '', n === A.unlocked ? 'current' : '', st ? 'done' : ''].join(' ');
      nodes += `<button class="${cls}" data-level="${n}" style="left:${x}%;top:${y}px" aria-label="Level ${n}${n > A.unlocked ? ' (locked)' : ''}">
        ${d.boss ? '<span class="crown">\ud83d\udc51</span>' : ''}<b>${n > A.unlocked ? '\ud83d\udd12' : n}</b>
        <span class="nstars">${st ? starStr(st) : n <= A.unlocked ? OBJECTIVE_ICON[d.objective.type] : ''}</span>
        ${n === A.unlocked ? '<span class="you">\ud83c\udf4e</span>' : ''}</button>`;
    }
    sec.innerHTML = `<div class="mw-head"><b>World ${w + 1} \u00b7 ${W.name}</b><small>\u2605 ${wStars}/${LEVELS_PER_WORLD * 3}</small></div>
      <div class="mw-path" style="height:${h}px">
        <svg viewBox="0 0 100 ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts.join(' ')}" /></svg>
        ${nodes}
      </div>`;
    wrap.appendChild(sec);
  }
}

function openLevelCard(n) {
  advLevel = n;
  const d = adventureLevel(n), A = save.adventure;
  $('#lc-world').textContent = `World ${d.world + 1} \u00b7 ${WORLDS[d.world].name}`;
  $('#lc-title').textContent = (d.boss ? '\ud83d\udc51 Boss \u00b7 ' : '') + `Level ${n}`;
  $('#lc-name').textContent = d.name;
  $('#lc-goal').innerHTML = `${OBJECTIVE_ICON[d.objective.type]} <b>${objectiveText(d.objective)}</b>${d.objective.type !== 'crash' ? '<small>or crash every snake</small>' : ''}`;
  const ev = EVENTS[d.event];
  $('#lc-meta').innerHTML = `<span>\ud83d\udc0d ${d.snakes} snake${d.snakes > 1 ? 's' : ''}</span>${ev && d.event !== 'golden' ? `<span>${ev.icon} ${ev.name}</span>` : ''}<span>Difficulty ${'\u25cf'.repeat(Math.min(5, Math.ceil(d.diff / 3.2)))}${'\u25cb'.repeat(5 - Math.min(5, Math.ceil(d.diff / 3.2)))}</span>`;
  const st = A.stars[n] || 0;
  $('#lc-stars').innerHTML = st ? `<span class="big-stars">${starStr(st)}</span><small>Best ${(A.best[n] || 0).toLocaleString()} pts \u00b7 3\u2605 = clear it without a bite</small>` : '<small>3\u2605 = clear it without a bite</small>';
  show('level');
}

function showResult(g) {
  screen = 'result';
  hideBanner();
  input.clear();
  audio.setIntensity(1);
  const n = g.adventure.n, A = save.adventure;
  const stars = starsFor(g.levelBites);
  const score = Math.floor(g.score);
  const firstClear = !A.stars[n];
  const improved = stars > (A.stars[n] || 0);
  A.stars[n] = Math.max(A.stars[n] || 0, stars);
  A.best[n] = Math.max(A.best[n] || 0, score);
  const unlockedNew = n === A.unlocked && n < ADVENTURE_LEVELS;
  if (unlockedNew) A.unlocked = n + 1;
  persist(true);
  $('#res-stars').innerHTML = [0, 1, 2].map(i => `<span class="rs ${i < stars ? 'on' : ''}" style="animation-delay:${0.15 + i * 0.25}s">\u2605</span>`).join('');
  $('#res-title').textContent = g.adventure.boss ? `Boss beaten! Level ${n}` : `Level ${n} complete!`;
  const gr = g.lastGrade || 'C';
  $('#res-detail').innerHTML = `<span>${OBJECTIVE_ICON[g.objective.type]} ${objectiveText(g.objective)}</span><span>\ud83c\udf4e ${g.levelBites ? g.levelBites + ' bite' + (g.levelBites > 1 ? 's' : '') : 'no bites'}</span><span>grade ${gr}</span>` + (improved && !firstClear ? '<span>new best stars!</span>' : '');
  $('#res-stats').innerHTML = `
    <div class="stat"><b>${score.toLocaleString()}</b><small>Score</small></div>
    <div class="stat"><b>\u2605 ${g.starsRun}</b><small>Stars earned</small></div>
    <div class="stat"><b>\u00d7${(1 + 0.25 * g.nerveBest).toFixed(2).replace(/\.?0+$/, '')}</b><small>Best nerve</small></div>`;
  const un = $('#res-unlock');
  const nextWorld = unlockedNew && n % LEVELS_PER_WORLD === 0;
  un.classList.toggle('hidden', !nextWorld);
  if (nextWorld) un.textContent = `\ud83c\udf0d New world unlocked: ${WORLDS[Math.floor(n / LEVELS_PER_WORLD)].name}!`;
  $('#res-next').classList.toggle('hidden', n >= ADVENTURE_LEVELS);
  lastRun = { adv: n, stars, level: n, score, grades: g.grades.slice(), nerve: g.nerveBest, kills: { ...g.kills }, mode: 'classic' };
  if (stars === 3) audio.play('grade');
  show('result');
}

// ------------------------------------------------------------------ daily contracts
function contracts() {
  const t = today();
  if (!save.contracts || save.contracts.day !== t.key) {
    const rnd = mulberry32(t.seed * 7 + 3);
    const items = [0, 1, 2].map(tier => {
      const pool = CONTRACTS.filter(c => c.tier === tier);
      const c = pool[Math.floor(rnd() * pool.length)];
      return { id: c.id, target: c.n[Math.floor(rnd() * c.n.length)], progress: 0, done: false };
    });
    save.contracts = { day: t.key, items, bonus: false };
    persist();
  }
  return save.contracts;
}

function contractProgress(id, value, max = false) {
  const cs = contracts();
  for (const [i, it] of cs.items.entries()) {
    if (it.id !== id || it.done) continue;
    it.progress = max ? Math.max(it.progress, value) : it.progress + value;
    if (it.progress >= it.target) {
      it.progress = it.target;
      it.done = true;
      const reward = CONTRACT_REWARD[i];
      save.stars += reward;
      save.stats.starsEarned += reward;
      const c = CONTRACTS.find(x => x.id === it.id);
      toast(`\u2705 Contract done: ${c.text(it.target)} +${reward}\u2605`);
      audio.play('grade');
      buzz([20, 30, 20]);
    }
  }
  if (!cs.bonus && cs.items.every(it => it.done)) {
    cs.bonus = true;
    save.stars += CONTRACT_BONUS;
    save.stats.starsEarned += CONTRACT_BONUS;
    setTimeout(() => toast(`\ud83c\udf81 All 3 contracts done! +${CONTRACT_BONUS}\u2605 bonus`), 2400);
  }
  persist();
}

// Contracts start collapsed on small screens so the title screen fits.
let contractsOpen = !matchMedia('(max-width: 640px)').matches;
function renderContracts() {
  const cs = contracts();
  const done = cs.items.filter(it => it.done).length;
  const el = $('#contracts');
  el.classList.toggle('open', contractsOpen);
  el.innerHTML = `<button class="c-head" aria-expanded="${contractsOpen}"><b>Today\u2019s contracts</b><small>${done}/3 done${cs.bonus ? ' \u00b7 bonus claimed' : ` \u00b7 all 3: +${CONTRACT_BONUS}\u2605`} <span class="c-caret">\u25be</span></small></button>` +
    cs.items.map((it, i) => {
      const c = CONTRACTS.find(x => x.id === it.id);
      const pct = Math.round(it.progress / it.target * 100);
      return `<div class="contract${it.done ? ' done' : ''}"><span class="ct-icon">${it.done ? '\u2705' : c.icon}</span><span class="ct-text">${c.text(it.target)}<i style="--p:${pct}%"></i></span><span class="ct-reward">${it.done ? 'done' : `${it.progress}/${it.target} \u00b7 +${CONTRACT_REWARD[i]}\u2605`}</span></div>`;
    }).join('');
}

let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

function syncToggles() {
  for (const id of ['#tgl-music', '#tgl-music2']) $(id).setAttribute('aria-pressed', String(save.settings.music));
  for (const id of ['#tgl-sfx', '#tgl-sfx2']) $(id).setAttribute('aria-pressed', String(save.settings.sfx));
  $('#tgl-haptics').setAttribute('aria-pressed', String(save.settings.haptics));
  for (const b of $$('[data-controls]')) b.textContent = save.settings.controls === 'swipe' ? '\u261d\ufe0f Swipe' : '\ud83d\udd79\ufe0f Joystick';
  input.touchMode = save.settings.controls;
  audio.setMusic(save.settings.music);
  audio.setSfx(save.settings.sfx);
}

// ------------------------------------------------------------------ orchard
function renderOrchard() {
  $('#orchard-stars').textContent = save.stars;
  const ug = $('#orchard-upgrades');
  ug.innerHTML = '';
  for (const u of UPGRADES) {
    const lvl = save.upgrades[u.id] || 0;
    const maxed = lvl >= u.costs.length;
    const cost = maxed ? 0 : u.costs[lvl];
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="c-top"><span class="c-icon">${u.icon}</span><span class="c-name">${u.name}</span></div>
      <div class="c-desc">${u.desc}</div>
      <div class="pips">${u.costs.map((_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div>`;
    const btn = document.createElement('button');
    btn.className = 'btn ' + (maxed ? 'btn-blue' : 'btn-green');
    btn.textContent = maxed ? 'Maxed!' : `★ ${cost}`;
    btn.disabled = maxed || save.stars < cost;
    btn.addEventListener('click', () => {
      if (save.stars < cost || maxed) return;
      save.stars -= cost;
      save.upgrades[u.id] = lvl + 1;
      persist(true);
      audio.play('buy');
      renderOrchard();
    });
    card.appendChild(btn);
    ug.appendChild(card);
  }

  const sk = $('#orchard-skins');
  sk.innerHTML = '';
  for (const s of SKINS) {
    const owned = save.skins.includes(s.id);
    const equipped = save.skin === s.id;
    const card = document.createElement('div');
    card.className = 'card skin' + (equipped ? ' equipped' : '');
    const c = document.createElement('canvas');
    c.width = 168; c.height = 168;
    const cx = c.getContext('2d');
    drawApple(cx, 84, 92, 52, { skin: s, time: 0.4 });
    card.appendChild(c);
    const name = document.createElement('div');
    name.className = 'c-name';
    name.textContent = s.name;
    card.appendChild(name);
    const btn = document.createElement('button');
    btn.className = 'btn ' + (equipped ? 'btn-blue' : owned ? 'btn-green' : 'btn-red');
    btn.textContent = equipped ? 'Wearing' : owned ? 'Wear' : `★ ${s.cost}`;
    btn.disabled = equipped || (!owned && save.stars < s.cost);
    btn.addEventListener('click', () => {
      if (!owned) {
        if (save.stars < s.cost) return;
        save.stars -= s.cost;
        save.skins.push(s.id);
        audio.play('buy');
      } else audio.play('click');
      save.skin = s.id;
      persist(true);
      renderOrchard();
    });
    card.appendChild(btn);
    sk.appendChild(card);
  }
}

function openOrchard(from) {
  returnTo = from;
  renderOrchard();
  show('orchard');
}

// ------------------------------------------------------------------ HUD
const hud = {
  level: $('#hud-level'), world: $('#hud-world'), score: $('#hud-score'), stars: $('#hud-stars'),
  bites: $('#hud-bites'), thorn: $('#thorn-count'), hunger: $('#hud-hunger'),
  goal: $('#hud-goal'), nerve: $('#hud-nerve'), nerveX: $('#hud-nerve-x'), nerveBar: $('#hud-nerve-bar'), event: $('#hud-event'),
  ab: Object.fromEntries($$('.ability').map(b => [b.dataset.ab, b])),
  last: {},
};

function setOnce(key, value, fn) {
  if (hud.last[key] === value) return;
  hud.last[key] = value;
  fn(value);
}

function renderBites(cur, max) {
  hud.bites.innerHTML = '';
  for (let i = 0; i < max; i++) {
    const c = document.createElement('canvas');
    c.width = 60; c.height = 60;
    const x = c.getContext('2d');
    if (i < cur) drawApple(x, 30, 33, 21, { skin: skin(), face: false });
    else {
      x.globalAlpha = 0.25;
      drawApple(x, 30, 33, 21, { skin: { ...skin(), base: '#777', dark: '#444', light: '#bbb', leaf: '#777' }, face: false, bites: 3 });
    }
    hud.bites.appendChild(c);
  }
}

function updateHud() {
  if (screen !== 'play' && screen !== 'paused') return;
  const g = game, a = g.apple, st = g.stats;
  setOnce('level', g.level, v => { hud.level.textContent = 'Level ' + v; });
  setOnce('world', g.world, v => { hud.world.textContent = WORLDS[v].name; });
  setOnce('score', Math.floor(g.score), v => { hud.score.textContent = v.toLocaleString(); });
  setOnce('stars', save.stars, v => { hud.stars.textContent = v; });
  setOnce('bites', g.bites + '/' + st.maxBites + save.skin, () => renderBites(g.bites, st.maxBites));
  setOnce('thorn', g.thorns, v => { hud.thorn.textContent = v; });

  const cds = {
    dash: a.dashCd / st.dashCd,
    thorn: g.thorns > 0 ? 0 : 1 - g.thornRegenT / (st.thornRegen * g.ev.thornRegen),
    rot: g.rotUnlocked ? a.rotCd / (st.rotCd + st.rotDur) : 1,
    decoy: a.decoyCd / st.decoyCd,
  };
  for (const [k, btn] of Object.entries(hud.ab)) {
    const v = Math.max(0, Math.min(1, cds[k]));
    const q = Math.round(v * 60) / 60;
    setOnce('cd-' + k, q, val => {
      btn.style.setProperty('--cd', val);
      if (val === 0) { btn.classList.remove('flash'); void btn.offsetWidth; btn.classList.add('flash'); }
    });
  }
  setOnce('rotLock', g.rotUnlocked, v => hud.ab.rot.classList.toggle('locked', !v));
  setOnce('rotActive', a.rot > 0, v => hud.ab.rot.classList.toggle('active', v));
  setOnce('decoy', st.decoy, v => hud.ab.decoy.classList.toggle('hidden', !v));

  setOnce('nerve', g.nerve, n => {
    hud.nerveX.textContent = '\u00d7' + g.nerveMult.toFixed(2).replace(/\.?0+$/, '');
    hud.nerve.classList.toggle('on', n > 0);
    hud.nerve.classList.toggle('hot', n >= 6 && n < 12);
    hud.nerve.classList.toggle('blaze', n >= 12);
    if (n > 0) { hud.nerve.classList.remove('bump'); void hud.nerve.offsetWidth; hud.nerve.classList.add('bump'); }
  });
  setOnce('nerveT', Math.round(Math.max(0, g.nerveT) / 4 * 50), v => hud.nerve.style.setProperty('--t', g.nerve ? v / 50 : 0));
  setOnce('hunger', Math.round(g.hunger * 50), () => {
    const p = g.params;
    hud.hunger.style.setProperty('--t', (g.hunger - 1) / (p.hungerCap - 1));
    hud.hunger.classList.toggle('hungry', g.hungerStage === 1);
    hud.hunger.classList.toggle('frenzy', g.hungerStage === 2);
    audio.setIntensity(screen === 'play' ? g.hunger : 1);
  });
  const o = g.objective;
  let goal = '';
  if (g.adventure) {
    if (o.type === 'survive') goal = `\u23f1\ufe0f ${Math.max(0, Math.ceil(o.target - g.levelTime))}s left`;
    else if (o.type === 'stars') goal = `\u2b50 ${o.progress}/${o.target}`;
    else if (o.type === 'golden') goal = '\ud83d\udc51 Crash the golden snake';
    else goal = `\ud83d\udca5 ${g.snakes.filter(s => s.dead).length}/${g.snakes.length} crashed`;
  }
  setOnce('goal', goal, v => { hud.goal.textContent = v; hud.goal.classList.toggle('hidden', !v); hud.goal.classList.toggle('urgent', o.type === 'survive' && o.target - g.levelTime < 6); });
  setOnce('event', g.event + '|' + g.level, () => {
    const ev = EVENTS[g.event];
    hud.event.classList.toggle('hidden', !ev && !g.daily);
    hud.event.textContent = [g.daily ? `Daily #${today().num}` : '', ev ? `${ev.icon} ${ev.name}` : ''].filter(Boolean).join(' \u00b7 ');
  });
}

// ------------------------------------------------------------------ banner
let bannerTimer = null;
function showBanner(g) {
  const p = g.params;
  $('#banner-level').textContent = (p.boss ? '👑 BOSS · ' : '') + 'Level ' + g.level;
  $('#banner-world').textContent = WORLDS[g.world].name;
  const foes = g.snakes.map(s => s.species.name);
  const foe = $('#banner-foe');
  foe.textContent = 'vs. ' + [...new Set(foes)].join(' & ');
  foe.classList.toggle('boss', p.boss);
  const nem = g.snakes.find(s => s.nemesis);
  if (nem) {
    foe.innerHTML = `\u2620 NEMESIS: <b>${nemesisName(nem.nemesis)}</b> ${'\u2605'.repeat(nem.nemesis.rank)}<br><small>Bounty ${nemesisBounty(nem.nemesis)}\u2605. It remembers you.</small>`;
    foe.classList.add('boss');
    audio.play('nemesis');
  }
  let tip = TIPS[g.level];
  if (!tip && g.level > 6) tip = GENERIC_TIPS[(g.level * 7) % GENERIC_TIPS.length];
  const ev = EVENTS[g.event];
  const be = $('#banner-event');
  be.classList.toggle('hidden', !ev);
  if (ev) be.innerHTML = `${ev.icon} ${ev.name}<small>${ev.desc}</small>`;
  if (ev && !TIPS[g.level]) tip = '';
  if (g.snakes.some(s => s.nemesis)) tip = '';
  if (g.adventure) {
    const d = g.adventure;
    $('#banner-level').textContent = (d.boss ? '\ud83d\udc51 BOSS \u00b7 ' : '') + `Level ${d.n} \u00b7 ${d.name}`;
    tip = `${OBJECTIVE_ICON[g.objective.type]} Goal: ${objectiveText(g.objective)}${g.objective.type !== 'crash' ? ' (or crash every snake)' : ''}.` + (TIPS[d.n] && d.n <= 6 ? ' ' + TIPS[d.n] : '');
  }
  $('#banner-tip').textContent = tip || '';
  $('#banner').classList.add('show');
  clearTimeout(bannerTimer);
}
function hideBanner(delay = 0) {
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => $('#banner').classList.remove('show'), delay);
}

// ------------------------------------------------------------------ engine events
function onEvent(name, data, g) {
  if (g.demo) return;
  switch (name) {
    case 'level':
      showBanner(g);
      // Give players time to read a tip before the snake starts moving.
      if ($('#banner-tip').textContent || g.event || g.snakes.some(s => s.nemesis)) g.countT = 4;
      if (!g.adventure) {
        contractProgress('level', g.level, true);
        contractProgress('deep', g.level, true);
      }
      audio.startMusic(g.world, g.params.boss);
      break;
    case 'go':
      input.taps.length = 0;
      hideBanner();
      break;
    case 'stars':
      save.stars += data;
      save.stats.starsEarned += data;
      persist();
      contractProgress('stars', data);
      break;
    case 'kill':
      save.stats.snakes++;
      buzz([25, 40, 25]);
      if (data.cause === 'wall' || data.cause === 'rock' || data.cause === 'hedge') contractProgress('walls', 1);
      if (data.cause === 'self') contractProgress('self', 1);
      if (data.cause === 'tangle') contractProgress('tangle', 1);
      if (data.cause === 'poison') contractProgress('poison', 1);
      if (data.cause === 'thorns' && data.lunging) contractProgress('lunge', 1);
      if (data.double) contractProgress('double', 1);
      break;
    case 'nemesis':
      save.nemesis = null;
      save.stats.nemesesBeaten++;
      persist(true);
      buzz([60, 40, 60, 40, 120]);
      break;
    case 'hunger':
      buzz(data === 2 ? [40, 30, 40, 30, 40] : 30);
      break;
    case 'hedge':
      buzz([90, 40, 90]);
      break;
    case 'bite':
      hud.bites.classList.remove('hit'); void hud.bites.offsetWidth; hud.bites.classList.add('hit');
      buzz([80, 50, 80]);
      break;
    case 'nerve':
      if (data > 0) {
        audio.playNear(data); buzz(12);
        contractProgress('close', 1);
        contractProgress('nerve', data, true);
      }
      break;
    case 'quake':
      buzz([120, 40, 60]);
      break;
    case 'scratch':
      buzz(30);
      contractProgress('scratch', 1);
      break;
    case 'bump':
      // In swipe mode the apple rolls until it hits something, then waits.
      if (input.touchMode === 'swipe' && input.joy) input.joy = null;
      break;
    case 'nope': {
      const b = hud.ab[data];
      if (b) { b.classList.remove('nope'); void b.offsetWidth; b.classList.add('nope'); }
      break;
    }
    case 'cleared':
      if (!g.levelBites) contractProgress('unbitten', 1);
      if (g.hungerStage === 2) contractProgress('frenzy', 1);
      if (g.lastGrade === 'S') contractProgress('grade', 1);
      if (g.adventure) showResult(g);
      else showPerks(g);
      break;
    case 'over':
      showGameOver(g);
      break;
  }
}

let perkChoices = [];
function showPerks(g) {
  screen = 'perks';
  hideBanner();
  input.clear();
  perkChoices = g.perkChoices(3);
  $('#perks-title').textContent = g.params.boss ? 'Boss beaten!' : `Level ${g.level} clear!`;
  const gr = g.lastGrade || 'C';
  const stamp = $('#grade-stamp');
  stamp.textContent = gr;
  stamp.className = 'grade-stamp ' + gr;
  stamp.style.setProperty('--g', GRADE_COLORS[gr]);
  const secs = Math.round(g.levelTime);
  $('#grade-detail').innerHTML = `<span>\u23f1 ${secs}s / par ${Math.round(g.par)}s</span><span>\ud83c\udf4e ${g.levelBites ? g.levelBites + ' bite' + (g.levelBites > 1 ? 's' : '') : 'no bites'}</span><span>\u26a1 nerve ${g.nervePeak}</span>` + (GRADE_STARS[gr] ? `<span>+${GRADE_STARS[gr]}\u2605 grade bonus</span>` : '');
  if (gr === 'S' || gr === 'A') audio.play('grade');
  $('#perks-sub').textContent = `Score ${Math.floor(g.score).toLocaleString()} · ★ ${g.starsRun} this run · +1 bite healed`;
  const wrap = $('#perk-cards');
  wrap.innerHTML = '';
  perkChoices.forEach((p, i) => {
    const c = document.createElement('button');
    c.className = 'card';
    c.innerHTML = `<span class="c-icon">${p.icon}</span><div><div class="c-name">${p.name}</div><div class="c-desc">${p.desc}</div><div class="c-key kbd-hint">press ${i + 1}</div></div>`;
    c.addEventListener('click', () => choosePerk(i));
    wrap.appendChild(c);
  });
  if (!perkChoices.length) {
    const c = document.createElement('button');
    c.className = 'btn btn-red';
    c.textContent = 'Next level';
    c.addEventListener('click', () => choosePerk(-1));
    wrap.appendChild(c);
  }
  show('perks');
}

function choosePerk(i) {
  if (screen !== 'perks') return;
  if (perkChoices[i]) game.applyPerk(perkChoices[i].id);
  audio.play('buy');
  hideScreens();
  screen = 'play';
  input.clear();
  game.nextLevel();
}

function showGameOver(g) {
  screen = 'over';
  audio.setIntensity(1);
  hideBanner();
  input.enabled = false;
  const score = Math.floor(g.score);
  let isBest = false;
  const dailyEl = $('#over-daily');
  dailyEl.classList.toggle('hidden', !g.daily);
  $('#btn-again').textContent = g.adventure ? 'Try again' : 'Play again';
  $('#btn-over-menu').textContent = g.adventure ? 'Map' : 'Menu';
  $('#over-title').textContent = g.adventure ? `Crunch! Eaten on level ${g.adventure.n}.` : 'Crunch! You got eaten.';
  if (g.daily) {
    syncDailyDay();
    const d = save.daily, t = today();
    isBest = !d.best || score > d.best.score;
    if (isBest) d.best = { score, level: g.level, grades: g.grades.join(''), nerve: g.nerveBest };
    let reward = 0;
    if (d.lastDay !== t.key) {
      d.streak = d.lastDay === today(-1).key ? d.streak + 1 : 1;
      d.lastDay = t.key;
      reward = 20 + Math.min(30, d.streak * 5);
      save.stars += reward;
      save.stats.starsEarned += reward;
    }
    dailyEl.textContent = `Daily #${t.num} \u00b7 \ud83d\udd25 ${d.streak}-day streak` + (reward ? ` \u00b7 +${reward}\u2605 daily reward` : ` \u00b7 best today ${d.best.score.toLocaleString()}`);
  } else if (g.adventure) {
    isBest = false;
  } else {
    const best = save.best[g.mode] || (save.best[g.mode] = { score: 0, level: 0 });
    isBest = score > best.score;
    if (isBest) best.score = score;
    best.level = Math.max(best.level, g.level);
  }
  // The snake that ate you holds a grudge.
  const nemEl = $('#over-nemesis');
  let nemMsg = '';
  if (!g.daily && g.eatenBy) {
    const by = g.eatenBy;
    if (by.nemesis && save.nemesis) {
      save.nemesis.rank = Math.min(5, save.nemesis.rank + 1);
      save.nemesis.wins++;
      nemMsg = `\u2620 ${by.first} got you again and is now <b>${nemesisName(save.nemesis)}</b>. Bounty: ${nemesisBounty(save.nemesis)}\u2605`;
    } else if (!save.nemesis) {
      save.nemesis = { species: by.species, first: by.first, rank: 1, wins: 1 };
      nemMsg = `\u2620 <b>${nemesisName(save.nemesis)}</b> ate you. It\u2019s your nemesis now, and it\u2019ll be back. Bounty: ${nemesisBounty(save.nemesis)}\u2605`;
    } else {
      nemMsg = `\u2620 Your nemesis <b>${nemesisName(save.nemesis)}</b> is still out there.`;
    }
  } else if (g.nemesisBeaten) {
    nemMsg = '\ud83c\udfc6 You beat your nemesis this run!';
  }
  nemEl.classList.toggle('hidden', !nemMsg);
  nemEl.innerHTML = nemMsg;
  persist(true);
  lastRun = { daily: g.daily, num: today().num, level: g.level, score, grades: g.grades.slice(), nerve: g.nerveBest, kills: { ...g.kills }, mode: g.mode };
  $('#over-grades').textContent = g.grades.map(x => GRADE_EMOJI[x]).join('');
  const k = g.kills;
  const snakes = Object.values(k).reduce((a, b) => a + b, 0);
  $('#over-stats').innerHTML = `
    <div class="stat"><b>${g.level}</b><small>Level</small></div>
    <div class="stat"><b>${score.toLocaleString()}</b><small>Score</small></div>
    <div class="stat"><b>★ ${g.starsRun}</b><small>Stars earned</small></div>
    <div class="stat"><b>${snakes}</b><small>Snakes beaten</small></div>
    <div class="stat"><b>${g.closeCalls}</b><small>Close calls</small></div>
    <div class="stat"><b>\u00d7${(1 + 0.25 * g.nerveBest).toFixed(2).replace(/\.?0+$/, '')}</b><small>Best nerve</small></div>`;
  $('#over-best').classList.toggle('hidden', !isBest);
  const c = $('#over-apple').getContext('2d');
  c.clearRect(0, 0, 140, 140);
  drawApple(c, 70, 78, 46, { skin: skin(), bites: 3, dead: true });
  show('over');
}

const GRADE_EMOJI = { S: '\ud83c\udf1f', A: '\ud83d\udfe9', B: '\ud83d\udfe6', C: '\ud83d\udfeb' };
let lastRun = null;

async function shareRun() {
  if (!lastRun) return;
  const r = lastRun;
  const snakes = Object.values(r.kills).reduce((a, b) => a + b, 0);
  const head = r.adv ? `\ud83c\udf4e The Apple \u00b7 Level ${r.adv} ${starStr(r.stars)}` : r.daily ? `\ud83c\udf4e The Apple \u00b7 Daily #${r.num}` : `\ud83c\udf4e The Apple \u00b7 ${MODES[r.mode].name}`;
  const text = [
    head,
    r.adv ? `${r.score.toLocaleString()} pts` : `Level ${r.level} \u00b7 ${r.score.toLocaleString()} pts`,
    r.grades.map(x => GRADE_EMOJI[x]).join('') || '\u2014',
    `\ud83d\udc0d\ud83d\udca5 ${snakes} \u00b7 \u26a1 nerve \u00d7${(1 + 0.25 * r.nerve).toFixed(2).replace(/\.?0+$/, '')}`,
    'Can you beat it? mattlavergne.com/apple',
  ].join('\n');
  try {
    if (navigator.share && isTouch) { await navigator.share({ text }); return; }
    await navigator.clipboard.writeText(text);
    toast('Result copied! Paste it anywhere.');
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    toast('Couldn\u2019t copy. Your browser blocked it.');
  }
}

// ------------------------------------------------------------------ wiring
$('#btn-play').addEventListener('click', () => { audio.unlock(); audio.play('click'); openMap(); });
$('#btn-endless').addEventListener('click', () => { audio.unlock(); audio.play('click'); returnTo = 'title'; renderTitle(); show('endless'); });
$('#btn-endless-go').addEventListener('click', () => { audio.play('click'); startRun('normal'); });
$('#map-back').addEventListener('click', () => { audio.play('click'); goTitle(); });
$('#map-scroll').addEventListener('click', e => {
  const b = e.target.closest('.node');
  if (!b) return;
  const n = +b.dataset.level;
  if (n > save.adventure.unlocked) { audio.play('nope'); toast('Beat the level before it to unlock this one.'); return; }
  audio.play('click');
  openLevelCard(n);
});
$('#lc-play').addEventListener('click', () => { audio.play('click'); startRun('adventure'); });
$('#lc-back').addEventListener('click', () => { audio.play('click'); show('map'); });
$('#res-next').addEventListener('click', () => { audio.play('click'); openLevelCard(Math.min(ADVENTURE_LEVELS, advLevel + 1)); });
$('#res-replay').addEventListener('click', () => { audio.play('click'); startRun('adventure'); });
$('#res-map').addEventListener('click', () => { audio.play('click'); openMap(); });
$('#res-share').addEventListener('click', () => shareRun());
$('#btn-daily').addEventListener('click', () => { audio.play('click'); startRun('daily'); });
$('#btn-share').addEventListener('click', () => shareRun());
$('#contracts').addEventListener('click', e => {
  if (!e.target.closest('.c-head')) return;
  contractsOpen = !contractsOpen;
  audio.play('click');
  renderContracts();
});
$('#tgl-haptics').addEventListener('click', () => {
  save.settings.haptics = !save.settings.haptics;
  persist(); syncToggles();
  buzz(30);
});
for (const b of $$('[data-controls]')) b.addEventListener('click', () => {
  save.settings.controls = save.settings.controls === 'swipe' ? 'joystick' : 'swipe';
  persist(); syncToggles();
  toast(save.settings.controls === 'swipe' ? 'Swipe to roll, tap to stop.' : 'Hold and drag to steer.');
});
$('#btn-orchard').addEventListener('click', () => { audio.unlock(); audio.play('click'); openOrchard('title'); });
$('#btn-help').addEventListener('click', () => { audio.unlock(); audio.play('click'); returnTo = 'title'; show('help'); });
$$('[data-back]').forEach(b => b.addEventListener('click', () => {
  audio.play('click');
  if (returnTo === 'start') { returnTo = 'title'; startRun(); }
  else if (returnTo === 'over') show('over');
  else { renderTitle(); show('title'); }
}));
$$('.tab').forEach(t => t.addEventListener('click', () => {
  $$('.tab').forEach(x => x.classList.toggle('active', x === t));
  $('#orchard-upgrades').classList.toggle('hidden', t.dataset.tab !== 'upgrades');
  $('#orchard-skins').classList.toggle('hidden', t.dataset.tab !== 'skins');
  audio.play('click');
}));
$('#btn-pause').addEventListener('click', () => pause());
$('#btn-resume').addEventListener('click', () => resume());
$('#btn-restart').addEventListener('click', () => { startRun(); });
$('#btn-quit').addEventListener('click', () => (runKind === 'adventure' ? openMap() : goTitle()));
$('#btn-again').addEventListener('click', () => startRun());
$('#btn-over-orchard').addEventListener('click', () => openOrchard('over'));
$('#btn-over-menu').addEventListener('click', () => (runKind === 'adventure' ? openMap() : goTitle()));

for (const id of ['#tgl-music', '#tgl-music2']) $(id).addEventListener('click', () => {
  audio.unlock();
  save.settings.music = !save.settings.music;
  persist(); syncToggles();
});
for (const id of ['#tgl-sfx', '#tgl-sfx2']) $(id).addEventListener('click', () => {
  audio.unlock();
  save.settings.sfx = !save.settings.sfx;
  persist(); syncToggles();
});

for (const btn of $$('.ability')) {
  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (screen === 'play') input.actions.push(btn.dataset.ab);
  });
}

input.onMeta = (what, e) => {
  if (what !== 'pause') return;
  if (screen === 'play') { e.preventDefault(); pause(); }
  else if (screen === 'paused') { e.preventDefault(); resume(); }
};
input.attachTouch($('#stage'), $('#joy'));

window.addEventListener('keydown', e => {
  if (screen === 'perks' && ['Digit1', 'Digit2', 'Digit3'].includes(e.code)) {
    choosePerk(+e.code.slice(5) - 1);
  } else if (screen === 'title' && (e.code === 'Enter') && $('#screen-title').classList.contains('show')) {
    openMap();
  }
});
// First interaction anywhere unlocks audio (browsers require a gesture).
window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
window.addEventListener('keydown', () => audio.unlock(), { once: true });

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { pause(); persist(true); }
});
window.addEventListener('pagehide', () => persist(true));

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    renderer.resize();
    if (screen === 'title') {
      const g = gridFor();
      if (g.cols !== game.cols) startDemo();
    }
  }, 120);
});

// ------------------------------------------------------------------ main loop
const logo = $('#logo-apple').getContext('2d');
let last = performance.now();
let lastError = 0;
function frame(now) {
  // Schedule first: one bad frame must never freeze the game.
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  try {
    if (screen !== 'paused') game.update(dt, screen === 'play' ? input : null);
    if (game.state !== 'idle') renderer.draw(game, skin());
    updateHud();
  } catch (e) {
    if (now - lastError > 5000) { lastError = now; console.error(e); }
  }
  if (screen === 'title') {
    logo.clearRect(0, 0, 180, 180);
    const bob = Math.sin(now / 400) * 4;
    drawApple(logo, 90, 100 + bob, 58, { skin: skin(), time: now / 1000, look: { x: Math.sin(now / 900), y: 0.3 }, blink: Math.sin(now / 700) > 0.97 });
  }
}

// ?debug exposes the game for testing, e.g. __game.level = 12; __game.startLevel()
if (new URLSearchParams(location.search).has('debug')) window.__game = game;

// Offline play + installable app. Skipped on file:// and plain-http hosts.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

syncToggles();
renderer.resize();
goTitle();
requestAnimationFrame(frame);
