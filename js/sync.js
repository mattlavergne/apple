// Cloud sync: the same progress on every device, with no accounts.
// A device makes up a random sync code; any device that enters the code (or
// opens the sync link) shares the save. See src/apple-api.js in the
// landing-page repo for the server side.

// Inside mattlavergne.com the API is same-origin; elsewhere (GitHub Pages,
// local dev) call it on the main domain.
const apiBase = () => (globalThis.location?.hostname?.endsWith('mattlavergne.com') ? '/apple/api' : 'https://mattlavergne.com/apple/api');
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

export function newCode() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return [...bytes].map(b => ALPHABET[b % ALPHABET.length]).join('');
}
export const formatCode = c => (c || '').match(/.{1,4}/g)?.join('-') || '';
export function normalizeCode(s) {
  const c = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[A-HJ-NP-Z2-9]{12}$/.test(c) ? c : null;
}

export class SyncError extends Error {
  constructor(kind, msg) { super(msg); this.kind = kind; }
}

async function call(method, code, body, keepalive = false) {
  let res;
  try {
    res = await fetch(`${apiBase()}/save/${code}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      keepalive,
    });
  } catch {
    throw new SyncError('offline', 'You look offline. Progress will sync next time.');
  }
  if (res.status === 404 && method === 'GET') return null;
  if (res.status === 503) throw new SyncError('unconfigured', 'Cloud sync isn’t switched on on the server yet.');
  if (!res.ok) throw new SyncError('server', `Sync failed (${res.status}).`);
  return res.json();
}

export const pull = code => call('GET', code);
export const push = (code, data, updatedAt, keepalive) => call('PUT', code, { data, updatedAt }, keepalive);

// Combine two saves so progress never goes backwards: unlocked levels, best
// stars and scores, upgrades, skins and lifetime stats take the best of both.
// The star balance adds up per-device ledgers. Things that are chosen
// (equipped skin, settings, nemesis, today's daily) come from whichever save
// changed most recently.
export function mergeSaves(a, b) {
  if (!b) return a;
  if (!a) return b;
  const [newer, older] = (a.updatedAt || 0) >= (b.updatedAt || 0) ? [a, b] : [b, a];
  const out = JSON.parse(JSON.stringify(newer));
  const maxMap = (x = {}, y = {}) => {
    const r = { ...x };
    for (const [k, v] of Object.entries(y)) r[k] = Math.max(r[k] || 0, v || 0);
    return r;
  };

  const advA = newer.adventure || {}, advB = older.adventure || {};
  out.adventure = {
    ...advA,
    unlocked: Math.max(advA.unlocked || 1, advB.unlocked || 1),
    stars: maxMap(advA.stars, advB.stars),
    best: maxMap(advA.best, advB.best),
  };
  out.best = { ...(newer.best || {}) };
  for (const [mode, v] of Object.entries(older.best || {})) {
    const cur = out.best[mode] || { score: 0, level: 0 };
    out.best[mode] = { score: Math.max(cur.score || 0, v.score || 0), level: Math.max(cur.level || 0, v.level || 0) };
  }
  out.upgrades = maxMap(newer.upgrades, older.upgrades);
  // Star ledger: each device's earned/spent totals only ever grow, so take the
  // larger of each and the balance adds up across devices.
  out.ledger = { ...(newer.ledger || {}) };
  for (const [dev, l] of Object.entries(older.ledger || {})) {
    const cur = out.ledger[dev] || { e: 0, s: 0 };
    out.ledger[dev] = { e: Math.max(cur.e || 0, l.e || 0), s: Math.max(cur.s || 0, l.s || 0) };
  }
  out.stars = Object.values(out.ledger).reduce((t, l) => t + (l.e || 0) - (l.s || 0), 0);
  out.skins = [...new Set([...(newer.skins || []), ...(older.skins || [])])];
  out.stats = maxMap(newer.stats, older.stats);
  out.seenHelp = !!(newer.seenHelp || older.seenHelp);
  // Same day on both devices: keep the better daily result and contract progress.
  if (newer.daily && older.daily && newer.daily.day === older.daily.day) {
    const nb = newer.daily.best, ob = older.daily.best;
    out.daily.best = !nb ? ob : !ob ? nb : (ob.score > nb.score ? ob : nb);
    out.daily.attempts = Math.max(newer.daily.attempts || 0, older.daily.attempts || 0);
  }
  if (newer.contracts && older.contracts && newer.contracts.day === older.contracts.day) {
    out.contracts.items = newer.contracts.items.map((it, i) => {
      const o = older.contracts.items[i];
      return o && o.id === it.id ? { ...it, progress: Math.max(it.progress, o.progress), done: it.done || o.done } : it;
    });
    out.contracts.bonus = newer.contracts.bonus || older.contracts.bonus;
  }
  out.updatedAt = Math.max(a.updatedAt || 0, b.updatedAt || 0);
  return out;
}
