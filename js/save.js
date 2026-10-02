// Persistent progress in localStorage. Every access is guarded: storage can be
// unavailable (private mode, blocked cookies) and the game must still work.
const KEY = 'the-apple.save.v1';

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

export function load() {
  const base = DEFAULT();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const data = JSON.parse(raw);
    return {
      ...base, ...data,
      best: { ...base.best, ...(data.best || {}) },
      settings: { ...base.settings, ...(data.settings || {}) },
      stats: { ...base.stats, ...(data.stats || {}) },
      upgrades: { ...(data.upgrades || {}) },
      skins: Array.isArray(data.skins) && data.skins.length ? data.skins : base.skins,
    };
  } catch {
    return base;
  }
}

export function store(save) {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* storage unavailable */ }
}
