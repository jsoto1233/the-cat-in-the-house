// ---------------------------------------------------------------------------
// Character customisation. Purely cosmetic: a skin never changes speed, size,
// hitbox or any gameplay value, so it can't be used to gain an advantage.
// The choice is stored locally and applied to the player sprite on spawn.
// ---------------------------------------------------------------------------

export type SkinPattern = "solid" | "stripe" | "spots" | "mask";
export type SkinAccessory = "none" | "cap" | "horns" | "halo" | "ears";

export interface Skin {
  id: string;
  name: string;
  pattern: SkinPattern;
  accessory: SkinAccessory;
}

/** The base colours a player can tint their robber. */
export const SKIN_COLORS: { id: string; name: string; value: number }[] = [
  { id: "blue", name: "Blue", value: 0x4aa3df },
  { id: "green", name: "Green", value: 0x4adf7a },
  { id: "red", name: "Red", value: 0xdf4a4a },
  { id: "gold", name: "Gold", value: 0xdfae4a },
  { id: "purple", name: "Purple", value: 0xa96fe0 },
  { id: "cyan", name: "Cyan", value: 0x45d6d0 },
  { id: "pink", name: "Pink", value: 0xef73b5 },
  { id: "bone", name: "Bone", value: 0xd8d3c8 }
];

/** Pattern + accessory combinations, styled like a classic skin picker. */
export const SKINS: Skin[] = [
  { id: "classic", name: "Classic", pattern: "solid", accessory: "none" },
  { id: "bandit", name: "Bandit", pattern: "mask", accessory: "none" },
  { id: "striped", name: "Striped", pattern: "stripe", accessory: "none" },
  { id: "spotted", name: "Spotted", pattern: "spots", accessory: "none" },
  { id: "burglar", name: "Burglar", pattern: "mask", accessory: "cap" },
  { id: "capped", name: "Capped", pattern: "solid", accessory: "cap" },
  { id: "imp", name: "Imp", pattern: "solid", accessory: "horns" },
  { id: "saint", name: "Saint", pattern: "solid", accessory: "halo" },
  { id: "copycat", name: "Copycat", pattern: "stripe", accessory: "ears" },
  { id: "prowler", name: "Prowler", pattern: "spots", accessory: "ears" }
];

export interface SkinChoice {
  skinId: string;
  colorId: string;
}

const STORAGE_KEY = "cith.skin";
export const DEFAULT_CHOICE: SkinChoice = { skinId: "classic", colorId: "blue" };

export function loadSkinChoice(): SkinChoice {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SkinChoice>;
      const skinId = SKINS.some((s) => s.id === parsed.skinId)
        ? (parsed.skinId as string)
        : DEFAULT_CHOICE.skinId;
      const colorId = SKIN_COLORS.some((c) => c.id === parsed.colorId)
        ? (parsed.colorId as string)
        : DEFAULT_CHOICE.colorId;
      return { skinId, colorId };
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

export function getSkinColor(id: string): number {
  return SKIN_COLORS.find((c) => c.id === id)?.value ?? SKIN_COLORS[0].value;
}

export function skinColorCss(id: string): string {
  return `#${getSkinColor(id).toString(16).padStart(6, "0")}`;
}
