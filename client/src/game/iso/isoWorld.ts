import Phaser from "phaser";
import type { FloorExit, FloorLayout } from "../house/floors";
import { PALETTE, WORLD, type Rect, type Room } from "../house/houseLayout";
import {
  MATERIALS,
  PERIMETER_H,
  WALL_H,
  WALL_LIP_H,
  isOutdoorFloor,
  materialForRoom,
  type FloorMaterial
} from "./isoMaterials";
import {
  fillCylinder,
  fillDiamond,
  fillPrism,
  fillShadow,
  mix,
  shade,
  strokeDiamond
} from "./isoDraw";
import { DepthBias, depthOf, toIso } from "./projection";

// ---------------------------------------------------------------------------
// Isometric world renderer: ground, floors, walls, doorways and the exit.
//
// DOLLHOUSE CUTAWAY. A room enclosed by four full-height walls is unplayable in
// isometric — the two walls nearest the camera hide everything inside. The
// standard solution, and the one used here, is asymmetric: the two FAR walls
// (north and west, the ones with smaller x + y) are drawn full height, and the
// two NEAR walls are drawn as a low lip. The room still reads as enclosed, but
// you can always see in. This is why the game needs no dynamic wall-fading for
// interiors, which is a large amount of per-frame work avoided.
// ---------------------------------------------------------------------------

/** Thickness of a wall slab in world units. */
const WALL_T = 6;

export interface IsoWorldResult {
  backDoor: { x: number; y: number };
  escapeMarker: Phaser.GameObjects.Container;
  /** Static geometry layer, so callers can dispose of it on floor change. */
  ground: Phaser.GameObjects.Graphics;
}

// --- deterministic noise ---------------------------------------------------

/**
 * Hash-based pseudo-random in [0, 1). Deterministic for a given seed so floor
 * texturing is identical every time a level is built — a Math.random() texture
 * would shimmer differently on each retry of the same level.
 */
function rand(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// --- floor materials -------------------------------------------------------

/**
 * Paint one room's floor: base fill, material pattern, specular sheen, and a
 * soft inner shadow where the floor meets the walls.
 */
function paintFloor(
  g: Phaser.GameObjects.Graphics,
  room: Rect,
  material: FloorMaterial,
  tint: number
) {
  const m = MATERIALS[material];
  const base = mix(m.base, tint, 0.22);
  const detail = mix(m.detail, tint, 0.22);

  fillDiamond(g, room.x, room.y, room.w, room.h, base, 1);

  // --- repeating pattern ---
  if (m.pattern === "planks") {
    // Planks run along x, so the seams are lines of constant y.
    for (let y = room.y + m.grain; y < room.y + room.h; y += m.grain) {
      fillDiamond(g, room.x, y - 0.6, room.w, 1.2, detail, 0.5);
      // Occasional butt joint breaks the run so it doesn't read as stripes.
      const seed = Math.round(y * 7 + room.x);
      const bx = room.x + rand(seed) * room.w * 0.8;
      fillDiamond(g, bx, y - m.grain, 1.2, m.grain, detail, 0.32);
    }
  } else if (m.pattern === "grid") {
    for (let y = room.y + m.grain; y < room.y + room.h; y += m.grain) {
      fillDiamond(g, room.x, y - 0.5, room.w, 1, detail, 0.55);
    }
    for (let x = room.x + m.grain; x < room.x + room.w; x += m.grain) {
      fillDiamond(g, x - 0.5, room.y, 1, room.h, detail, 0.55);
    }
  } else if (m.pattern === "pile") {
    // Scattered short dashes read as carpet pile or grass tufts.
    const count = Math.floor((room.w * room.h) / (m.grain * m.grain * 1.6));
    for (let i = 0; i < count; i++) {
      const s = i * 3 + Math.round(room.x * 13 + room.y * 7);
      const px = room.x + rand(s) * room.w;
      const py = room.y + rand(s + 1) * room.h;
      const len = 3 + rand(s + 2) * 5;
      fillDiamond(g, px, py, len, 1.4, detail, 0.3 + rand(s + 3) * 0.25);
    }
  }

  // --- specular sheen ---
  // A broad soft highlight offset toward the key light (upper left). Only
  // glossy materials get it; carpet and grass stay matte.
  if (m.gloss > 0.3) {
    const sw = room.w * 0.5;
    const sh = room.h * 0.42;
    const sx = room.x + room.w * 0.06;
    const sy = room.y + room.h * 0.08;
    for (let i = 3; i >= 1; i--) {
      const t = i / 3;
      fillDiamond(g, sx, sy, sw * t, sh * t, 0xffffff, m.gloss * 0.035 * (1.4 - t));
    }
  }

  // --- inner shadow at the wall line ---
  // Grounds the floor against the walls. Strongest on the far edges, which is
  // where the geometry actually occludes light.
  const IN = 9;
  for (let i = 0; i < 3; i++) {
    const a = 0.1 - i * 0.03;
    const o = i * (IN / 3);
    fillDiamond(g, room.x, room.y + o, room.w, 1.8, 0x000000, a);
    fillDiamond(g, room.x + o, room.y, 1.8, room.h, 0x000000, a * 0.8);
  }
}

// --- wall construction -----------------------------------------------------

type Span = { a: number; b: number };

/**
 * Remove doorway gaps from a wall run, returning the solid pieces that remain.
 * Doorways are authored as connector rectangles that straddle a wall line, so a
 * wall is built by subtracting every connector that crosses it.
 */
function subtractSpans(a: number, b: number, gaps: Span[]): Span[] {
  let runs: Span[] = [{ a, b }];
  for (const gap of gaps) {
    const next: Span[] = [];
    for (const r of runs) {
      if (gap.b <= r.a || gap.a >= r.b) {
        next.push(r); // no overlap
        continue;
      }
      if (gap.a > r.a) next.push({ a: r.a, b: gap.a });
      if (gap.b < r.b) next.push({ a: gap.b, b: r.b });
    }
    runs = next;
  }
  return runs.filter((r) => r.b - r.a > 1.5);
}

/** Connector spans that cut the horizontal wall line y = lineY. */
function gapsOnHorizontal(connectors: Rect[], lineY: number, pad = 3): Span[] {
  return connectors
    .filter((c) => c.y - pad <= lineY && lineY <= c.y + c.h + pad)
    .map((c) => ({ a: c.x - 1, b: c.x + c.w + 1 }));
}

/** Connector spans that cut the vertical wall line x = lineX. */
function gapsOnVertical(connectors: Rect[], lineX: number, pad = 3): Span[] {
  return connectors
    .filter((c) => c.x - pad <= lineX && lineX <= c.x + c.w + pad)
    .map((c) => ({ a: c.y - 1, b: c.y + c.h + 1 }));
}

/**
 * Draw all four walls of a room. Far walls (north, west) are full height; near
 * walls (south, east) are a low lip so the interior stays visible.
 */
function buildRoomWalls(
  scene: Phaser.Scene,
  room: Room,
  connectors: Rect[],
  wallColor: number,
  capColor: number
) {
  const half = WALL_T / 2;

  const put = (x: number, y: number, w: number, h: number, height: number) => {
    const g = scene.add.graphics();
    fillPrism(g, x, y, w, h, height, wallColor, {
      topColor: capColor,
      shadow: false,
      ao: 0.4,
      outlineColor: 0x1a1a26
    });
    // Sort by the wall's nearest edge so props in front of it draw over it.
    g.setDepth(depthOf(x + w, y + h, DepthBias.PROP));
  };

  // --- far walls: full height ---
  for (const s of subtractSpans(
    room.x,
    room.x + room.w,
    gapsOnHorizontal(connectors, room.y)
  )) {
    put(s.a, room.y - half, s.b - s.a, WALL_T, WALL_H);
  }
  for (const s of subtractSpans(room.y, room.y + room.h, gapsOnVertical(connectors, room.x))) {
    put(room.x - half, s.a, WALL_T, s.b - s.a, WALL_H);
  }

  // --- near walls: low lip ---
  for (const s of subtractSpans(
    room.x,
    room.x + room.w,
    gapsOnHorizontal(connectors, room.y + room.h)
  )) {
    put(s.a, room.y + room.h - half, s.b - s.a, WALL_T, WALL_LIP_H);
  }
  for (const s of subtractSpans(
    room.y,
    room.y + room.h,
    gapsOnVertical(connectors, room.x + room.w)
  )) {
    put(room.x + room.w - half, s.a, WALL_T, s.b - s.a, WALL_LIP_H);
  }
}

/** Doorway trim: a frame around each connector so gaps read as intentional. */
function buildDoorways(scene: Phaser.Scene, connectors: Rect[], wood: number) {
  for (const c of connectors) {
    const g = scene.add.graphics();
    const horizontal = c.w >= c.h;
    // Jambs on either side of the opening, standing to wall height.
    if (horizontal) {
      fillPrism(g, c.x - 3, c.y, 3, c.h, WALL_H, wood, { shadow: false, ao: 0.45 });
      fillPrism(g, c.x + c.w, c.y, 3, c.h, WALL_H, wood, { shadow: false, ao: 0.45 });
    } else {
      fillPrism(g, c.x, c.y - 3, c.w, 3, WALL_H, wood, { shadow: false, ao: 0.45 });
      fillPrism(g, c.x, c.y + c.h, c.w, 3, WALL_H, wood, { shadow: false, ao: 0.45 });
    }
    // Warm spill on the threshold, selling the doorway as a light source.
    fillDiamond(g, c.x, c.y, c.w, c.h, 0xffd9a0, 0.05);
    g.setDepth(depthOf(c.x + c.w, c.y + c.h, DepthBias.PROP));
  }
}

// --- exits -----------------------------------------------------------------

const EXIT_GLOW: Record<string, number> = {
  door: 0x4ade80,
  stairs: 0x4c9aff,
  window: 0x22d3ee,
  gate: 0xf5c542,
  van: 0xff8a4c
};

/**
 * The exit marker. Whatever the exit type, it always carries the same pulsing
 * floor diamond — that glow is the gameplay-critical affordance and must read
 * identically on every level, so it is never left to the prop art alone.
 */
function buildExit(scene: Phaser.Scene, exit: FloorExit): Phaser.GameObjects.Container {
  const glowColor = EXIT_GLOW[exit.type] ?? 0x4ade80;
  const { x, y } = exit;

  // --- floor glow (drawn in world space, own graphics so it can pulse) ---
  const glow = scene.add.graphics();
  for (let i = 4; i >= 1; i--) {
    const r = 16 + i * 9;
    fillDiamond(glow, x - r, y - r, r * 2, r * 2, glowColor, 0.05 + (4 - i) * 0.035);
  }
  strokeDiamond(glow, x - 20, y - 20, 40, 40, glowColor, 2, 0.85);
  glow.setDepth(depthOf(x, y, DepthBias.DECAL));

  // --- the exit structure itself ---
  const s = scene.add.graphics();
  const wood = PALETTE.doorWood;

  if (exit.type === "stairs") {
    // Ascending treads: each step is a prism one riser taller than the last.
    for (let i = 0; i < 6; i++) {
      fillPrism(s, x - 22, y + 16 - i * 7, 44, 7, 5 + i * 6, i % 2 ? shade(wood, 1.15) : wood, {
        shadow: i === 0,
        ao: 0.6
      });
    }
  } else if (exit.type === "window") {
    fillPrism(s, x - 24, y - 3, 48, 6, 14, PALETTE.doorWoodDark, { shadow: true });
    fillPrism(s, x - 24, y - 3, 48, 6, 30, 0x22d3ee, {
      baseZ: 14,
      alpha: 0.32,
      shadow: false,
      topColor: 0x9fe8f5
    });
    fillPrism(s, x - 24, y - 3, 3, 6, 32, PALETTE.doorWoodDark, { shadow: false });
    fillPrism(s, x + 21, y - 3, 3, 6, 32, PALETTE.doorWoodDark, { shadow: false });
  } else if (exit.type === "gate") {
    fillPrism(s, x - 20, y - 4, 6, 8, 30, PALETTE.fence, { shadow: true });
    fillPrism(s, x + 14, y - 4, 6, 8, 30, PALETTE.fence, { shadow: true });
    // Swung-open panel, so it reads as a way through rather than a barrier.
    fillPrism(s, x + 16, y - 22, 5, 20, 24, PALETTE.fence, { shadow: true, ao: 0.7 });
  } else if (exit.type === "van") {
    fillPrism(s, x - 26, y - 34, 52, 62, 30, PALETTE.carBody, { shadow: true, ao: 0.6 });
    fillPrism(s, x - 22, y - 30, 44, 18, 8, PALETTE.carGlass, {
      baseZ: 30,
      shadow: false,
      topColor: shade(PALETTE.carGlass, 1.4)
    });
    // Open rear doors and a lit interior: the "get in" read.
    fillDiamond(s, x - 20, y + 20, 40, 12, 0xffd9a0, 0.22);
    fillPrism(s, x - 26, y + 26, 6, 16, 26, shade(PALETTE.carBody, 0.8), { shadow: false });
    fillPrism(s, x + 20, y + 26, 6, 16, 26, shade(PALETTE.carBody, 0.8), { shadow: false });
  } else {
    // Standard door: frame, open leaf, and warm light spilling out.
    fillPrism(s, x - 22, y - 4, 5, 8, WALL_H + 4, PALETTE.doorWoodDark, { shadow: true });
    fillPrism(s, x + 17, y - 4, 5, 8, WALL_H + 4, PALETTE.doorWoodDark, { shadow: true });
    fillPrism(s, x - 22, y - 4, 44, 5, 6, PALETTE.doorWoodDark, {
      baseZ: WALL_H + 4,
      shadow: false
    });
    fillPrism(s, x + 15, y - 26, 5, 22, WALL_H - 2, wood, { shadow: true, ao: 0.7 });
    fillDiamond(s, x - 16, y - 4, 32, 10, 0xffd9a0, 0.2);
  }
  s.setDepth(depthOf(x, y + 8, DepthBias.PROP));

  const container = scene.add.container(0, 0, [glow, s]);
  container.setDepth(depthOf(x, y, DepthBias.DECAL));

  scene.tweens.add({
    targets: glow,
    alpha: { from: 0.45, to: 1 },
    duration: 900,
    yoyo: true,
    repeat: -1,
    ease: "Sine.easeInOut"
  });

  return container;
}

// --- entry point -----------------------------------------------------------

export function drawIsoWorld(scene: Phaser.Scene, layout: FloorLayout): IsoWorldResult {
  const outdoor = isOutdoorFloor(layout.floor);
  const ground = scene.add.graphics();
  ground.setDepth(-1000); // floors never occlude; keep them beneath everything

  // --- ground plane beyond the building footprint ---
  // Filled in SCREEN space, not world space. A projected rectangle is a diamond,
  // and its corners leave hard black triangles at the corners of the canvas.
  // Oversized so it still covers the view at any camera pan or zoom.
  const voidColor = outdoor ? 0x16241a : 0x0d0d14;
  ground.fillStyle(voidColor, 1);
  ground.fillRect(-4000, -4000, 10000, 10000);

  // --- building slab, slightly proud of the ground for a foundation edge ---
  fillPrism(ground, WORLD.x - 10, WORLD.y - 10, WORLD.w + 20, WORLD.h + 20, 4, shade(layout.tint, 0.5), {
    shadow: false,
    bevel: false,
    outline: false,
    ao: 0.3
  });

  // --- room floors ---
  for (const room of layout.rooms) {
    const material = materialForRoom(room.key, outdoor);
    paintFloor(ground, room, material, layout.tint);
  }

  // --- perimeter wall of the whole level ---
  const wallColor = outdoor ? shade(PALETTE.fence, 1.3) : mix(0x8a86a0, layout.tint, 0.18);
  const capColor = shade(wallColor, 1.25);
  const P = 8;
  const perim = scene.add.graphics();
  fillPrism(perim, WORLD.x - P, WORLD.y - P, WORLD.w + P * 2, P, PERIMETER_H, wallColor, {
    topColor: capColor,
    shadow: false,
    ao: 0.5
  });
  fillPrism(perim, WORLD.x - P, WORLD.y, P, WORLD.h, PERIMETER_H, wallColor, {
    topColor: capColor,
    shadow: false,
    ao: 0.5
  });
  perim.setDepth(depthOf(WORLD.x, WORLD.y, -50));

  // Near perimeter edges stay as lips so the level is never boxed in visually.
  const perimNear = scene.add.graphics();
  fillPrism(perimNear, WORLD.x - P, WORLD.y + WORLD.h, WORLD.w + P * 2, P, WALL_LIP_H, wallColor, {
    topColor: capColor,
    shadow: false
  });
  fillPrism(perimNear, WORLD.x + WORLD.w, WORLD.y, P, WORLD.h, WALL_LIP_H, wallColor, {
    topColor: capColor,
    shadow: false
  });
  perimNear.setDepth(depthOf(WORLD.x + WORLD.w + P, WORLD.y + WORLD.h + P, DepthBias.PROP));

  // --- interior walls + doorways ---
  // Outdoor levels have no interior walls: their "rooms" are open yard zones,
  // and walling them would make the chase levels claustrophobic.
  if (!outdoor) {
    for (const room of layout.rooms) {
      buildRoomWalls(scene, room, layout.connectors, wallColor, capColor);
    }
    buildDoorways(scene, layout.connectors, PALETTE.doorWood);
  } else {
    // Outdoors, zone boundaries read as low kerbs instead.
    const kerb = scene.add.graphics();
    for (const room of layout.rooms) {
      strokeDiamond(kerb, room.x, room.y, room.w, room.h, shade(wallColor, 0.7), 1, 0.35);
    }
    kerb.setDepth(-990);
  }

  const escapeMarker = buildExit(scene, layout.exit);
  return { backDoor: { x: layout.exit.x, y: layout.exit.y }, escapeMarker, ground };
}

/** Re-exported so the furniture module can paint decals into the same layer. */
export { fillDiamond, fillPrism, fillCylinder, fillShadow, shade, mix };
