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
// drawn by houseSprites.spawnFurniture and, when `solid` is true, its footprint
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
  | "clutter";

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
  metal: 0x40444c
};

export const WORLD = { x: 30, y: 30, w: 740, h: 540 };
export const CASH_TOTAL = 10;
export const CHEST_KEY_ID = "chest_key";
export const LIVES_TOTAL = 3;

export const PLAYER_SPAWN = { x: 400, y: 300 };
export const PLAYER_SPAWNS = [
  { x: 380, y: 300 },
  { x: 420, y: 300 },
  { x: 380, y: 320 },
  { x: 420, y: 320 }
];
export const PLAYER_COLORS = [0x4aa3df, 0x4adf7a, 0xdf4a4a, 0xdfae4a];

export function playerColorCss(index: number): string {
  const color = PLAYER_COLORS[index] ?? PALETTE.player;
  return `#${color.toString(16).padStart(6, "0")}`;
}
export const CAT_SPAWN = { x: 440, y: 150 };

export const PLAYER_SPEED = 165;
export const PLAYER_BODY_RADIUS = 12;
export const COIN_PICKUP_RADIUS = 14;
/** Edge-to-edge overlap between player body and coin pickup circle. */
export const PICKUP_RADIUS = PLAYER_BODY_RADIUS + COIN_PICKUP_RADIUS;
/** Extra slack when the host validates a remote player's coin pickup over the network. */
export const REMOTE_PICKUP_BUFFER = 12;
export const INTERACT_RADIUS = 34;
export const CATCH_RADIUS = 24;
export const INVULN_SECONDS = 1.6;
export const ESCAPE_RADIUS = 34;
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
  const cols = Math.ceil(800 / TILE);
  const rows = Math.ceil(600 / TILE);
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
