// ---------------------------------------------------------------------------
// Player progression: how far you've got and how much loot you've banked.
// Purely local (localStorage) and purely cosmetic in effect — it only decides
// which skins are unlocked, so there's nothing here worth cheating for.
// ---------------------------------------------------------------------------

export interface Progress {
  /** Highest level reached across all runs (1-based). */
  bestLevel: number;
  /** Loot cash banked across all runs, spendable on skins. */
  bank: number;
  /** Skin ids bought with banked cash. */
  purchased: string[];
}

/** Dollars banked per loot item picked up. */
export const CASH_PER_LOOT = 50;

const KEY = "cith.progress";
const DEFAULT: Progress = { bestLevel: 1, bank: 0, purchased: [] };

type Listener = (p: Progress) => void;
const listeners = new Set<Listener>();

function read(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Progress>;
      return {
        bestLevel: Math.max(1, Math.floor(Number(p.bestLevel) || 1)),
        bank: Math.max(0, Math.floor(Number(p.bank) || 0)),
        purchased: Array.isArray(p.purchased) ? p.purchased.filter((s) => typeof s === "string") : []
      };
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT };
}

let cache: Progress = typeof window === "undefined" ? { ...DEFAULT } : read();

function write(next: Progress) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  for (const l of listeners) l(cache);
}

export function getProgress(): Progress {
  return cache;
}

export function subscribeProgress(fn: Listener): () => void {
  listeners.add(fn);
  fn(cache);
  return () => listeners.delete(fn);
}

/** Record the end of a run: bank the loot and remember the deepest level. */
export function recordRun(lootCollected: number, levelReached: number) {
  const earned = Math.max(0, Math.floor(lootCollected)) * CASH_PER_LOOT;
  write({
    ...cache,
    bank: cache.bank + earned,
    bestLevel: Math.max(cache.bestLevel, Math.floor(levelReached) || 1)
  });
}

/** Spend banked cash on a skin. Returns false when it can't be afforded. */
export function purchaseSkin(id: string, cost: number): boolean {
  if (cache.purchased.includes(id)) return true;
  if (cache.bank < cost) return false;
  write({ ...cache, bank: cache.bank - cost, purchased: [...cache.purchased, id] });
  return true;
}

/** Testing/dev helper — wipes all progression. */
export function resetProgress() {
  write({ ...DEFAULT });
}
