// Wires the engine, renderer, audio and DOM screens together.
import { Game } from './engine.js';
import { Renderer, drawApple } from './render.js';
import * as audio from './audio.js';
import { Input } from './input.js';
import { load, store } from './save.js';
import {
  WORLDS, MODES, UPGRADES, SKINS, TIPS, GENERIC_TIPS, CORE_UNLOCK_LEVEL,
} from './config.js';

const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];

const save = load();
const canvas = $('#game');
const renderer = new Renderer(canvas);
const input = new Input();
const skin = () => SKINS.find(s => s.id === save.skin) || SKINS[0];

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
  setPlaying(false);
  hideBanner();
  renderTitle();
  show('title');
  requestAnimationFrame(() => { renderer.resize(); startDemo(); });
  audio.startMusic(0);
}

function startRun() {
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
    game.newRun({ mode: save.mode, upgrades: save.upgrades, ...gridFor() });
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
}

function syncToggles() {
  for (const id of ['#tgl-music', '#tgl-music2']) $(id).setAttribute('aria-pressed', String(save.settings.music));
  for (const id of ['#tgl-sfx', '#tgl-sfx2']) $(id).setAttribute('aria-pressed', String(save.settings.sfx));
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
  bites: $('#hud-bites'), thorn: $('#thorn-count'),
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
    thorn: g.thorns > 0 ? 0 : 1 - g.thornRegenT / st.thornRegen,
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
  let tip = TIPS[g.level];
  if (!tip && g.level > 6) tip = GENERIC_TIPS[(g.level * 7) % GENERIC_TIPS.length];
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
      if ($('#banner-tip').textContent) g.countT = 4;
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
      break;
    case 'kill':
      save.stats.snakes++;
      break;
    case 'bite':
      hud.bites.classList.remove('hit'); void hud.bites.offsetWidth; hud.bites.classList.add('hit');
      break;
    case 'nope': {
      const b = hud.ab[data];
      if (b) { b.classList.remove('nope'); void b.offsetWidth; b.classList.add('nope'); }
      break;
    }
    case 'cleared':
      showPerks(g);
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
  hideBanner();
  input.enabled = false;
  const best = save.best[g.mode] || (save.best[g.mode] = { score: 0, level: 0 });
  const score = Math.floor(g.score);
  const isBest = score > best.score;
  if (isBest) best.score = score;
  best.level = Math.max(best.level, g.level);
  persist(true);
  const k = g.kills;
  const snakes = Object.values(k).reduce((a, b) => a + b, 0);
  $('#over-stats').innerHTML = `
    <div class="stat"><b>${g.level}</b><small>Level</small></div>
    <div class="stat"><b>${score.toLocaleString()}</b><small>Score</small></div>
    <div class="stat"><b>★ ${g.starsRun}</b><small>Stars earned</small></div>
    <div class="stat"><b>${snakes}</b><small>Snakes beaten</small></div>
    <div class="stat"><b>${k.poison}</b><small>Poisoned</small></div>
    <div class="stat"><b>${k.thorns}</b><small>Thorned</small></div>`;
  $('#over-best').classList.toggle('hidden', !isBest);
  const c = $('#over-apple').getContext('2d');
  c.clearRect(0, 0, 140, 140);
  drawApple(c, 70, 78, 46, { skin: skin(), bites: 3, dead: true });
  show('over');
}

// ------------------------------------------------------------------ wiring
$('#btn-play').addEventListener('click', () => { audio.play('click'); startRun(); });
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
$('#btn-quit').addEventListener('click', () => goTitle());
$('#btn-again').addEventListener('click', () => startRun());
$('#btn-over-orchard').addEventListener('click', () => openOrchard('over'));
$('#btn-over-menu').addEventListener('click', () => goTitle());

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
input.attachJoystick($('#stage'), $('#joy'));

window.addEventListener('keydown', e => {
  if (screen === 'perks' && ['Digit1', 'Digit2', 'Digit3'].includes(e.code)) {
    choosePerk(+e.code.slice(5) - 1);
  } else if (screen === 'title' && (e.code === 'Enter') && $('#screen-title').classList.contains('show')) {
    startRun();
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
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (screen !== 'paused') game.update(dt, screen === 'play' ? input : null);
  if (game.state !== 'idle') renderer.draw(game, skin());
  updateHud();
  if (screen === 'title') {
    logo.clearRect(0, 0, 180, 180);
    const bob = Math.sin(now / 400) * 4;
    drawApple(logo, 90, 100 + bob, 58, { skin: skin(), time: now / 1000, look: { x: Math.sin(now / 900), y: 0.3 }, blink: Math.sin(now / 700) > 0.97 });
  }
  requestAnimationFrame(frame);
}

// ?debug exposes the game for testing, e.g. __game.level = 12; __game.startLevel()
if (new URLSearchParams(location.search).has('debug')) window.__game = game;

syncToggles();
renderer.resize();
goTitle();
requestAnimationFrame(frame);
