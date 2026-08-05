import { getProgress } from "./progress";

// ---------------------------------------------------------------------------
// Character customisation. Purely cosmetic: a skin never changes speed, size or
// hitbox, so unlocking one can't give an advantage. Skins unlock by reaching a
// level or by spending loot cash banked from previous runs.
// ---------------------------------------------------------------------------

export type SkinPattern =
  | "solid"
  | "stripe"
  | "spots"
  | "mask"
  | "skull"
  | "panda"
  | "circuit";

export type SkinAccessory =
  | "none"
  | "cap"
  | "beanie"
  | "halo"
  | "ears"
  | "antenna"
  | "crown"
  | "sheet";

export type SkinUnlock =
  | { kind: "free" }
  | { kind: "level"; level: number }
  | { kind: "cash"; cost: number };

export interface Skin {
  id: string;
  name: string;
  pattern: SkinPattern;
  accessory: SkinAccessory;
  unlock: SkinUnlock;
  /** Overrides the chosen colour (e.g. the gold king is always gold). */
  tint?: number;
  /** Translucency, for the ghost. */
  alpha?: number;
  /** Glowing eye colour. */
  eyeGlow?: number;
  /** Adds an outer glow ring. */
  glow?: boolean;
}

export const SKINS: Skin[] = [
  // ---- Starter (free) ----
  { id: "classic", name: "Blue Bandit", pattern: "mask", accessory: "none", unlock: { kind: "free" }, tint: 0x4aa3df },
  { id: "neon", name: "Neon Blob", pattern: "solid", accessory: "none", unlock: { kind: "free" }, tint: 0x39e6c8, glow: true },
  { id: "copycat", name: "Copycat", pattern: "stripe", accessory: "ears", unlock: { kind: "free" }, tint: 0xe0913f },
  // ---- Level unlocks ----
  {
    id: "ghost",
    name: "Ghost Robber",
    pattern: "solid",
    accessory: "sheet",
    unlock: { kind: "level", level: 2 },
    tint: 0xd8dcea,
    alpha: 0.55
  },
  {
    id: "ninja",
    name: "Ninja",
    pattern: "mask",
    accessory: "none",
    unlock: { kind: "level", level: 3 },
    tint: 0x1b1b24,
    eyeGlow: 0xff6b6b
  },
  {
    id: "thief",
    name: "Street Thief",
    pattern: "mask",
    accessory: "beanie",
    unlock: { kind: "level", level: 4 },
    tint: 0x6b7a92
  },
  {
    id: "alien",
    name: "Alien Invader",
    pattern: "solid",
    accessory: "antenna",
    unlock: { kind: "level", level: 5 },
    tint: 0x5ce07a,
    glow: true
  },
  {
    id: "king",
    name: "Crown King",
    pattern: "solid",
    accessory: "crown",
    unlock: { kind: "level", level: 8 },
    tint: 0xf5c542,
    glow: true
  },
  // ---- Cash purchases ----
  {
    id: "cybercat",
    name: "Cybercat",
    pattern: "circuit",
    accessory: "ears",
    unlock: { kind: "cash", cost: 500 },
    tint: 0x22d3ee,
    eyeGlow: 0xfff27a,
    glow: true
  },
  {
    id: "skeleton",
    name: "Skeleton",
    pattern: "skull",
    accessory: "none",
    unlock: { kind: "cash", cost: 1000 },
    tint: 0xe6e2d8
  },
  {
    id: "panda",
    name: "Panda Thief",
    pattern: "panda",
    accessory: "ears",
    unlock: { kind: "cash", cost: 2500 },
    tint: 0xf2f2f4
  }
];

export interface SkinChoice {
  skinId: string;
}

const STORAGE_KEY = "cith.skin";
export const DEFAULT_CHOICE: SkinChoice = { skinId: "classic" };

export function loadSkinChoice(): SkinChoice {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SkinChoice>;
      const skinId = SKINS.some((s) => s.id === parsed.skinId)
        ? (parsed.skinId as string)
        : DEFAULT_CHOICE.skinId;
      // Never hand back a skin the player hasn't earned.
      return isUnlocked(getSkin(skinId)) ? { skinId } : { ...DEFAULT_CHOICE };
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_CHOICE };
}

export function saveSkinChoice(choice: SkinChoice) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(choice));
  } catch {
    /* ignore */
  }
}

export function getSkin(id: string): Skin {
  return SKINS.find((s) => s.id === id) ?? SKINS[0];
}

/** Each skin defines its own colour. */
export function resolveSkinColor(skin: Skin): number {
  return skin.tint ?? 0x4aa3df;
}

export function isUnlocked(skin: Skin): boolean {
  const p = getProgress();
  if (skin.unlock.kind === "free") return true;
  if (skin.unlock.kind === "level") return p.bestLevel >= skin.unlock.level;
  return p.purchased.includes(skin.id);
}

/** Human-readable unlock requirement, or null when already owned. */
export function unlockLabel(skin: Skin): string | null {
  if (isUnlocked(skin)) return null;
  if (skin.unlock.kind === "level") return `Reach level ${skin.unlock.level}`;
  if (skin.unlock.kind === "cash") return `$${skin.unlock.cost.toLocaleString()}`;
  return null;
}

/** 0..1 progress toward unlocking, for the progress bar. */
export function unlockProgress(skin: Skin): number {
  const p = getProgress();
  if (isUnlocked(skin)) return 1;
  if (skin.unlock.kind === "level") {
    return Math.min(1, p.bestLevel / skin.unlock.level);
  }
  if (skin.unlock.kind === "cash") {
    return Math.min(1, p.bank / skin.unlock.cost);
  }
  return 1;
}
