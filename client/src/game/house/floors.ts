import { CollisionMap } from "../CollisionMap";
import {
  CHEST_KEY_ID,
  SCALE_OBJ,
  SCALE_X,
  SCALE_Y,
  TILE,
  WORLD_H,
  WORLD_W,
  type FurnitureDef,
  type FurnitureKind,
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

export type ExitType = "door" | "stairs" | "window" | "gate" | "van";

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

const DESIGN_FLOORS: FloorLayout[] = [
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
      // --- Living Room: couch on top wall, TV on bottom wall, table between
      { id: "f1_rug_living", kind: "rug", x: 240, y: 150, w: 150, h: 96 },
      { id: "f1_sofa", kind: "couch", x: 230, y: 45, w: 120, h: 26, solid: true },
      { id: "f1_tv", kind: "tvStand", x: 300, y: 240, w: 60, h: 24, solid: true },
      { id: "f1_coffee", kind: "coffeeTable", x: 240, y: 150, w: 60, h: 30, solid: true },
      { id: "f1_art_living", kind: "wallArt", x: 140, y: 40, w: 54, h: 14 },
      { id: "f1_plant_living", kind: "plant", x: 338, y: 48 },
      // --- Kitchen: counters on top wall, fridge in corner, table centred
      { id: "f1_rug_kitchen", kind: "rug", x: 470, y: 160, w: 96, h: 72 },
      { id: "f1_counter", kind: "counter", x: 450, y: 45, w: 140, h: 26, solid: true },
      { id: "f1_stove", kind: "stove", x: 548, y: 45, w: 44, h: 26, solid: true },
      { id: "f1_fridge", kind: "fridge", x: 376, y: 90, w: 28, h: 50, solid: true, vertical: true },
      { id: "f1_dining", kind: "diningTable", x: 470, y: 160, w: 70, h: 48, solid: true },
      { id: "f1_plant_kitchen", kind: "plant", x: 750, y: 240 },
      // --- Hallway (spine — decor only, never solid) -------------------
      { id: "f1_runner", kind: "rug", x: 400, y: 300, w: 520, h: 26 },
      { id: "f1_pics", kind: "framedPictures", x: 300, y: 277 },
      // --- Bedroom: bed head against top wall, dresser on bottom wall ---
      { id: "f1_rug_bed", kind: "rug", x: 210, y: 470, w: 128, h: 92 },
      { id: "f1_bed", kind: "bed", x: 250, y: 392, w: 80, h: 100, solid: true },
      { id: "f1_nightstand", kind: "nightstand", x: 305, y: 362 },
      { id: "f1_lamp_bed", kind: "lamp", x: 305, y: 352 },
      { id: "f1_dresser", kind: "dresser", x: 270, y: 556, w: 60, h: 20, solid: true },
      // --- Bathroom: fixtures flush to the walls -----------------------
      { id: "f1_bathtub", kind: "bathtub", x: 514, y: 430, w: 48, h: 90, solid: true, vertical: true },
      { id: "f1_toilet", kind: "toilet", x: 340, y: 420, w: 28, h: 30, solid: true },
      { id: "f1_sink", kind: "sink", x: 335, y: 500 },
      { id: "f1_mirror", kind: "mirror", x: 328, y: 470 },
      // --- Mud Room: shelf/bench on walls, boots by the exit ----------
      { id: "f1_mat_mud", kind: "rug", x: 700, y: 500, w: 90, h: 58 },
      { id: "f1_shelf", kind: "shelving", x: 558, y: 430, w: 20, h: 90, solid: true, vertical: true },
      { id: "f1_bench_mud", kind: "counter", x: 600, y: 556, w: 60, h: 20, solid: true },
      { id: "f1_coatrack", kind: "coatRack", x: 560, y: 360 },
      { id: "f1_boots", kind: "clutter", x: 720, y: 545 }
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
      // --- Study: desk + bookshelf against the walls -------------------
      { id: "f2_rug_study", kind: "rug", x: 170, y: 160, w: 110, h: 80 },
      { id: "f2_shelf_study", kind: "shelving", x: 220, y: 45, w: 80, h: 22, solid: true },
      { id: "f2_desk", kind: "counter", x: 256, y: 150, w: 24, h: 70, solid: true, vertical: true },
      { id: "f2_plant_study", kind: "plant", x: 255, y: 240 },
      // --- Landing: bench on the wall, transitional space --------------
      { id: "f2_rug_landing", kind: "rug", x: 410, y: 160, w: 120, h: 80 },
      { id: "f2_bench", kind: "couch", x: 330, y: 45, w: 70, h: 24, solid: true },
      { id: "f2_art_landing", kind: "wallArt", x: 410, y: 40, w: 54, h: 14 },
      { id: "f2_plant_landing", kind: "plant", x: 300, y: 240 },
      // --- Nursery (holds the stairs): crib + dresser on left wall -----
      { id: "f2_rug_nursery", kind: "rug", x: 620, y: 190, w: 90, h: 70 },
      { id: "f2_crib", kind: "bed", x: 562, y: 110, w: 40, h: 70, solid: true },
      { id: "f2_dresser_nursery", kind: "dresser", x: 556, y: 220, w: 22, h: 44, solid: true, vertical: true },
      { id: "f2_plant_nursery", kind: "plant", x: 560, y: 50 },
      // --- Garage: workbench + shelving lining the walls ---------------
      { id: "f2_rug_garage", kind: "rug", x: 250, y: 460, w: 110, h: 70 },
      { id: "f2_bench_garage", kind: "counter", x: 360, y: 360, w: 120, h: 24, solid: true },
      { id: "f2_shelf_garage", kind: "shelving", x: 410, y: 470, w: 20, h: 90, solid: true, vertical: true },
      { id: "f2_shelf_garage2", kind: "shelving", x: 48, y: 450, w: 20, h: 100, solid: true, vertical: true },
      { id: "f2_tools", kind: "clutter", x: 70, y: 545 },
      // --- Den: couch + TV on walls, table in front -------------------
      { id: "f2_rug_den", kind: "rug", x: 560, y: 470, w: 120, h: 80 },
      { id: "f2_sofa_den", kind: "couch", x: 500, y: 360, w: 80, h: 24, solid: true },
      { id: "f2_tv_den", kind: "tvStand", x: 448, y: 470, w: 20, h: 70, solid: true, vertical: true },
      { id: "f2_coffee_den", kind: "coffeeTable", x: 500, y: 440, w: 50, h: 30, solid: true },
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
      // --- Library: bookshelves lining the walls, table centred -------
      { id: "f3_rug_library", kind: "rug", x: 330, y: 150, w: 110, h: 80 },
      { id: "f3_shelf_lib1", kind: "shelving", x: 100, y: 45, w: 80, h: 22, solid: true },
      { id: "f3_shelf_lib2", kind: "shelving", x: 48, y: 160, w: 20, h: 100, solid: true, vertical: true },
      { id: "f3_shelf_lib3", kind: "shelving", x: 410, y: 120, w: 20, h: 100, solid: true, vertical: true },
      { id: "f3_read_table", kind: "diningTable", x: 340, y: 180, w: 70, h: 44, solid: true },
      // --- Loft: couch + TV on walls, table in front ------------------
      { id: "f3_rug_loft", kind: "rug", x: 500, y: 120, w: 100, h: 80 },
      { id: "f3_sofa_loft", kind: "couch", x: 500, y: 45, w: 80, h: 24, solid: true },
      { id: "f3_tv_loft", kind: "tvStand", x: 448, y: 140, w: 20, h: 70, solid: true, vertical: true },
      { id: "f3_coffee_loft", kind: "coffeeTable", x: 500, y: 140, w: 50, h: 30, solid: true },
      // --- Storeroom (holds the stairs): shelving on right/top walls ---
      { id: "f3_rug_cellar", kind: "rug", x: 150, y: 470, w: 100, h: 70 },
      { id: "f3_shelf_cellar1", kind: "shelving", x: 240, y: 460, w: 20, h: 100, solid: true, vertical: true },
      { id: "f3_shelf_cellar2", kind: "shelving", x: 205, y: 362, w: 70, h: 22, solid: true },
      { id: "f3_clutter_cellar", kind: "clutter", x: 75, y: 540 },
      // --- Workshop: benches against the walls ------------------------
      { id: "f3_rug_ws", kind: "rug", x: 390, y: 460, w: 100, h: 70 },
      { id: "f3_bench_ws", kind: "counter", x: 310, y: 360, w: 80, h: 24, solid: true },
      { id: "f3_shelf_ws", kind: "shelving", x: 495, y: 460, w: 20, h: 90, solid: true, vertical: true },
      { id: "f3_bench_ws2", kind: "shelving", x: 278, y: 470, w: 20, h: 80, solid: true, vertical: true },
      { id: "f3_clutter_ws", kind: "clutter", x: 470, y: 545 },
      // --- Pantry: shelving on left wall, counter on top wall ---------
      { id: "f3_rug_pantry", kind: "rug", x: 660, y: 470, w: 90, h: 70 },
      { id: "f3_shelf_pantry", kind: "shelving", x: 528, y: 460, w: 20, h: 100, solid: true, vertical: true },
      { id: "f3_counter_pantry", kind: "counter", x: 590, y: 375, w: 90, h: 22, solid: true },
      { id: "f3_clutter_pantry", kind: "clutter", x: 560, y: 545 }
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
      // --- Bedroom: bed head against top wall, dresser on right wall ---
      { id: "f4_rug_bed", kind: "rug", x: 160, y: 180, w: 100, h: 80 },
      { id: "f4_bed", kind: "bed", x: 240, y: 82, w: 80, h: 100, solid: true },
      { id: "f4_dresser_bed", kind: "dresser", x: 280, y: 180, w: 20, h: 60, solid: true, vertical: true },
      { id: "f4_nightstand", kind: "nightstand", x: 195, y: 60 },
      { id: "f4_lamp_bed", kind: "lamp", x: 195, y: 50 },
      // --- Attic Hall (holds the escape window): shelving on side walls
      { id: "f4_shelf_attic_l", kind: "shelving", x: 318, y: 150, w: 20, h: 80, solid: true, vertical: true },
      { id: "f4_shelf_attic_r", kind: "shelving", x: 522, y: 150, w: 20, h: 70, solid: true, vertical: true },
      { id: "f4_side_attic", kind: "sideTable", x: 315, y: 60 },
      { id: "f4_plant_attic", kind: "plant", x: 525, y: 240 },
      { id: "f4_art_attic", kind: "wallArt", x: 360, y: 40, w: 50, h: 12 },
      // --- Storage: shelving lining the walls -------------------------
      { id: "f4_rug_storage", kind: "rug", x: 650, y: 150, w: 90, h: 70 },
      { id: "f4_shelf_storage1", kind: "shelving", x: 558, y: 120, w: 20, h: 80, solid: true, vertical: true },
      { id: "f4_shelf_storage2", kind: "shelving", x: 710, y: 45, w: 80, h: 22, solid: true },
      { id: "f4_shelf_storage3", kind: "shelving", x: 752, y: 180, w: 20, h: 80, solid: true, vertical: true },
      { id: "f4_clutter_storage", kind: "clutter", x: 720, y: 240 },
      // --- Closet: shelving on left/right/top walls -------------------
      { id: "f4_rug_closet", kind: "rug", x: 200, y: 470, w: 100, h: 70 },
      { id: "f4_shelf_closet1", kind: "shelving", x: 48, y: 460, w: 20, h: 100, solid: true, vertical: true },
      { id: "f4_shelf_closet2", kind: "shelving", x: 340, y: 450, w: 20, h: 80, solid: true, vertical: true },
      { id: "f4_shelf_closet3", kind: "shelving", x: 300, y: 362, w: 80, h: 22, solid: true },
      { id: "f4_clutter_closet", kind: "clutter", x: 90, y: 545 },
      // --- Balcony Room: couch + TV on walls, table in front ----------
      { id: "f4_rug_balcony", kind: "rug", x: 560, y: 470, w: 120, h: 80 },
      { id: "f4_sofa_balcony", kind: "couch", x: 430, y: 360, w: 80, h: 24, solid: true },
      { id: "f4_tv_balcony", kind: "tvStand", x: 378, y: 470, w: 20, h: 70, solid: true, vertical: true },
      { id: "f4_coffee_balcony", kind: "coffeeTable", x: 430, y: 440, w: 50, h: 30, solid: true },
      { id: "f4_plant_balcony", kind: "plant", x: 750, y: 360 }
    ],
    playerSpawn: SPAWN,
    catSpawn: { x: 430, y: 170 },
    exit: { type: "window", x: 430, y: 50, roomKey: "attic" }
  },
  // =========================================================================
  // OUTSIDE (levels 5-8). You bail out the top-floor window into the yard and
  // the cat follows you into the open. Same room/connector skeleton so every
  // zone stays reachable, but the "rooms" are now outdoor areas separated by
  // fences and hedges, with gates instead of doors.
  // =========================================================================
  {
    floor: 5,
    name: "Back Yard",
    tint: 0x14201a,
    rooms: [
      { key: "yard", name: "Back Yard", x: 30, y: 30, w: 370, h: 230 },
      { key: "patio", name: "Patio", x: 400, y: 30, w: 370, h: 230 },
      HALL,
      { key: "garden", name: "Garden", x: 30, y: 340, w: 250, h: 230 },
      { key: "shedyard", name: "Shed Yard", x: 280, y: 340, w: 240, h: 230 },
      { key: "sidegate", name: "Side Gate", x: 520, y: 340, w: 250, h: 230 }
    ],
    connectors: [
      { x: 180, y: 248, w: 44, h: 42 },
      { x: 560, y: 248, w: 44, h: 42 },
      { x: 130, y: 308, w: 44, h: 42 },
      { x: 370, y: 308, w: 44, h: 42 },
      { x: 630, y: 308, w: 44, h: 42 }
    ],
    moneySpots: [
      { x: 110, y: 120 },
      { x: 300, y: 200 },
      { x: 480, y: 110 },
      { x: 700, y: 200 },
      { x: 150, y: 480 },
      { x: 400, y: 500 },
      { x: 600, y: 480 }
    ],
    interactables: [
      { id: "f5_key", kind: "cabinet", x: 740, y: 90, label: "Patio cabinet", contains: "key" },
      { id: "f5_cash", kind: "cabinet", x: 70, y: 470, label: "Garden box", contains: "cash" },
      { id: "f5_box", kind: "box", x: 60, y: 90, label: "Cardboard box", contains: null },
      { id: "f5_med", kind: "cabinet", x: 300, y: 540, label: "Tool locker", contains: null },
      chest("f5_chest", "Locked chest", 700, 540)
    ],
    furniture: [
      { id: "f5_tree1", kind: "tree", x: 190, y: 70, w: 44, h: 44, solid: true },
      { id: "f5_tree2", kind: "tree", x: 340, y: 120, w: 40, h: 40, solid: true },
      { id: "f5_bush1", kind: "bush", x: 250, y: 60, w: 30, h: 20 },
      { id: "f5_bench1", kind: "bench", x: 110, y: 240, w: 60, h: 16, solid: true },
      { id: "f5_picnic", kind: "picnicTable", x: 560, y: 180, w: 70, h: 40, solid: true },
      { id: "f5_bench2", kind: "bench", x: 620, y: 50, w: 60, h: 16, solid: true },
      { id: "f5_trash1", kind: "trashCan", x: 430, y: 240 },
      { id: "f5_pond", kind: "pond", x: 190, y: 400, w: 74, h: 50, solid: true },
      { id: "f5_bush2", kind: "bush", x: 60, y: 380, w: 30, h: 20 },
      { id: "f5_shed", kind: "shed", x: 420, y: 390, w: 66, h: 48, solid: true },
      { id: "f5_trash2", kind: "trashCan", x: 300, y: 400 },
      { id: "f5_lamp1", kind: "streetLamp", x: 560, y: 400 },
      { id: "f5_bush3", kind: "bush", x: 700, y: 380, w: 30, h: 20 }
    ],
    playerSpawn: SPAWN,
    catSpawn: { x: 300, y: 130 },
    exit: { type: "gate", x: 750, y: 430, roomKey: "sidegate" }
  },
  {
    floor: 6,
    name: "Driveway",
    tint: 0x161a20,
    rooms: [
      { key: "drive", name: "Driveway", x: 30, y: 30, w: 400, h: 230 },
      { key: "frontyard", name: "Front Yard", x: 430, y: 30, w: 340, h: 230 },
      HALL,
      { key: "porch", name: "Porch", x: 30, y: 340, w: 300, h: 230 },
      { key: "walk", name: "Walkway", x: 330, y: 340, w: 200, h: 230 },
      { key: "curb", name: "Curb", x: 530, y: 340, w: 240, h: 230 }
    ],
    connectors: [
      { x: 200, y: 248, w: 44, h: 42 },
      { x: 580, y: 248, w: 44, h: 42 },
      { x: 150, y: 308, w: 44, h: 42 },
      { x: 400, y: 308, w: 44, h: 42 },
      { x: 640, y: 308, w: 44, h: 42 }
    ],
    moneySpots: [
      { x: 110, y: 120 },
      { x: 330, y: 200 },
      { x: 500, y: 110 },
      { x: 700, y: 200 },
      { x: 200, y: 480 },
      { x: 430, y: 500 },
      { x: 700, y: 480 }
    ],
    interactables: [
      { id: "f6_key", kind: "cabinet", x: 740, y: 230, label: "Mailbox", contains: "key" },
      { id: "f6_cash", kind: "cabinet", x: 90, y: 540, label: "Porch bench", contains: "cash" },
      { id: "f6_box", kind: "box", x: 60, y: 90, label: "Cardboard box", contains: null },
      { id: "f6_med", kind: "cabinet", x: 430, y: 380, label: "Utility box", contains: null },
      chest("f6_chest", "Locked chest", 700, 540)
    ],
    furniture: [
      { id: "f6_path", kind: "road", x: 400, y: 300, w: 736, h: 52 },
      { id: "f6_drive_pave", kind: "sidewalk", x: 220, y: 140, w: 150, h: 200 },
      { id: "f6_car1", kind: "car", x: 220, y: 90, w: 46, h: 84, solid: true },
      { id: "f6_bush1", kind: "bush", x: 60, y: 200, w: 30, h: 20 },
      { id: "f6_trash1", kind: "trashCan", x: 390, y: 60 },
      { id: "f6_tree1", kind: "tree", x: 590, y: 190, w: 44, h: 44, solid: true },
      { id: "f6_bush2", kind: "bush", x: 470, y: 200, w: 30, h: 20 },
      { id: "f6_lamp1", kind: "streetLamp", x: 700, y: 60 },
      { id: "f6_bench1", kind: "bench", x: 250, y: 380, w: 60, h: 16, solid: true },
      { id: "f6_bush3", kind: "bush", x: 300, y: 500, w: 30, h: 20 },
      { id: "f6_fence1", kind: "fence", x: 430, y: 550, w: 90, h: 16, solid: true },
      { id: "f6_car2", kind: "car", x: 590, y: 470, w: 46, h: 84, solid: true },
      { id: "f6_trash2", kind: "trashCan", x: 740, y: 380 }
    ],
    playerSpawn: SPAWN,
    catSpawn: { x: 330, y: 130 },
    exit: { type: "gate", x: 52, y: 470, roomKey: "porch" }
  },
  {
    floor: 7,
    name: "The Street",
    tint: 0x14161c,
    rooms: [
      { key: "street", name: "Street", x: 30, y: 30, w: 440, h: 230 },
      { key: "lot", name: "Parking Lot", x: 470, y: 30, w: 300, h: 230 },
      HALL,
      { key: "alley", name: "Alley", x: 30, y: 340, w: 280, h: 230 },
      { key: "backlot", name: "Backlot", x: 310, y: 340, w: 230, h: 230 },
      { key: "corner", name: "Corner", x: 540, y: 340, w: 230, h: 230 }
    ],
    connectors: [
      { x: 220, y: 248, w: 44, h: 42 },
      { x: 600, y: 248, w: 44, h: 42 },
      { x: 140, y: 308, w: 44, h: 42 },
      { x: 400, y: 308, w: 44, h: 42 },
      { x: 630, y: 308, w: 44, h: 42 }
    ],
    moneySpots: [
      { x: 110, y: 120 },
      { x: 350, y: 200 },
      { x: 560, y: 110 },
      { x: 720, y: 200 },
      { x: 150, y: 480 },
      { x: 420, y: 500 },
      { x: 650, y: 480 }
    ],
    interactables: [
      { id: "f7_key", kind: "cabinet", x: 100, y: 230, label: "Newspaper box", contains: "key" },
      { id: "f7_cash", kind: "cabinet", x: 700, y: 540, label: "Corner locker", contains: "cash" },
      { id: "f7_box", kind: "box", x: 60, y: 60, label: "Cardboard box", contains: null },
      { id: "f7_med", kind: "cabinet", x: 420, y: 380, label: "Utility box", contains: null },
      chest("f7_chest", "Locked chest", 150, 540)
    ],
    furniture: [
      // --- the road itself: asphalt down the hallway spine, dashed centre
      // line, crosswalks at each connector, sidewalks along both kerbs -----
      { id: "f7_road", kind: "road", x: 400, y: 300, w: 736, h: 56 },
      { id: "f7_centerline", kind: "roadLine", x: 400, y: 300, w: 700, h: 4 },
      { id: "f7_walk_top", kind: "sidewalk", x: 400, y: 268, w: 736, h: 10 },
      { id: "f7_walk_bot", kind: "sidewalk", x: 400, y: 332, w: 736, h: 10 },
      { id: "f7_cross1", kind: "crosswalk", x: 242, y: 300, w: 48, h: 52 },
      { id: "f7_cross2", kind: "crosswalk", x: 622, y: 300, w: 48, h: 52 },
      { id: "f7_cross3", kind: "crosswalk", x: 162, y: 300, w: 48, h: 52 },
      { id: "f7_cross4", kind: "crosswalk", x: 422, y: 300, w: 48, h: 52 },
      // --- parked cars along the kerbs and street furniture --------------
      { id: "f7_car1", kind: "car", x: 240, y: 80, w: 46, h: 84, solid: true },
      { id: "f7_car2", kind: "car", x: 380, y: 120, w: 46, h: 84, solid: true },
      { id: "f7_lamp1", kind: "streetLamp", x: 60, y: 180 },
      { id: "f7_trash1", kind: "trashCan", x: 440, y: 240 },
      { id: "f7_car3", kind: "car", x: 640, y: 80, w: 46, h: 84, solid: true },
      { id: "f7_bush1", kind: "bush", x: 510, y: 200, w: 30, h: 20 },
      { id: "f7_trash2", kind: "trashCan", x: 250, y: 400 },
      { id: "f7_fence1", kind: "fence", x: 220, y: 550, w: 90, h: 16, solid: true },
      { id: "f7_bench1", kind: "bench", x: 480, y: 400, w: 60, h: 16, solid: true },
      { id: "f7_tree1", kind: "tree", x: 570, y: 550, w: 40, h: 40, solid: true },
      { id: "f7_lamp2", kind: "streetLamp", x: 740, y: 380 }
    ],
    playerSpawn: SPAWN,
    catSpawn: { x: 350, y: 130 },
    exit: { type: "gate", x: 740, y: 150, roomKey: "lot" }
  },
  {
    floor: 8,
    name: "The Getaway",
    tint: 0x121c16,
    rooms: [
      { key: "park", name: "Park", x: 30, y: 30, w: 420, h: 230 },
      { key: "grove", name: "Grove", x: 450, y: 30, w: 320, h: 230 },
      HALL,
      { key: "trail", name: "Trail", x: 30, y: 340, w: 260, h: 230 },
      { key: "clearing", name: "Clearing", x: 290, y: 340, w: 250, h: 230 },
      { key: "pickup", name: "Pickup Lot", x: 540, y: 340, w: 230, h: 230 }
    ],
    connectors: [
      { x: 200, y: 248, w: 44, h: 42 },
      { x: 580, y: 248, w: 44, h: 42 },
      { x: 130, y: 308, w: 44, h: 42 },
      { x: 390, y: 308, w: 44, h: 42 },
      { x: 630, y: 308, w: 44, h: 42 }
    ],
    moneySpots: [
      { x: 110, y: 120 },
      { x: 350, y: 200 },
      { x: 560, y: 110 },
      { x: 720, y: 200 },
      { x: 150, y: 480 },
      { x: 420, y: 500 },
      { x: 580, y: 400 }
    ],
    interactables: [
      { id: "f8_key", kind: "cabinet", x: 100, y: 230, label: "Park locker", contains: "key" },
      { id: "f8_cash", kind: "cabinet", x: 60, y: 470, label: "Trail box", contains: "cash" },
      { id: "f8_box", kind: "box", x: 60, y: 60, label: "Cardboard box", contains: null },
      { id: "f8_med", kind: "cabinet", x: 400, y: 380, label: "Ranger box", contains: null },
      chest("f8_chest", "Locked chest", 740, 540)
    ],
    furniture: [
      { id: "f8_tree1", kind: "tree", x: 200, y: 70, w: 46, h: 46, solid: true },
      { id: "f8_tree2", kind: "tree", x: 300, y: 130, w: 42, h: 42, solid: true },
      { id: "f8_bench1", kind: "bench", x: 110, y: 180, w: 60, h: 16, solid: true },
      { id: "f8_pond", kind: "pond", x: 400, y: 80, w: 78, h: 52, solid: true },
      { id: "f8_tree3", kind: "tree", x: 640, y: 180, w: 46, h: 46, solid: true },
      { id: "f8_bush1", kind: "bush", x: 500, y: 60, w: 30, h: 20 },
      { id: "f8_bush2", kind: "bush", x: 740, y: 60, w: 30, h: 20 },
      { id: "f8_tree4", kind: "tree", x: 230, y: 400, w: 42, h: 42, solid: true },
      { id: "f8_bush3", kind: "bush", x: 70, y: 550, w: 30, h: 20 },
      { id: "f8_picnic", kind: "picnicTable", x: 330, y: 480, w: 66, h: 38, solid: true },
      { id: "f8_lamp1", kind: "streetLamp", x: 500, y: 400 },
      { id: "f8_trash1", kind: "trashCan", x: 560, y: 550 }
    ],
    playerSpawn: SPAWN,
    catSpawn: { x: 350, y: 130 },
    exit: { type: "van", x: 690, y: 470, roomKey: "pickup" }
  }
];

// ---------------------------------------------------------------------------
// Design-space (800x600) -> world-space (16:9) transform, applied once at load.
// Rooms tile exactly in design space, and scaling x/w and y/h by the same
// factors preserves that tiling, so walls and doorways still line up. Discrete
// props scale uniformly (a bed shouldn't stretch); pieces that span a wall or
// the ground scale on each axis so they still span it.
// ---------------------------------------------------------------------------
const SPANNING: ReadonlySet<FurnitureKind> = new Set<FurnitureKind>([
  "rug",
  "road",
  "roadLine",
  "crosswalk",
  "sidewalk",
  "fence",
  "counter",
  "shelving"
]);

function scaleRect<T extends Rect>(r: T): T {
  return {
    ...r,
    x: r.x * SCALE_X,
    y: r.y * SCALE_Y,
    w: r.w * SCALE_X,
    h: r.h * SCALE_Y
  };
}

function scalePoint<T extends { x: number; y: number }>(p: T): T {
  return { ...p, x: p.x * SCALE_X, y: p.y * SCALE_Y };
}

function scaleFurniture(f: FurnitureDef): FurnitureDef {
  const spanning = SPANNING.has(f.kind);
  const sw = spanning ? SCALE_X : SCALE_OBJ;
  const sh = spanning ? SCALE_Y : SCALE_OBJ;
  return {
    ...f,
    x: f.x * SCALE_X,
    y: f.y * SCALE_Y,
    w: f.w === undefined ? undefined : f.w * sw,
    h: f.h === undefined ? undefined : f.h * sh,
    fw: f.fw === undefined ? undefined : f.fw * sw,
    fh: f.fh === undefined ? undefined : f.fh * sh
  };
}

function scaleLayout(l: FloorLayout): FloorLayout {
  return {
    ...l,
    rooms: l.rooms.map(scaleRect),
    // Keep doorway openings a sensible width rather than stretching them 1.6x:
    // scale the centre, then re-centre a proportionally sized gap.
    connectors: l.connectors.map((c) => {
      const cx = (c.x + c.w / 2) * SCALE_X;
      const cy = (c.y + c.h / 2) * SCALE_Y;
      const w = c.w * SCALE_OBJ;
      const h = c.h * SCALE_Y;
      return { x: cx - w / 2, y: cy - h / 2, w, h };
    }),
    moneySpots: l.moneySpots.map(scalePoint),
    interactables: l.interactables.map(scalePoint),
    furniture: l.furniture?.map(scaleFurniture),
    playerSpawn: scalePoint(l.playerSpawn),
    catSpawn: scalePoint(l.catSpawn),
    exit: scalePoint(l.exit)
  };
}

export const FLOORS: FloorLayout[] = DESIGN_FLOORS.map(scaleLayout);

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
  const cols = Math.ceil(WORLD_W / TILE);
  const rows = Math.ceil(WORLD_H / TILE);
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
