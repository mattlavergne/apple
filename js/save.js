// Persistent progress. platform.storage keeps it in localStorage on the web and
// also in native Preferences in the app. Every access is guarded: storage can
// be unavailable (private mode, blocked cookies) and the game must still work.
import { storage } from './platform.js';

export const KEY = 'the-apple.save.v1';
const BACKUPS = 'the-apple.save.backups';

const DEFAULT = () => ({
  stars: 0,
  upgrades: {},
  skins: ['red'],
  skin: 'red',
  mode: 'classic',
  best: { classic: { score: 0, level: 0 }, sprout: { score: 0, level: 0 }, core: { score: 0, level: 0 } },
  settings: { music: true, sfx: true },
  stats: { runs: 0, snakes: 0, starsEarned: 0 },
  seenHelp: false,
});

// Fills in anything missing (older saves, or a save from another device).
export function withDefaults(data) {
  const base = DEFAULT();
  if (!data || typeof data !== 'object' || Array.isArray(data)) return base;
  return {
    ...base, ...data,
    best: { ...base.best, ...(data.best || {}) },
    settings: { ...base.settings, ...(data.settings || {}) },
    stats: { ...base.stats, ...(data.stats || {}) },
    upgrades: { ...(data.upgrades || {}) },
    skins: Array.isArray(data.skins) && data.skins.length ? data.skins : base.skins,
  };
}

export function load() {
  let raw = null;
  try { raw = storage.get(KEY); } catch { /* storage unavailable */ }
  if (!raw) return DEFAULT();
  try {
    return withDefaults(JSON.parse(raw));
  } catch {
    // A damaged save is set aside, never overwritten, so it can be recovered.
    try { storage.set(`${KEY}.damaged-${Date.now()}`, raw); } catch { /* storage unavailable */ }
    return DEFAULT();
  }
}

// The save as currently stored (another tab may have written it), or null.
export function readStored() {
  try {
    const raw = storage.get(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function store(save) {
  try { storage.set(KEY, JSON.stringify(save)); } catch { /* storage unavailable */ }
}

// Keeps the last 10 saves that a merge replaced (newest first), in case a
// merge ever does something it shouldn't.
export function backup(data) {
  try {
    const list = JSON.parse(storage.get(BACKUPS) || '[]');
    list.unshift({ at: Date.now(), data });
    storage.set(BACKUPS, JSON.stringify(list.slice(0, 10)));
  } catch { /* storage unavailable */ }
}
