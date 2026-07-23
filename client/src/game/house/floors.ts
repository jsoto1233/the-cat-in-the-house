import { CollisionMap } from "../CollisionMap";
import {
  CHEST_KEY_ID,
  TILE,
  type FurnitureDef,
  type InteractableDef,
  type Rect,
  type Room
} from "./houseLayout";

// ---------------------------------------------------------------------------
// Per-floor layouts (levels). Each floor is a distinct room arrangement with
// its own loot positions and exit. Floor 1 exits through a DOOR, floors 2-3 via
// STAIRS up, and the top floor via a WINDOW. All four layouts were generated and
// reachability-checked (flood-fill from the player spawn) so every coin, cabinet,
// chest, exit and the cat spawn is guaranteed walkable and reachable.
//
// They share a horizontal HALLWAY spine that the player always spawns in; every
// room connects to it through a doorway, which is what guarantees connectivity.
// ---------------------------------------------------------------------------

export type ExitType = "door" | "stairs" | "window";

export interface FloorExit {
  type: ExitType;
  x: number; // escape trigger point (inside the exit room)
  y: number;
  roomKey: string;
}

export interface FloorLayout {
  floor: number;
  name: string;
  rooms: Room[];
  connectors: Rect[]; // walkable doorway bridges between rooms and the hallway
  moneySpots: { x: number; y: number }[];
  interactables: InteractableDef[];
  furniture?: FurnitureDef[]; // decoration layer; solid pieces bake into collision
  playerSpawn: { x: number; y: number };
  catSpawn: { x: number; y: number };
  exit: FloorExit;
  tint: number; // subtle per-floor floor color so each level reads differently
}

const HALL: Room = { key: "hallway", name: "Hallway", x: 30, y: 270, w: 740, h: 60 };
const SPAWN = { x: 400, y: 300 }; // hallway centre, walkable on every floor

function chest(id: string, label: string, x: number, y: number): InteractableDef {
  return { id, kind: "chest", x, y, label, locked: true, keyId: CHEST_KEY_ID, contains: "cash_x2" };
}

export const FLOORS: FloorLayout[] = [
  {
    floor: 1,
    name: "Ground Floor",
    tint: 0x121219,
    rooms: [
      { key: "living", name: "Living Room", x: 30, y: 30, w: 330, h: 230 },
      { key: "kitchen", name: "Kitchen", x: 360, y: 30, w: 410, h: 230 },
      HALL,
      { key: "bedroom", name: "Bedroom", x: 30, y: 340, w: 290, h: 230 },
      { key: "bathroom", name: "Bathroom", x: 320, y: 340, w: 220, h: 230 },
      { key: "mud", name: "Mud Room", x: 540, y: 340, w: 230, h: 230 }
    ],
    connectors: [
      { x: 173, y: 248, w: 44, h: 42 },
      { x: 543, y: 248, w: 44, h: 42 },
      { x: 153, y: 308, w: 44, h: 42 },
      { x: 408, y: 308, w: 44, h: 42 },
      { x: 633, y: 308, w: 44, h: 42 }
    ],
    moneySpots: [
      { x: 130, y: 130 },
      { x: 250, y: 210 },
      { x: 590, y: 130 },
      { x: 670, y: 210 },
      { x: 150, y: 470 },
      { x: 430, y: 470 },
      { x: 650, y: 470 }
    ],
    interactables: [
      { id: "f1_key", kind: "cabinet", x: 650, y: 90, label: "Kitchen cabinet", contains: "key" },
      { id: "f1_cash", kind: "cabinet", x: 130, y: 470, label: "Bedroom cabinet", contains: "cash" },
      { id: "f1_box", kind: "box", x: 90, y: 90, label: "Cardboard box", contains: null },
      { id: "f1_med", kind: "cabinet", x: 430, y: 510, label: "Medicine cabinet", contains: null },
      chest("f1_chest", "Locked chest", 690, 470)
    ],
    furniture: [
      // --- Living Room (top-left) --------------------------------------
      { id: "f1_rug_living", kind: "rug", x: 250, y: 148, w: 150, h: 96 },
      { id: "f1_sofa", kind: "couch", x: 250, y: 52, w: 130, h: 26, solid: true },
      { id: "f1_coffee", kind: "coffeeTable", x: 250, y: 140, w: 60, h: 34, solid: true },
      { id: "f1_tv", kind: "tvStand", x: 340, y: 140, w: 20, h: 72, solid: true, vertical: true },
      { id: "f1_art_living", kind: "wallArt", x: 250, y: 38, w: 54, h: 14 },
      { id: "f1_plant_living", kind: "plant", x: 330, y: 58 },
      // --- Kitchen (top-right) -----------------------------------------
      { id: "f1_rug_kitchen", kind: "rug", x: 470, y: 180, w: 96, h: 72 },
      { id: "f1_counter", kind: "counter", x: 440, y: 50, w: 150, h: 26, solid: true },
      { id: "f1_stove", kind: "stove", x: 545, y: 50, w: 44, h: 26, solid: true },
      { id: "f1_fridge", kind: "fridge", x: 378, y: 110, w: 28, h: 50, solid: true, vertical: true },
      { id: "f1_dining", kind: "diningTable", x: 470, y: 180, w: 70, h: 48, solid: true },
      { id: "f1_plant_kitchen", kind: "plant", x: 742, y: 58 },
      // --- Hallway (spine — decor only, never solid) -------------------
      { id: "f1_runner", kind: "rug", x: 400, y: 300, w: 520, h: 30 },
      { id: "f1_pics", kind: "framedPictures", x: 300, y: 277 },
      { id: "f1_sidetable", kind: "sideTable", x: 720, y: 300 },
      { id: "f1_lamp_hall", kind: "lamp", x: 720, y: 291 },
      // --- Bedroom (bottom-left) ---------------------------------------
      { id: "f1_rug_bed", kind: "rug", x: 232, y: 482, w: 128, h: 92 },
      { id: "f1_bed", kind: "bed", x: 250, y: 470, w: 90, h: 120, solid: true },
      { id: "f1_dresser", kind: "dresser", x: 300, y: 390, w: 22, h: 56, solid: true, vertical: true },
      { id: "f1_nightstand", kind: "nightstand", x: 196, y: 420 },
      { id: "f1_lamp_bed", kind: "lamp", x: 196, y: 406 },
      // --- Bathroom (bottom-centre) ------------------------------------
      { id: "f1_bathtub", kind: "bathtub", x: 505, y: 430, w: 48, h: 90, solid: true, vertical: true },
      { id: "f1_toilet", kind: "toilet", x: 355, y: 530, w: 26, h: 30, solid: true },
      { id: "f1_sink", kind: "sink", x: 350, y: 362 },
      { id: "f1_mirror", kind: "mirror", x: 350, y: 349 },
      // --- Mud Room (bottom-right, by the exit) ------------------------
      { id: "f1_mat_mud", kind: "rug", x: 662, y: 500, w: 90, h: 58 },
      { id: "f1_shelf", kind: "shelving", x: 558, y: 455, w: 22, h: 90, solid: true, vertical: true },
      { id: "f1_coatrack", kind: "coatRack", x: 560, y: 375 },
      { id: "f1_boots", kind: "clutter", x: 600, y: 545 }
    ],
    playerSpawn: SPAWN,
    catSpawn: { x: 290, y: 130 },
    exit: { type: "door", x: 756, y: 455, roomKey: "mud" }
  },
  {
    floor: 2,
    name: "Second Floor",
    tint: 0x12181f,
    rooms: [
      { key: "study", name: "Study", x: 30, y: 30, w: 250, h: 230 },
      { key: "landing", name: "Landing", x: 280, y: 30, w: 260, h: 230 },
      { key: "nursery", name: "Nursery", x: 540, y: 30, w: 230, h: 230 },
      HALL,
      { key: "garage", name: "Garage", x: 30, y: 340, w: 400, h: 230 },
      { key: "den", name: "Den", x: 430, y: 340, w: 340, h: 230 }
    ],
    connectors: [
      { x: 133, y: 248, w: 44, h: 42 },
      { x: 388, y: 248, w: 44, h: 42 },
      { x: 633, y: 248, w: 44, h: 42 },
      { x: 208, y: 308, w: 44, h: 42 },
      { x: 578, y: 308, w: 44, h: 42 }
    ],
    moneySpots: [
      { x: 130, y: 130 },
      { x: 410, y: 130 },
      { x: 650, y: 130 },
      { x: 210, y: 470 },
      { x: 290, y: 470 },
      { x: 570, y: 470 },
      { x: 670, y: 470 }
    ],
    interactables: [
      { id: "f2_key", kind: "cabinet", x: 130, y: 210, label: "Study cabinet", contains: "key" },
      { id: "f2_cash", kind: "cabinet", x: 570, y: 510, label: "Den cabinet", contains: "cash" },
      { id: "f2_box", kind: "box", x: 650, y: 210, label: "Cardboard box", contains: null },
      { id: "f2_med", kind: "cabinet", x: 290, y: 510, label: "Wall cabinet", contains: null },
      chest("f2_chest", "Locked chest", 210, 510)
    ],
    furniture: [
      // --- Study (top-left) --------------------------------------------
      { id: "f2_rug_study", kind: "rug", x: 160, y: 150, w: 110, h: 80 },
      { id: "f2_desk", kind: "counter", x: 200, y: 50, w: 90, h: 24, solid: true },
      { id: "f2_shelf_study", kind: "shelving", x: 258, y: 120, w: 20, h: 90, solid: true, vertical: true },
      { id: "f2_plant_study", kind: "plant", x: 255, y: 240 },
      // --- Landing (top-centre) ----------------------------------------
      { id: "f2_rug_landing", kind: "rug", x: 410, y: 150, w: 120, h: 90 },
      { id: "f2_bench", kind: "couch", x: 330, y: 50, w: 70, h: 24, solid: true },
      { id: "f2_art_landing", kind: "wallArt", x: 410, y: 40, w: 54, h: 14 },
      { id: "f2_plant_landing", kind: "plant", x: 520, y: 240 },
      // --- Nursery (top-right, holds the stairs) -----------------------
      { id: "f2_rug_nursery", kind: "rug", x: 605, y: 185, w: 90, h: 70 },
      { id: "f2_crib", kind: "bed", x: 575, y: 120, w: 40, h: 70, solid: true },
      { id: "f2_dresser_nursery", kind: "dresser", x: 560, y: 222, w: 22, h: 44, solid: true, vertical: true },
      { id: "f2_plant_nursery", kind: "plant", x: 560, y: 50 },
      // --- Garage (bottom-left) ----------------------------------------
      { id: "f2_rug_garage", kind: "rug", x: 250, y: 480, w: 110, h: 70 },
      { id: "f2_bench_garage", kind: "counter", x: 360, y: 360, w: 100, h: 24, solid: true },
      { id: "f2_shelf_garage", kind: "shelving", x: 410, y: 470, w: 20, h: 90, solid: true, vertical: true },
      { id: "f2_worktable", kind: "diningTable", x: 110, y: 400, w: 60, h: 40, solid: true },
      { id: "f2_tools", kind: "clutter", x: 70, y: 540 },
      // --- Den (bottom-right) ------------------------------------------
      { id: "f2_rug_den", kind: "rug", x: 560, y: 470, w: 120, h: 80 },
      { id: "f2_sofa_den", kind: "couch", x: 500, y: 360, w: 80, h: 24, solid: true },
      { id: "f2_tv_den", kind: "tvStand", x: 448, y: 470, w: 20, h: 70, solid: true, vertical: true },
      { id: "f2_coffee_den", kind: "coffeeTable", x: 500, y: 430, w: 50, h: 30, solid: true },
      { id: "f2_plant_den", kind: "plant", x: 750, y: 360 }
    ],
    playerSpawn: SPAWN,
    catSpawn: { x: 410, y: 170 },
    exit: { type: "stairs", x: 748, y: 145, roomKey: "nursery" }
  },
  {
    floor: 3,
    name: "Third Floor",
    tint: 0x14180f,
    rooms: [
      { key: "library", name: "Library", x: 30, y: 30, w: 400, h: 230 },
      { key: "loft", name: "Loft", x: 430, y: 30, w: 340, h: 230 },
      HALL,
      { key: "cellar", name: "Storeroom", x: 30, y: 340, w: 230, h: 230 },
      { key: "workshop", name: "Workshop", x: 260, y: 340, w: 250, h: 230 },
      { key: "pantry", name: "Pantry", x: 510, y: 340, w: 260, h: 230 }
    ],
    connectors: [
      { x: 208, y: 248, w: 44, h: 42 },
      { x: 578, y: 248, w: 44, h: 42 },
      { x: 123, y: 308, w: 44, h: 42 },
      { x: 363, y: 308, w: 44, h: 42 },
      { x: 618, y: 308, w: 44, h: 42 }
    ],
    moneySpots: [
      { x: 210, y: 130 },
      { x: 290, y: 210 },
      { x: 650, y: 130 },
      { x: 130, y: 470 },
      { x: 390, y: 470 },
      { x: 630, y: 470 },
      { x: 690, y: 470 }
    ],
    interactables: [
      { id: "f3_key", kind: "cabinet", x: 650, y: 210, label: "Loft cabinet", contains: "key" },
      { id: "f3_cash", kind: "cabinet", x: 690, y: 510, label: "Pantry cabinet", contains: "cash" },
      { id: "f3_box", kind: "box", x: 130, y: 510, label: "Cardboard box", contains: null },
      { id: "f3_med", kind: "cabinet", x: 390, y: 510, label: "Workshop cabinet", contains: null },
      chest("f3_chest", "Locked chest", 210, 210)
    ],
    furniture: [
      // --- Library (top-left) ------------------------------------------
      { id: "f3_rug_library", kind: "rug", x: 320, y: 140, w: 110, h: 80 },
      { id: "f3_shelf_lib1", kind: "shelving", x: 80, y: 50, w: 80, h: 22, solid: true },
      { id: "f3_shelf_lib2", kind: "shelving", x: 410, y: 120, w: 20, h: 80, solid: true, vertical: true },
      { id: "f3_read_table", kind: "diningTable", x: 340, y: 180, w: 70, h: 44, solid: true },
      // --- Loft (top-right) --------------------------------------------
      { id: "f3_rug_loft", kind: "rug", x: 500, y: 120, w: 100, h: 80 },
      { id: "f3_sofa_loft", kind: "couch", x: 490, y: 50, w: 80, h: 24, solid: true },
      { id: "f3_tv_loft", kind: "tvStand", x: 755, y: 120, w: 16, h: 70, solid: true, vertical: true },
      { id: "f3_coffee_loft", kind: "coffeeTable", x: 490, y: 140, w: 50, h: 30, solid: true },
      // --- Storeroom (bottom-left, holds the stairs) -------------------
      { id: "f3_rug_cellar", kind: "rug", x: 140, y: 480, w: 100, h: 70 },
      { id: "f3_shelf_cellar1", kind: "shelving", x: 240, y: 470, w: 20, h: 90, solid: true, vertical: true },
      { id: "f3_shelf_cellar2", kind: "shelving", x: 210, y: 362, w: 70, h: 22, solid: true },
      { id: "f3_clutter_cellar", kind: "clutter", x: 70, y: 540 },
      // --- Workshop (bottom-centre) ------------------------------------
      { id: "f3_bench_ws", kind: "counter", x: 310, y: 360, w: 80, h: 24, solid: true },
      { id: "f3_shelf_ws", kind: "shelving", x: 495, y: 470, w: 20, h: 80, solid: true, vertical: true },
      { id: "f3_table_ws", kind: "diningTable", x: 310, y: 470, w: 60, h: 40, solid: true },
      { id: "f3_clutter_ws", kind: "clutter", x: 470, y: 540 },
      // --- Pantry (bottom-right) ---------------------------------------
      { id: "f3_rug_pantry", kind: "rug", x: 650, y: 470, w: 90, h: 70 },
      { id: "f3_shelf_pantry", kind: "shelving", x: 528, y: 470, w: 20, h: 90, solid: true, vertical: true },
      { id: "f3_counter_pantry", kind: "counter", x: 590, y: 375, w: 90, h: 22, solid: true },
      { id: "f3_clutter_pantry", kind: "clutter", x: 560, y: 540 }
    ],
    playerSpawn: SPAWN,
    catSpawn: { x: 590, y: 130 },
    exit: { type: "stairs", x: 52, y: 470, roomKey: "cellar" }
  },
  {
    floor: 4,
    name: "Top Floor",
    tint: 0x161020,
    rooms: [
      { key: "bedroom", name: "Bedroom", x: 30, y: 30, w: 270, h: 230 },
      { key: "attic", name: "Attic Hall", x: 300, y: 30, w: 240, h: 230 },
      { key: "storage", name: "Storage", x: 540, y: 30, w: 230, h: 230 },
      HALL,
      { key: "closet", name: "Closet", x: 30, y: 340, w: 330, h: 230 },
      { key: "balcony", name: "Balcony Room", x: 360, y: 340, w: 410, h: 230 }
    ],
    connectors: [
      { x: 143, y: 248, w: 44, h: 42 },
      { x: 398, y: 248, w: 44, h: 42 },
      { x: 633, y: 248, w: 44, h: 42 },
      { x: 173, y: 308, w: 44, h: 42 },
      { x: 543, y: 308, w: 44, h: 42 }
    ],
    moneySpots: [
      { x: 150, y: 130 },
      { x: 250, y: 210 },
      { x: 430, y: 130 },
      { x: 650, y: 130 },
      { x: 210, y: 470 },
      { x: 510, y: 470 },
      { x: 650, y: 470 }
    ],
    interactables: [
      { id: "f4_key", kind: "cabinet", x: 650, y: 210, label: "Storage cabinet", contains: "key" },
      { id: "f4_cash", kind: "cabinet", x: 210, y: 510, label: "Closet cabinet", contains: "cash" },
      { id: "f4_box", kind: "box", x: 150, y: 210, label: "Cardboard box", contains: null },
      { id: "f4_med", kind: "cabinet", x: 510, y: 510, label: "Wall cabinet", contains: null },
      chest("f4_chest", "Locked chest", 650, 470)
    ],
    furniture: [
      // --- Bedroom (top-left) ------------------------------------------
      { id: "f4_rug_bed", kind: "rug", x: 160, y: 150, w: 100, h: 80 },
      { id: "f4_bed", kind: "bed", x: 255, y: 120, w: 80, h: 100, solid: true },
      { id: "f4_dresser_bed", kind: "dresser", x: 80, y: 50, w: 60, h: 22, solid: true },
      { id: "f4_nightstand", kind: "nightstand", x: 200, y: 180 },
      { id: "f4_lamp_bed", kind: "lamp", x: 200, y: 166 },
      // --- Attic Hall (top-centre, holds the escape window) ------------
      { id: "f4_dresser_attic", kind: "dresser", x: 318, y: 150, w: 22, h: 60, solid: true, vertical: true },
      { id: "f4_shelf_attic", kind: "shelving", x: 522, y: 150, w: 20, h: 70, solid: true, vertical: true },
      { id: "f4_side_attic", kind: "sideTable", x: 330, y: 60 },
      { id: "f4_plant_attic", kind: "plant", x: 330, y: 240 },
      { id: "f4_art_attic", kind: "wallArt", x: 360, y: 44, w: 50, h: 12 },
      // --- Storage (top-right) -----------------------------------------
      { id: "f4_rug_storage", kind: "rug", x: 700, y: 150, w: 80, h: 70 },
      { id: "f4_shelf_storage1", kind: "shelving", x: 558, y: 120, w: 20, h: 80, solid: true, vertical: true },
      { id: "f4_shelf_storage2", kind: "shelving", x: 710, y: 50, w: 80, h: 22, solid: true },
      { id: "f4_table_storage", kind: "diningTable", x: 730, y: 180, w: 60, h: 44, solid: true },
      { id: "f4_clutter_storage", kind: "clutter", x: 620, y: 240 },
      // --- Closet (bottom-left) ----------------------------------------
      { id: "f4_rug_closet", kind: "rug", x: 200, y: 480, w: 100, h: 70 },
      { id: "f4_shelf_closet1", kind: "shelving", x: 48, y: 470, w: 20, h: 100, solid: true, vertical: true },
      { id: "f4_dresser_closet", kind: "dresser", x: 340, y: 450, w: 22, h: 70, solid: true, vertical: true },
      { id: "f4_shelf_closet2", kind: "shelving", x: 300, y: 362, w: 80, h: 22, solid: true },
      { id: "f4_clutter_closet", kind: "clutter", x: 90, y: 540 },
      // --- Balcony Room (bottom-right) ---------------------------------
      { id: "f4_rug_balcony", kind: "rug", x: 560, y: 470, w: 120, h: 80 },
      { id: "f4_sofa_balcony", kind: "couch", x: 430, y: 360, w: 80, h: 24, solid: true },
      { id: "f4_tv_balcony", kind: "tvStand", x: 378, y: 470, w: 20, h: 70, solid: true, vertical: true },
      { id: "f4_coffee_balcony", kind: "coffeeTable", x: 430, y: 450, w: 50, h: 30, solid: true },
      { id: "f4_plant_balcony", kind: "plant", x: 750, y: 360 }
    ],
    playerSpawn: SPAWN,
    catSpawn: { x: 430, y: 170 },
    exit: { type: "window", x: 430, y: 50, roomKey: "attic" }
  }
];

export function getFloorLayout(floor: number): FloorLayout {
  const idx = Math.max(0, Math.min(FLOORS.length - 1, floor - 1));
  return FLOORS[idx];
}

// Wall thickness pulled in from each room's edge. This MUST be larger than half
// a tile (TILE/2 = 10): the collision grid only blocks a tile when its CENTRE
// falls outside every walkable rect, so with the old 4px inset the ~8px wall
// between two side-by-side rooms never contained a tile centre and the player
// could walk straight through it. At 12px, adjacent rooms are separated by a
// full blocked tile column/row — a real perimeter — while the doorway
// connectors (which are NOT inset) still bridge the gap so rooms stay reachable.
const ROOM_INSET = 12;

function layoutWalkableRects(layout: FloorLayout): Rect[] {
  return [
    ...layout.rooms.map((r) => ({
      x: r.x + ROOM_INSET,
      y: r.y + ROOM_INSET,
      w: r.w - ROOM_INSET * 2,
      h: r.h - ROOM_INSET * 2
    })),
    ...layout.connectors
  ];
}

export function isWalkableInLayout(layout: FloorLayout, x: number, y: number): boolean {
  for (const r of layoutWalkableRects(layout)) {
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true;
  }
  return false;
}

/** Collision footprint of a solid furniture piece (centre-based, defaults to draw size). */
export function furnitureFootprint(f: FurnitureDef): Rect | null {
  if (!f.solid) return null;
  const w = f.fw ?? f.w ?? 32;
  const h = f.fh ?? f.h ?? 32;
  return { x: f.x - w / 2, y: f.y - h / 2, w, h };
}

/** True if (x, y) sits inside any SOLID furniture piece on this floor. */
export function isBlockedByFurniture(layout: FloorLayout, x: number, y: number): boolean {
  for (const f of layout.furniture ?? []) {
    const fp = furnitureFootprint(f);
    if (!fp) continue;
    if (x >= fp.x && x <= fp.x + fp.w && y >= fp.y && y <= fp.y + fp.h) return true;
  }
  return false;
}

export function createFloorCollisionMap(layout: FloorLayout): CollisionMap {
  const cols = Math.ceil(800 / TILE);
  const rows = Math.ceil(600 / TILE);
  const grid: boolean[][] = [];
  for (let row = 0; row < rows; row++) {
    grid[row] = [];
    for (let col = 0; col < cols; col++) {
      const cx = col * TILE + TILE / 2;
      const cy = row * TILE + TILE / 2;
      // Walkable = inside a room/connector AND not occupied by solid furniture.
      // Both the player (resolveMove) and the cat (findPath) read this one grid,
      // so a single blocked tile keeps them both out of the furniture.
      grid[row][col] =
        isWalkableInLayout(layout, cx, cy) && !isBlockedByFurniture(layout, cx, cy);
    }
  }
  return new CollisionMap(TILE, TILE, grid);
}
