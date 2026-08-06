import Phaser from "phaser";
import { isWalkableInLayout, type FloorLayout } from "../house/floors";
import { TILE, WORLD_H, WORLD_W } from "../house/houseLayout";
import { fillPrism } from "./isoDraw";
import { PERIMETER_H, WALL_H, WALL_LIP_H } from "./isoMaterials";
import { DepthBias, depthOf } from "./projection";

// ---------------------------------------------------------------------------
// Walls, derived from the collision grid.
//
// WHY NOT FROM ROOM RECTANGLES. The first version drew walls on the room
// boundaries and it produced two bugs that looked like one:
//
//   1. Walls did not match collision. Walkable space is each room rect inset by
//      ROOM_INSET (12 units), so the real blocked band between two rooms is
//      about 36 units wide, while the drawn wall was 6. The player stopped ~9
//      units short of the visible wall (an invisible barrier) and, going the
//      other way, could stand on floor that was drawn inside the wall band —
//      which reads exactly like clipping through the wall.
//
//   2. Long walls sorted wrong. A wall spanning x from 100 to 700 was one
//      object sorted by its far corner, so its depth was enormous and it drew
//      on top of everything in the room, including the player. That is the
//      "character rendered inside the wall" in the bug report.
//
// Both vanish if the wall geometry IS the collision data. Here every blocked
// tile adjacent to walkable space becomes wall geometry, and runs are merged
// only up to MAX_RUN tiles so each segment keeps a depth that is honest about
// where it sits. You cannot walk through a wall you can see, because the thing
// you can see is the thing the collision map is blocking.
// ---------------------------------------------------------------------------

/**
 * Longest merged wall segment, in tiles.
 *
 * This is the accuracy/performance dial. Longer runs mean fewer draw calls but
 * a coarser depth value, because one segment carries a single sort key across
 * its whole length. Three tiles (60 world units, ~35 screen px) keeps the sort
 * error below the width of a character sprite, which is the point at which
 * mis-sorting becomes visible.
 */
const MAX_RUN = 3;

/** How far from walkable space a blocked tile can be and still be drawn. */
const WALL_BAND_TILES = 2;

export interface WallSegment {
  x: number;
  y: number;
  w: number;
  h: number;
  height: number;
  tall: boolean;
}

const COLS = Math.ceil(WORLD_W / TILE);
const ROWS = Math.ceil(WORLD_H / TILE);

/**
 * Compute wall segments for a layout. Pure — no Phaser, no side effects — so
 * the verifier can assert against exactly what the renderer will draw.
 */
export function computeWallSegments(layout: FloorLayout): WallSegment[] {
  const walk = (c: number, r: number): boolean => {
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return false;
    // Rooms and doorways only. Solid FURNITURE is also baked into the real
    // collision map, but furniture draws itself — walling it too would bury
    // every couch in a stone block.
    return isWalkableInLayout(layout, c * TILE + TILE / 2, r * TILE + TILE / 2);
  };

  /** Steps to the nearest walkable tile along a direction, or Infinity. */
  const reach = (c: number, r: number, dc: number, dr: number): number => {
    for (let k = 1; k <= WALL_BAND_TILES; k++) {
      if (walk(c + dc * k, r + dr * k)) return k;
    }
    return Infinity;
  };

  // -1 = not a wall, 0 = lip, 1 = tall
  const kind: Int8Array = new Int8Array(COLS * ROWS).fill(-1);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (walk(c, r)) continue;

      // Distance to walkable space on the camera-FAR side (north/west) and the
      // camera-NEAR side (south/east).
      const far = Math.min(reach(c, r, 0, -1), reach(c, r, -1, 0));
      const near = Math.min(reach(c, r, 0, 1), reach(c, r, 1, 0));
      if (!isFinite(far) && !isFinite(near)) continue; // open void, not a wall

      // A tall wall rises UP the screen, which is toward smaller x + y. So it
      // covers whatever lies to its north/west. It is therefore only safe to
      // build tall when the room it serves is on the NEAR side; when a room
      // sits behind it, the wall must stay a lip or it hides that room.
      kind[r * COLS + c] = near < far ? 1 : 0;
    }
  }

  const used = new Uint8Array(COLS * ROWS);
  const out: WallSegment[] = [];
  const at = (c: number, r: number) => kind[r * COLS + c];

  const push = (c0: number, r0: number, cw: number, ch: number, tall: boolean) => {
    // Perimeter walls (those with open void behind them) get extra height so
    // the building reads as enclosed rather than as a floating slab.
    const outer = !walk(c0 - 1, r0) && !walk(c0, r0 - 1) && tall;
    out.push({
      x: c0 * TILE,
      y: r0 * TILE,
      w: cw * TILE,
      h: ch * TILE,
      height: tall ? (outer ? PERIMETER_H : WALL_H) : WALL_LIP_H,
      tall
    });
  };

  // --- pass 1: merge horizontal runs ---
  for (let r = 0; r < ROWS; r++) {
    let c = 0;
    while (c < COLS) {
      const k = at(c, r);
      if (k < 0 || used[r * COLS + c]) {
        c++;
        continue;
      }
      let len = 1;
      while (
        len < MAX_RUN &&
        c + len < COLS &&
        at(c + len, r) === k &&
        !used[r * COLS + c + len]
      ) {
        len++;
      }
      // A single tile is left for the vertical pass, which may find a longer
      // run through it and produce fewer, cleaner segments.
      if (len === 1) {
        c++;
        continue;
      }
      for (let i = 0; i < len; i++) used[r * COLS + c + i] = 1;
      push(c, r, len, 1, k === 1);
      c += len;
    }
  }

  // --- pass 2: merge whatever is left, vertically ---
  for (let c = 0; c < COLS; c++) {
    let r = 0;
    while (r < ROWS) {
      const k = at(c, r);
      if (k < 0 || used[r * COLS + c]) {
        r++;
        continue;
      }
      let len = 1;
      while (
        len < MAX_RUN &&
        r + len < ROWS &&
        at(c, r + len) === k &&
        !used[(r + len) * COLS + c]
      ) {
        len++;
      }
      for (let i = 0; i < len; i++) used[(r + i) * COLS + c] = 1;
      push(c, r, 1, len, k === 1);
      r += len;
    }
  }

  return out;
}

/**
 * Draw the wall segments.
 *
 * Each segment is its own Graphics with its own depth, which is the entire
 * point: a player standing in front of a three-tile wall chunk sorts ahead of
 * that chunk and behind the chunk further up the room.
 */
export function buildIsoWalls(
  scene: Phaser.Scene,
  layout: FloorLayout,
  wallColor: number,
  capColor: number
): WallSegment[] {
  const segments = computeWallSegments(layout);

  for (const s of segments) {
    const g = scene.add.graphics();
    fillPrism(g, s.x, s.y, s.w, s.h, s.height, wallColor, {
      topColor: capColor,
      shadow: false,
      bevel: s.tall,
      ao: 0.4,
      outlineColor: 0x24222f
    });
    // Sort by the segment's nearest corner. Walls are geometry the player walks
    // AROUND, never through, so anything whose centre is nearer the camera than
    // this corner genuinely is in front of it.
    g.setDepth(depthOf(s.x + s.w, s.y + s.h, DepthBias.PROP));
  }

  return segments;
}
