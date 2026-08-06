import type { FurnitureKind } from "../house/houseLayout";

// ---------------------------------------------------------------------------
// Material and volume tables.
//
// The flat renderer only ever needed a colour per thing. An isometric renderer
// additionally needs to know how TALL everything is, because height is what
// creates the read of depth. These tables are the single source of truth for
// that, kept separate from the drawing code so a designer can retune the look
// without reading a line of rendering logic.
//
// Heights are in world units on the same scale as x/y. A room wall is 34, so a
// fridge at 34 is exactly wall height and a coffee table at 8 is ankle height.
// ---------------------------------------------------------------------------

/**
 * Wall height for interior rooms.
 *
 * Deliberately low. A horizontal wall in an isometric view rises UP the screen,
 * so it covers the bottom of whatever room sits behind it. At 34 units the
 * interior walls formed a canyon that buried the player; at 20 they still read
 * clearly as walls while occluding only about 14px of the room beyond.
 */
export const WALL_H = 20;
/** Height of the near-side wall lip. Low enough to see over into the room. */
export const WALL_LIP_H = 6;
/** Perimeter (outer building) wall, taller so the house reads as enclosed. */
export const PERIMETER_H = 40;

/**
 * Extrusion height per furniture kind. A height of 0 means the piece is a
 * decal: it is painted flat onto the floor and never sorts as a volume.
 */
export const FURNITURE_HEIGHT: Record<FurnitureKind, number> = {
  // --- seating and tables ---
  couch: 17,
  coffeeTable: 9,
  tvStand: 13,
  diningTable: 15,
  sideTable: 13,
  bench: 11,
  picnicTable: 15,
  // --- kitchen ---
  counter: 19,
  stove: 19,
  fridge: 36,
  // --- bedroom ---
  bed: 13,
  dresser: 24,
  nightstand: 13,
  // --- bathroom ---
  bathtub: 13,
  toilet: 15,
  sink: 17,
  // --- storage and misc ---
  shelving: 33,
  coatRack: 31,
  clutter: 5,
  plant: 19,
  lamp: 27,
  // --- wall-mounted: elevated decals, not volumes ---
  wallArt: 0,
  framedPictures: 0,
  mirror: 0,
  // --- floor decals ---
  rug: 0,
  // --- outdoor volumes ---
  tree: 50,
  bush: 13,
  car: 21,
  trashCan: 17,
  shed: 42,
  fence: 21,
  streetLamp: 46,
  // --- outdoor decals ---
  pond: 0,
  road: 0,
  roadLine: 0,
  crosswalk: 0,
  sidewalk: 0
};

/** Pieces drawn flat on the floor plane, painted into the static floor layer. */
export const FLOOR_DECALS: ReadonlySet<FurnitureKind> = new Set<FurnitureKind>([
  "rug",
  "pond",
  "road",
  "roadLine",
  "crosswalk",
  "sidewalk"
]);

/** Pieces mounted on a wall: drawn as flat panels lifted to eye height. */
export const WALL_MOUNTED: ReadonlySet<FurnitureKind> = new Set<FurnitureKind>([
  "wallArt",
  "framedPictures",
  "mirror"
]);

/** Kinds whose silhouette reads better as a cylinder than a box. */
export const ROUND_KINDS: ReadonlySet<FurnitureKind> = new Set<FurnitureKind>([
  "trashCan",
  "plant",
  "lamp",
  "streetLamp",
  "bush"
]);

// ---------------------------------------------------------------------------
// Floor materials
// ---------------------------------------------------------------------------

export type FloorMaterial =
  | "hardwood"
  | "marble"
  | "carpet"
  | "tile"
  | "concrete"
  | "grass"
  | "asphalt";

export interface MaterialSpec {
  /** Base fill. */
  base: number;
  /** Secondary tone used for planks, grout lines or pile variation. */
  detail: number;
  /** 0 = matte, 1 = mirror. Drives the strength of the specular sheen. */
  gloss: number;
  /** World-unit spacing of the repeating pattern. 0 disables patterning. */
  grain: number;
  /** Pattern orientation: planks run along one axis, tiles use both. */
  pattern: "planks" | "grid" | "pile" | "none";
}

export const MATERIALS: Record<FloorMaterial, MaterialSpec> = {
  hardwood: { base: 0x503926, detail: 0x6a4d33, gloss: 0.55, grain: 22, pattern: "planks" },
  marble: { base: 0x424f5e, detail: 0x556475, gloss: 0.85, grain: 34, pattern: "grid" },
  carpet: { base: 0x453a4a, detail: 0x51445a, gloss: 0.05, grain: 15, pattern: "pile" },
  tile: { base: 0x3c4450, detail: 0x4a5462, gloss: 0.45, grain: 28, pattern: "grid" },
  concrete: { base: 0x3f434c, detail: 0x4a4f59, gloss: 0.18, grain: 46, pattern: "grid" },
  grass: { base: 0x2c5236, detail: 0x376542, gloss: 0.0, grain: 18, pattern: "pile" },
  asphalt: { base: 0x393c44, detail: 0x44474f, gloss: 0.12, grain: 0, pattern: "none" }
};

/**
 * Map a room to its floor material. Room keys are stable across all ten levels
 * (they drive the existing layout data), so keying off them keeps the material
 * assignment declarative rather than hand-placed per level.
 */
export function materialForRoom(roomKey: string, isOutdoor: boolean): FloorMaterial {
  if (isOutdoor) {
    if (/street|road|drive|lot|park(ing)?/i.test(roomKey)) return "asphalt";
    if (/patio|path|walk|yard.*stone/i.test(roomKey)) return "concrete";
    return "grass";
  }
  if (/bath|wash|toilet|shower/i.test(roomKey)) return "marble";
  if (/bed|nursery|guest|master/i.test(roomKey)) return "hardwood";
  if (/hall|corridor|landing|stair/i.test(roomKey)) return "carpet";
  if (/kitchen|pantry|dining|utility/i.test(roomKey)) return "tile";
  if (/vault|safe|security|server|office|study/i.test(roomKey)) return "concrete";
  if (/garage|basement|cellar|attic|shed|store/i.test(roomKey)) return "concrete";
  return "hardwood";
}

/** Levels 5 and up are the outdoor chase. */
export function isOutdoorFloor(floor: number): boolean {
  return floor >= 5;
}
