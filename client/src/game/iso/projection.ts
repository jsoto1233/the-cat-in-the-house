import { WORLD_H, WORLD_W } from "../house/houseLayout";

// ---------------------------------------------------------------------------
// Isometric projection core.
//
// ARCHITECTURAL RULE — read before touching anything downstream:
//
//   The SIMULATION stays Cartesian. Collision, A* pathfinding, pickup radii,
//   catch radii, level authoring and the multiplayer protocol all continue to
//   work in the flat (x, y) world space they always have. Nothing about the
//   game's logic knows this file exists.
//
//   The PROJECTION happens at render time only. A world position is converted
//   to screen coordinates when it is drawn, and screen input is converted back
//   to a world direction when it is read. That is the entire boundary.
//
// Keeping that split is what lets us ship a completely different look without
// re-authoring ten verified levels or touching the netcode. It is also how real
// isometric engines are built: the world is a grid, the camera is a lie.
// ---------------------------------------------------------------------------

/**
 * Base dimetric ratios. 2:1 (KY = KX / 2) is deliberately chosen over "true"
 * 30-degree isometric (which needs a 1.1547 ratio) because 2:1 keeps tile
 * boundaries on clean half-pixel steps. True iso produces fractional vertical
 * steps that shimmer when anything moves sub-pixel.
 */
export const ISO_KX = 0.5;
export const ISO_KY = 0.25;

/** Screen pixels of lift per unit of world elevation (z). */
export const ISO_KZ = 0.62;

/** Tallest thing we ever draw, in world z units. Reserves camera headroom. */
export const MAX_ELEVATION = 64;

/** Padding, in screen px, between the projected world and the canvas edge. */
const FIT_PADDING = 48;

// --- Projected bounds of the whole world -----------------------------------
// The four corners of the world rectangle project to a diamond. We need its
// axis-aligned bounding box to work out the fit scale and centring offset.

function rawIso(wx: number, wy: number) {
  return { x: (wx - wy) * ISO_KX, y: (wx + wy) * ISO_KY };
}

const CORNERS = [
  rawIso(0, 0),
  rawIso(WORLD_W, 0),
  rawIso(0, WORLD_H),
  rawIso(WORLD_W, WORLD_H)
];

const RAW_MIN_X = Math.min(...CORNERS.map((c) => c.x));
const RAW_MAX_X = Math.max(...CORNERS.map((c) => c.x));
const RAW_MIN_Y = Math.min(...CORNERS.map((c) => c.y));
const RAW_MAX_Y = Math.max(...CORNERS.map((c) => c.y));

const RAW_W = RAW_MAX_X - RAW_MIN_X;
/** Elevation lifts geometry upward, so the drawn band is taller than the floor. */
const RAW_H = RAW_MAX_Y - RAW_MIN_Y + MAX_ELEVATION * ISO_KZ;

/**
 * Uniform scale that makes the entire projected world fit the canvas. This is
 * the "tactical" framing — the whole floorplan visible at once. Gameplay zooms
 * in from here (see CameraRig.ZOOM_DEFAULT).
 */
export const ISO_FIT = Math.min(
  (WORLD_W - FIT_PADDING * 2) / RAW_W,
  (WORLD_H - FIT_PADDING * 2) / RAW_H
);

/** Offsets that centre the projected diamond in the canvas. */
const OFF_X = WORLD_W / 2 - ((RAW_MIN_X + RAW_MAX_X) / 2) * ISO_FIT;
const OFF_Y =
  WORLD_H / 2 - ((RAW_MIN_Y + RAW_MAX_Y) / 2) * ISO_FIT + (MAX_ELEVATION * ISO_KZ * ISO_FIT) / 2;

/** Effective per-axis scale after fitting. Exported for sprite sizing. */
export const KX = ISO_KX * ISO_FIT;
export const KY = ISO_KY * ISO_FIT;
export const KZ = ISO_KZ * ISO_FIT;

export interface IsoPoint {
  x: number;
  y: number;
}

/**
 * World (x, y, z) -> screen. `z` is elevation above the floor plane in world
 * units; positive z moves the point UP the screen.
 */
export function toIso(wx: number, wy: number, wz = 0): IsoPoint {
  return {
    x: (wx - wy) * KX + OFF_X,
    y: (wx + wy) * KY - wz * KZ + OFF_Y
  };
}

/**
 * Screen -> world, assuming the point lies on the plane at elevation `wz`.
 * Exact inverse of toIso. Used for pointer picking and for verifying the
 * transform round-trips (see the iso verifier).
 *
 * Derivation: from sx = (wx - wy)·KX and sy = (wx + wy)·KY, adding and
 * subtracting the two gives wx and wy directly.
 */
export function fromIso(sx: number, sy: number, wz = 0): IsoPoint {
  const a = (sx - OFF_X) / KX; // = wx - wy
  const b = (sy - OFF_Y + wz * KZ) / KY; // = wx + wy
  return { x: (b + a) / 2, y: (b - a) / 2 };
}

// --- Depth sorting ---------------------------------------------------------

/**
 * Depth units allocated per world unit of distance.
 *
 * This MUST exceed the total span of DepthBias (currently 5, from -2 to +3).
 * If it does not, a decal one world unit nearer the viewer can sort behind a
 * distant overlay, because the bias overpowers the real separation. Verified
 * by the iso verifier rather than left as a comment.
 */
const DEPTH_PER_UNIT = 16;

/**
 * Painter's-algorithm sort key. Larger draws later (on top).
 *
 * Sorting on (wx + wy) is the whole trick: that value is constant along every
 * screen-horizontal line, and increases as things move toward the viewer, so it
 * is exactly "distance from the camera" in a dimetric projection.
 *
 * `bias` breaks ties deterministically between things sharing a tile. Without
 * it, co-planar objects swap order frame to frame and visibly flicker.
 */
export function depthOf(wx: number, wy: number, bias = 0): number {
  return (wx + wy) * DEPTH_PER_UNIT + bias;
}

/**
 * Highest depth any world geometry can reach. Screen-space UI (vignette,
 * prompts, debug overlay) must sit above this, and does.
 */
export const MAX_WORLD_DEPTH = (WORLD_W + WORLD_H) * DEPTH_PER_UNIT;

/**
 * Standard depth biases, so the layering rules live in one place. Typed as
 * plain numbers rather than `as const` literals so they can be passed to any
 * function taking a numeric bias.
 */
export const DepthBias: Record<"DECAL" | "PROP" | "LOOT" | "ACTOR" | "OVERLAY", number> = {
  /** Road paint, rugs, scratch marks — always under everything on their tile. */
  DECAL: -2,
  /** Default for props and furniture. */
  PROP: 0,
  /** Loot tokens sit just above the floor so a rug never hides a coin. */
  LOOT: 1,
  /** Characters draw over props they share a tile with. */
  ACTOR: 2,
  /** Floating UI pinned to a world position (prompts, name tags). */
  OVERLAY: 3
};

/**
 * Depth for a prop occupying a footprint centred on (cx, cy).
 *
 * Centre-sorting is deliberate. Sorting by the nearest corner makes a long prop
 * draw over anything beside it; sorting by the far corner makes the player clip
 * through its front edge. The centre is correct whenever the player is properly
 * in front of or behind the prop, and only approximates alongside it — which is
 * the case where the error is least visible.
 */
export function depthOfCentre(cx: number, cy: number, bias = DepthBias.PROP): number {
  return depthOf(cx, cy, bias);
}

/**
 * Depth for geometry that must never be drawn over by things in front of it,
 * such as a wall slab. Sorts by the nearest corner.
 */
export function depthOfNearEdge(
  x: number,
  y: number,
  w: number,
  h: number,
  bias = DepthBias.PROP
): number {
  return depthOf(x + w, y + h, bias);
}

// --- Screen-relative movement basis ----------------------------------------
//
// Players expect "press right, move right on screen". In a dimetric projection
// the world axes are rotated 45 degrees on screen, so raw WASD would send the
// player diagonally. These basis vectors rotate input into world space.
//
// Solving for the world direction that produces pure screen-right (dsy = 0)
// gives (1, -1); pure screen-down (dsx = 0) gives (1, 1). Both normalised.

const INV_SQRT2 = Math.SQRT1_2;

/** World-space direction that appears as "right" on screen. */
export const SCREEN_RIGHT = { x: INV_SQRT2, y: -INV_SQRT2 };
/** World-space direction that appears as "down" on screen. */
export const SCREEN_DOWN = { x: INV_SQRT2, y: INV_SQRT2 };

/**
 * Rotate a screen-space input vector (ix right, iy down, each -1..1) into a
 * normalised world-space direction. Returns a zero vector for no input.
 */
export function inputToWorld(ix: number, iy: number): IsoPoint {
  if (ix === 0 && iy === 0) return { x: 0, y: 0 };
  const wx = SCREEN_RIGHT.x * ix + SCREEN_DOWN.x * iy;
  const wy = SCREEN_RIGHT.y * ix + SCREEN_DOWN.y * iy;
  const len = Math.hypot(wx, wy);
  return len === 0 ? { x: 0, y: 0 } : { x: wx / len, y: wy / len };
}

// --- Tile geometry ---------------------------------------------------------

/**
 * Screen half-extents of one world unit square, used to size diamond tiles.
 * A world-space AABB of w x h projects to a diamond whose horizontal radius is
 * (w + h)·KX/2 and vertical radius is (w + h)·KY/2.
 */
export function diamondExtents(w: number, h: number) {
  return { rx: (w + h) * KX * 0.5, ry: (w + h) * KY * 0.5 };
}

/**
 * The four screen corners of a world-space axis-aligned rectangle, in draw
 * order (top, right, bottom, left of the resulting diamond).
 */
export function rectCorners(x: number, y: number, w: number, h: number, z = 0): IsoPoint[] {
  return [
    toIso(x, y, z), // top
    toIso(x + w, y, z), // right
    toIso(x + w, y + h, z), // bottom
    toIso(x, y + h, z) // left
  ];
}

/** Flattens corner points into the number[] Phaser's polygon API expects. */
export function flatten(pts: IsoPoint[]): number[] {
  const out: number[] = [];
  for (const p of pts) out.push(p.x, p.y);
  return out;
}
