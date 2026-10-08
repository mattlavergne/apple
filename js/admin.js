// Test tools for the web copy of the game, which is the developer's private
// test site (mattlavergne.com/apple, locked with Cloudflare Access). Players
// never get this file: tools/build-www.mjs leaves it out of the app, and the
// game only loads it outside the app.
//
// Anything that changes progress works on a separate test save (its own
// storage keys, sync always off), so testing can't touch the real save on this
// browser or reach your other devices through sync. Each change is written
// straight to storage and the page reloads, so the game starts from exactly
// what was written.
import * as platform from './platform.js';
import { KEY as SAVE_KEY } from './save.js';
import { SKINS, UPGRADES } from './config.js';
import { ADVENTURE_LEVELS } from './levels.js';

const OWNED_KEY = 'the-apple.full';
const TEST_PREFIX = 'the-apple-test.';
let api, panel, button, msgTimer = null;

const CSS = `
#admin-btn { position: fixed; z-index: 900; left: calc(10px + env(safe-area-inset-left)); bottom: calc(10px + var(--ad-h, 0px) + env(safe-area-inset-bottom));
  width: 42px; height: 42px; border-radius: 50%; border: 2px solid #3a1f2b; background: #fffaf2; font-size: 20px; line-height: 1; cursor: pointer;
  box-shadow: 0 3px 0 #3a1f2b; }
#admin-btn[hidden], #admin-panel[hidden] { display: none; }
#admin-panel { position: fixed; z-index: 901; left: calc(10px + env(safe-area-inset-left)); bottom: calc(60px + var(--ad-h, 0px) + env(safe-area-inset-bottom));
  width: min(370px, calc(100vw - 20px)); max-height: calc(100dvh - 80px - var(--ad-h, 0px)); overflow: auto; box-sizing: border-box;
  background: #fffaf2; color: #3a1f2b; border: 3px solid #3a1f2b; border-radius: 16px; padding: 10px 14px 14px;
  font: 14px/1.4 "Fredoka", system-ui, sans-serif; box-shadow: 0 6px 0 rgba(58, 31, 43, 0.35); text-align: left; }
#admin-panel header { display: flex; align-items: center; justify-content: space-between; }
#admin-panel header b { font-size: 17px; }
#admin-panel h3 { margin: 12px 0 4px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; opacity: 0.65; }
#admin-panel button { font: inherit; padding: 5px 10px; margin: 3px 4px 3px 0; border: 2px solid #3a1f2b; border-radius: 10px; background: #fff; color: inherit; cursor: pointer; }
#admin-panel button.on { background: #3a1f2b; color: #fffaf2; }
#admin-panel button:disabled, #admin-panel input:disabled { opacity: 0.4; cursor: default; }
#admin-panel input { width: 60px; font: inherit; padding: 4px 6px; margin-right: 4px; border: 2px solid #3a1f2b; border-radius: 8px; }
#admin-panel .note { margin: 2px 0; font-size: 12px; opacity: 0.75; }
#admin-panel .msg { min-height: 1.2em; margin: 6px 0 0; color: #22679a; font-weight: 600; }
`;

const readSave = () => { try { return JSON.parse(platform.storage.get(SAVE_KEY)) || {}; } catch { return {}; } };
const testSave = () => !!platform.admin.testSave;
function fullGameMode() {
  if (!platform.storeSim) return 'web';
  return platform.storage.get(OWNED_KEY) === '1' ? 'bought' : 'free';
}

// Make a change, then start the game again from what's in storage.
function reloadWith(change) {
  api.stopSaving();
  change();
  location.reload();
}
// Edits the test save (never the real one).
function editTestSave(fn) {
  if (!testSave()) return;
  reloadWith(() => {
    const s = readSave();
    fn(s);
    s.updatedAt = Date.now();
    delete s.sync;
    platform.storage.set(SAVE_KEY, JSON.stringify(s));
  });
}
// Puts a save into the test save (a copy of the real one, or pasted JSON).
function loadIntoTestSave(data) {
  const s = { ...data };
  delete s.sync; // a copy must never sync with the real save's code
  reloadWith(() => {
    platform.setAdmin({ testSave: true });
    platform.storage.set(SAVE_KEY, JSON.stringify(s));
  });
}
function clearTestSave() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(TEST_PREFIX)) localStorage.removeItem(k);
    }
  } catch { /* storage blocked */ }
}

const ACTIONS = {
  // Save
  useTest: () => reloadWith(() => platform.setAdmin({ testSave: true })),
  useReal: () => reloadWith(() => platform.setAdmin({ testSave: false })),
  copyReal: () => {
    let real = null;
    try { real = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { /* damaged */ }
    if (!real) return say('There’s no real save on this browser to copy.');
    if (confirm('Replace the test save with a copy of your real save?\n\nYour real save isn’t changed.')) loadIntoTestSave(real);
  },
  freshTest: () => {
    if (confirm('Start the test save over from nothing?')) reloadWith(() => { clearTestSave(); platform.setAdmin({ testSave: true }); });
  },
  // Full game
  web: () => reloadWith(() => platform.setAdmin({ freeApp: false })),
  free: () => reloadWith(() => { platform.setAdmin({ freeApp: true }); platform.storage.remove(OWNED_KEY); }),
  bought: () => reloadWith(() => { platform.setAdmin({ freeApp: true }); platform.storage.set(OWNED_KEY, '1'); }),
  // Progress (test save only)
  unlockAll: () => editTestSave(s => { s.adventure = { stars: {}, best: {}, ...s.adventure, unlocked: ADVENTURE_LEVELS }; }),
  lockAll: () => editTestSave(s => { s.adventure = { unlocked: 1, stars: {}, best: {} }; }),
  unlockTo: () => {
    const n = Math.round(Number(panel.querySelector('#admin-upto').value));
    if (!(n >= 1 && n <= ADVENTURE_LEVELS)) return say(`Pick a level from 1 to ${ADVENTURE_LEVELS}.`);
    editTestSave(s => { s.adventure = { stars: {}, best: {}, ...s.adventure, unlocked: n }; });
  },
  stars: () => editTestSave(s => {
    const device = platform.storage.get('the-apple.device') || 'test';
    s.ledger ||= {};
    const mine = (s.ledger[device] ||= { e: 0, s: 0 });
    mine.e = (mine.e || 0) + 1000;
  }),
  skins: () => editTestSave(s => { s.skins = SKINS.map(k => k.id); }),
  upgrades: () => editTestSave(s => { s.upgrades = Object.fromEntries(UPGRADES.map(u => [u.id, u.costs.length])); }),
  daily: () => editTestSave(s => { s.daily = { ...(s.daily || {}), day: '', attempts: 0 }; delete s.contracts; }),
  help: () => editTestSave(s => { s.seenHelp = false; }),
  // Play (test save only)
  open: () => {
    const n = Math.round(Number(panel.querySelector('#admin-level').value));
    if (!(n >= 1 && n <= ADVENTURE_LEVELS)) return say(`Pick a level from 1 to ${ADVENTURE_LEVELS}.`);
    close();
    api.openLevel(n);
  },
  win: () => { close(); api.win(); },
  lose: () => { close(); api.lose(); },
  // Save data
  copyJson: async () => {
    try {
      await navigator.clipboard.writeText(platform.storage.get(SAVE_KEY) || '{}');
      say(`Copied the ${testSave() ? 'test' : 'real'} save.`);
    } catch { say('The browser blocked copying.'); }
  },
  pasteJson: () => {
    const text = prompt('Paste a save (JSON). It goes into the test save; your real save isn’t changed.');
    if (!text) return;
    let data = null;
    try { data = JSON.parse(text); } catch { /* not JSON */ }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return say('That isn’t a save.');
    loadIntoTestSave(data);
  },
};

function say(text) {
  const el = panel.querySelector('.msg');
  el.textContent = text;
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => { el.textContent = ''; }, 4000);
}

function render() {
  const test = testSave();
  const mode = fullGameMode();
  const playing = ['play', 'paused'].includes(api.getScreen());
  const s = readSave();
  const btn = (act, label, { on = false, off = false } = {}) =>
    `<button data-act="${act}"${on ? ' class="on"' : ''}${off ? ' disabled' : ''}>${label}</button>`;
  const needTest = !test;
  panel.innerHTML = `
    <header><b>🛠️ Test tools</b>${btn('close', '✕')}</header>
    <p class="note">This web copy is only for you. Players get the app, which has none of this.</p>

    <h3>Save in use</h3>
    ${btn('useReal', 'My real save', { on: !test })}${btn('useTest', 'Test save', { on: test })}
    <p class="note">${test
      ? 'Test save: separate from your progress and never synced. Change anything here.'
      : `Real save: your own progress${s.sync?.code ? ', synced with your devices' : ''}. Switch to the test save to change progress.`}</p>
    ${test ? btn('copyReal', 'Copy my real save in') + btn('freshTest', 'Start over') : ''}

    <h3>Full game</h3>
    ${btn('web', 'Everything unlocked', { on: mode === 'web' })}${btn('free', 'Free app', { on: mode === 'free' })}${btn('bought', 'Bought', { on: mode === 'bought' })}
    <p class="note">${mode === 'web' ? 'Like the web copy always was: all levels and Endless, no ads.'
      : mode === 'free' ? 'Like the free app: levels 1–20, pretend ads, and Unlock asks to pretend-buy.'
      : 'Like the app after buying the full game: everything, no ads. "Free app" locks it again.'}</p>

    <h3>Progress${needTest ? ' (test save)' : ''}</h3>
    ${btn('unlockAll', 'Unlock all levels', { off: needTest })}${btn('lockAll', 'Lock levels again', { off: needTest })}
    <div><input id="admin-upto" type="number" min="1" max="${ADVENTURE_LEVELS}" placeholder="21"${needTest ? ' disabled' : ''}>${btn('unlockTo', 'Unlock up to this level', { off: needTest })}</div>
    ${btn('stars', '+1,000 stars', { off: needTest })}${btn('skins', 'All skins', { off: needTest })}${btn('upgrades', 'Max upgrades', { off: needTest })}
    ${btn('daily', 'Reset today’s Daily Run', { off: needTest })}${btn('help', 'Show first-time help again', { off: needTest })}

    <h3>Play${needTest ? ' (test save)' : ''}</h3>
    <div><input id="admin-level" type="number" min="1" max="${ADVENTURE_LEVELS}" placeholder="47"${needTest ? ' disabled' : ''}>${btn('open', 'Open level', { off: needTest })}</div>
    ${btn('win', 'Win this level', { off: needTest || !playing })}${btn('lose', 'Lose this level', { off: needTest || !playing })}
    <p class="note">Win and Lose work while a level is paused.</p>

    <h3>Save data</h3>
    ${btn('copyJson', 'Copy save as JSON')}${btn('pasteJson', 'Load JSON into test save')}
    <p class="msg" role="status"></p>`;
}

function open() { render(); panel.hidden = false; }
function close() { panel.hidden = true; }

export function init(hooks) {
  api = hooks;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  button = document.createElement('button');
  button.id = 'admin-btn';
  button.title = 'Test tools';
  button.setAttribute('aria-label', 'Test tools');
  button.textContent = '🛠️';
  panel = document.createElement('div');
  panel.id = 'admin-panel';
  panel.hidden = true;
  document.body.append(button, panel);
  button.addEventListener('click', () => (panel.hidden ? open() : close()));
  panel.addEventListener('click', e => {
    const act = e.target.closest('button[data-act]')?.dataset.act;
    if (act === 'close') close();
    else if (act && ACTIONS[act]) ACTIONS[act]();
  });
  // Typing a level number must not steer the apple.
  panel.addEventListener('keydown', e => e.stopPropagation());
  // Out of the way while a level is being played; back when it's paused.
  setInterval(() => {
    const hide = api.getScreen() === 'play';
    button.hidden = hide;
    if (hide) close();
  }, 250);
}
