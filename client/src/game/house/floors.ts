import { CollisionMap } from "../CollisionMap";
import {
  CHEST_KEY_ID,
  TILE,
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
    playerSpawn: SPAWN,
    catSpawn: { x: 290, y: 130 },
    exit: { type: "door", x: 690, y: 430, roomKey: "mud" }
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
    playerSpawn: SPAWN,
    catSpawn: { x: 410, y: 170 },
    exit: { type: "stairs", x: 670, y: 130, roomKey: "nursery" }
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
    playerSpawn: SPAWN,
    catSpawn: { x: 590, y: 130 },
    exit: { type: "stairs", x: 130, y: 470, roomKey: "cellar" }
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
    playerSpawn: SPAWN,
    catSpawn: { x: 430, y: 170 },
    exit: { type: "window", x: 430, y: 70, roomKey: "attic" }
  }
];

export function getFloorLayout(floor: number): FloorLayout {
  const idx = Math.max(0, Math.min(FLOORS.length - 1, floor - 1));
  return FLOORS[idx];
}

const ROOM_INSET = 6;

function layoutWalkableRects(layout: FloorLayout): Rect[] {
  return [
    ...layout.rooms.map((r) => ({
      x: r.x + ROOM_INSET,
      y: r.y + ROOM_INSET,
      w: r.w - ROOM_INSET * 2,
      h: r.h - ROOM_INSET * 2
    })),
    ...layout.connectors.map((c) => ({
      ...c,
      x: c.x + 2,
      y: c.y + 2,
      w: Math.max(8, c.w - 4),
      h: Math.max(8, c.h - 4)
    }))
  ];
}

export function isWalkableInLayout(layout: FloorLayout, x: number, y: number): boolean {
  for (const r of layoutWalkableRects(layout)) {
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true;
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
      grid[row][col] = isWalkableInLayout(layout, cx, cy);
    }
  }
  return new CollisionMap(TILE, TILE, grid);
}
