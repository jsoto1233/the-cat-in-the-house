import { CollisionMap } from "../CollisionMap";

export type PreviewMood = "calm" | "warning" | "aggressive";
export type PreviewDifficulty = "normal" | "ludicrous";

export interface PreviewState {
  cashFound: number;
  cashTotal: number;
  mood: PreviewMood;
  atticUnlocked: boolean;
  hasKey: boolean;
  lives: number;
  livesTotal: number;
  difficulty: PreviewDifficulty;
}

export type MatchOutcome = "escaped" | "caught" | "timeout";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Room extends Rect {
  key: string;
  name: string;
  isAttic?: boolean;
}

export type InteractableKind = "cabinet" | "box" | "chest";
export type InteractableContent = "key" | "cash" | "cash_x2" | null;

export interface InteractableDef {
  id: string;
  kind: InteractableKind;
  x: number;
  y: number;
  label: string;
  locked?: boolean;
  keyId?: string;
  contains: InteractableContent;
}

// ---------------------------------------------------------------------------
// Furniture / decoration. Purely a layer on top of the existing room + object
// model: it never changes loot, keys, chests, doors or the exit. Each piece is
// drawn by isoFurniture.spawnIsoFurniture and, when `solid` is true, its footprint
// (cx, cy centred; fw x fh) is baked into the floor's CollisionMap so BOTH the
// player (resolveMove) and the cat (A* findPath) treat it as a wall. Small decor
// (solid=false) is visual only and has no collision footprint.
// ---------------------------------------------------------------------------
export type FurnitureKind =
  | "couch"
  | "coffeeTable"
  | "tvStand"
  | "counter"
  | "stove"
  | "fridge"
  | "diningTable"
  | "bed"
  | "dresser"
  | "nightstand"
  | "bathtub"
  | "toilet"
  | "sink"
  | "shelving"
  | "sideTable"
  | "rug"
  | "wallArt"
  | "framedPictures"
  | "lamp"
  | "plant"
  | "mirror"
  | "coatRack"
  | "clutter"
  // --- outdoor pieces (levels 5-8, the chase outside) ---
  | "tree"
  | "bush"
  | "car"
  | "bench"
  | "trashCan"
  | "picnicTable"
  | "shed"
  | "pond"
  | "fence"
  | "streetLamp"
  // ground-level road markings (drawn under everything, never solid)
  | "road"
  | "roadLine"
  | "crosswalk"
  | "sidewalk";

export interface FurnitureDef {
  id: string;
  kind: FurnitureKind;
  /** Centre of the piece in world space. */
  x: number;
  y: number;
  /** Draw size. Falls back to a per-kind default when omitted. */
  w?: number;
  h?: number;
  /** Solid furniture blocks movement/pathfinding; decor does not. */
  solid?: boolean;
  /** Collision footprint (defaults to draw size). Only used when solid. */
  fw?: number;
  fh?: number;
  /** Rotate 90° for pieces defined against a vertical wall (visual only). */
  vertical?: boolean;
}

export const PALETTE = {
  wallLine: 0x32324a,
  floor: 0x121219,
  floorAlt: 0x16161f,
  hallway: 0x191922,
  label: "#6c6776",
  player: 0x4aa3df,
  playerDark: 0x2c6f9e,
  cat: 0x17171d,
  catEar: 0x101015,
  outline: 0x000000,
  moneyGlow: 0xffe23a,
  moneyGold: 0xffd633,
  moneyHighlight: 0xfff4a8,
  attic: 0xc41e3a,
  doorWood: 0x3a2b22,
  doorWoodDark: 0x241a14,
  doorHandle: 0x141010,
  cabinet: 0x4a3528,
  cabinetDark: 0x2e2118,
  box: 0x5c4332,
  boxFlap: 0x6e5340,
  chest: 0x3d2817,
  chestTrim: 0x5a3d24,
  chestLock: 0xffd633,
  interactHint: "#9a94a8",
  // Furniture / decoration palette. Muted tones so loot + characters still pop.
  couch: 0x3b4a63,
  couchDark: 0x2a374c,
  couchCushion: 0x47597a,
  wood: 0x4a3a2a,
  woodDark: 0x33271c,
  woodLight: 0x5e4a36,
  appliance: 0x3d4450,
  applianceLight: 0x525a68,
  appliancePanel: 0x2a2f38,
  counterTop: 0x4a4f59,
  fabric: 0x53506a,
  fabricDark: 0x3a3850,
  bedSheet: 0x4a5a74,
  bedPillow: 0x9aa6ba,
  screen: 0x14171f,
  screenGlow: 0x2b4a6e,
  porcelain: 0x9aa2ad,
  porcelainDark: 0x6d747d,
  rug: 0x5a3550,
  rugAlt: 0x40465e,
  rugTrim: 0x785070,
  art: 0x6a5a44,
  artFrame: 0x271d14,
  plantPot: 0x6b4530,
  plantLeaf: 0x3f6b45,
  lampShade: 0xd9c07a,
  metal: 0x40444c,
  // Outdoor palette for the exterior chase levels.
  grass: 0x1e3524,
  grassDark: 0x16281b,
  trunk: 0x4a3423,
  leaf: 0x2f6b3d,
  leafDark: 0x24512e,
  bush: 0x2b5c36,
  asphalt: 0x2a2c33,
  carBody: 0x3c4a63,
  carGlass: 0x22303f,
  water: 0x24506b,
  waterLight: 0x336b8c,
  fence: 0x4a3c2c,
  lampGlow: 0xffd98a
};

// ---------------------------------------------------------------------------
// Viewport. Levels are AUTHORED against an 800x600 design space (that is what
// every literal in floors.ts uses) and transformed once at load into the real
// 16:9 world below, so the layouts stay readable while the game fills a
// widescreen canvas. Change WORLD_W/WORLD_H here and everything follows.
// ---------------------------------------------------------------------------
export const DESIGN_W = 800;
export const DESIGN_H = 600;
export const WORLD_W = 1280;
export const WORLD_H = 720;
export const SCALE_X = WORLD_W / DESIGN_W; // 1.6
export const SCALE_Y = WORLD_H / DESIGN_H; // 1.2
/** Uniform scale for discrete props, so beds and cars don't stretch. */
export const SCALE_OBJ = Math.min(SCALE_X, SCALE_Y);

export const WORLD = {
  x: 30 * SCALE_X,
  y: 30 * SCALE_Y,
  w: 740 * SCALE_X,
  h: 540 * SCALE_Y
};
export const CASH_TOTAL = 10;
export const CHEST_KEY_ID = "chest_key";
export const LIVES_TOTAL = 3;
// Ludicrous starts with one extra life but never gets the outdoor top-up.
export const LIVES_LUDICROUS = 4;
// First outdoor level. On Normal, reaching it grants LIVES_OUTSIDE_BONUS lives.
export const OUTSIDE_FLOOR = 5;
export const LIVES_OUTSIDE_BONUS = 2;

/** Lives a player starts a run with, by difficulty. */
export function startingLives(difficulty: string): number {
  return difficulty === "ludicrous" ? LIVES_LUDICROUS : LIVES_TOTAL;
}

/** Maximum lives attainable in a run — drives how many hearts the HUD draws. */
export function maxLives(difficulty: string, floor: number): number {
  if (difficulty === "ludicrous") return LIVES_LUDICROUS;
  return floor >= OUTSIDE_FLOOR ? LIVES_TOTAL + LIVES_OUTSIDE_BONUS : LIVES_TOTAL;
}

/**
 * Stable identity for a solo run. Player lives are stored in a map keyed by
 * player id and must survive a floor change; the Socket.IO socket id is NOT
 * safe for that because it changes on every reconnect, which silently orphaned
 * the saved lives and made them look "reset" on the next floor.
 */
export const SOLO_ID = "solo";

/**
 * Grant the one-off outdoor top-up when a run crosses from inside to outside.
 * Dead players stay dead, and Ludicrous never receives it.
 */
export function applyOutsideBonus(
  lives: Record<string, number>,
  prevFloor: number,
  nextFloor: number,
  difficulty: string
): Record<string, number> {
  if (difficulty === "ludicrous") return lives;
  if (!(nextFloor >= OUTSIDE_FLOOR && prevFloor < OUTSIDE_FLOOR)) return lives;
  const cap = maxLives(difficulty, nextFloor);
  const out: Record<string, number> = {};
  for (const [id, n] of Object.entries(lives)) {
    out[id] = n > 0 ? Math.min(cap, n + LIVES_OUTSIDE_BONUS) : n;
  }
  return out;
}

export const PLAYER_SPAWN = { x: 400 * SCALE_X, y: 300 * SCALE_Y };
export const PLAYER_SPAWNS = [
  { x: 380 * SCALE_X, y: 300 * SCALE_Y },
  { x: 420 * SCALE_X, y: 300 * SCALE_Y },
  { x: 380 * SCALE_X, y: 320 * SCALE_Y },
  { x: 420 * SCALE_X, y: 320 * SCALE_Y }
];
export const PLAYER_COLORS = [0x4aa3df, 0x4adf7a, 0xdf4a4a, 0xdfae4a];

export function playerColorCss(index: number): string {
  const color = PLAYER_COLORS[index] ?? PALETTE.player;
  return `#${color.toString(16).padStart(6, "0")}`;
}
export const CAT_SPAWN = { x: 440 * SCALE_X, y: 150 * SCALE_Y };

export const PLAYER_SPEED = 165 * SCALE_OBJ;
export const PLAYER_BODY_RADIUS = 12 * SCALE_OBJ;
export const COIN_PICKUP_RADIUS = 14 * SCALE_OBJ;
/** Edge-to-edge overlap between player body and coin pickup circle. */
export const PICKUP_RADIUS = PLAYER_BODY_RADIUS + COIN_PICKUP_RADIUS;
/** Extra slack when the host validates a remote player's coin pickup over the network. */
export const REMOTE_PICKUP_BUFFER = 12;
export const INTERACT_RADIUS = 34 * SCALE_OBJ;
export const CATCH_RADIUS = 24 * SCALE_OBJ;
export const INVULN_SECONDS = 1.6;
export const ESCAPE_RADIUS = 34 * SCALE_OBJ;
export const TILE = 20;

export const ROOMS: Room[] = [
  { key: "living", name: "Living Room", x: 30, y: 30, w: 330, h: 230 },
  { key: "kitchen", name: "Kitchen", x: 380, y: 30, w: 390, h: 230 },
  { key: "hallway", name: "Hallway", x: 30, y: 270, w: 740, h: 60 },
  { key: "bedroom", name: "Bedroom", x: 30, y: 340, w: 290, h: 230 },
  { key: "bathroom", name: "Bathroom", x: 340, y: 340, w: 200, h: 230 },
  { key: "attic", name: "Back door", x: 560, y: 340, w: 210, h: 230, isAttic: true }
];


export const MONEY_SPOTS = [
  { x: 195, y: 159 },
  { x: 100, y: 100},
  { x: 290, y: 100},
  //^^those two are for the living room
  { x: 675, y: 200 },
  { x: 450, y: 100},
  //^^kitchen coins
  { x: 175, y: 469 },
  //^^bedroom coins
  { x: 440, y: 500 }
  //bathroom coin
];

export const INTERACTABLE_DEFS: InteractableDef[] = [
  { id: "kitchen_cabinet", kind: "cabinet", x: 750, y: 130, label: "Kitchen cabinet", contains: "key" },
  { id: "living__room_box", kind: "box", x: 50, y: 100, label: "Cardboard box", contains: null },
  { id: "bedroom_cabinet", kind: "cabinet", x: 70, y: 450, label: "Bedroom cabinet", contains: "cash" },
  { id: "bathroom_cabinet", kind: "cabinet", x: 520, y: 540, label: "Medicine cabinet", contains: null },
  {
    id: "locked_chest",
    kind: "chest",
    x: 620,
    y: 470,
    label: "Locked chest",
    locked: true,
    keyId: CHEST_KEY_ID,
    contains: "cash_x2"
  }
];

const ROOM_INSET = 4;
export const WALKABLE_RECTS: Rect[] = [
  ...ROOMS.map((r) => ({
    x: r.x + ROOM_INSET,
    y: r.y + ROOM_INSET,
    w: r.w - ROOM_INSET * 2,
    h: r.h - ROOM_INSET * 2
  })),
  { x: 168, y: 248, w: 44, h: 42 },
  { x: 518, y: 248, w: 44, h: 42 },
  { x: 148, y: 308, w: 44, h: 42 },
  { x: 408, y: 308, w: 44, h: 42 },
  { x: 628, y: 308, w: 44, h: 42 }
];

export function isWalkablePoint(x: number, y: number): boolean {
  for (const r of WALKABLE_RECTS) {
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true;
  }
  return false;
}

export function createHouseCollisionMap(): CollisionMap {
  const cols = Math.ceil(WORLD_W / TILE);
  const rows = Math.ceil(WORLD_H / TILE);
  const grid: boolean[][] = [];
  for (let row = 0; row < rows; row++) {
    grid[row] = [];
    for (let col = 0; col < cols; col++) {
      const cx = col * TILE + TILE / 2;
      const cy = row * TILE + TILE / 2;
      grid[row][col] = isWalkablePoint(cx, cy);
    }
  }
  return new CollisionMap(TILE, TILE, grid);
}
