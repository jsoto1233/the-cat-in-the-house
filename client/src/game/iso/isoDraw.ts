import Phaser from "phaser";
import { KX, KY, KZ, rectCorners, toIso, type IsoPoint } from "./projection";

// ---------------------------------------------------------------------------
// Isometric drawing primitives.
//
// Everything visible in the game is built from three shapes:
//
//   diamond  — a flat world-space rectangle lying on the floor plane
//   prism    — a diamond extruded upward, with its two viewer-facing side
//              faces shaded. This is what creates the sense of volume.
//   shadow   — a squashed ellipse on the floor, giving objects contact.
//
// LIGHTING MODEL. A single fixed key light sits above and to the upper-left,
// which is the convention these games are read with. That gives three
// brightness tiers per prism, and applying them consistently is the single
// biggest factor in whether the result looks solid or looks like flat shapes
// pretending. Faces never change with camera or time — a static light is what
// keeps stylised art legible.
// ---------------------------------------------------------------------------

/** Top face: catches the key light. */
const F_TOP = 1.0;
/** Lower-left face: angled away from the light, still lit. */
const F_LEFT = 0.66;
/** Lower-right face: turned furthest from the light. */
const F_RIGHT = 0.42;
/** Thin bright lip along the top edge, which reads as a bevel. */
const F_BEVEL = 1.28;

/** Multiply a packed 0xRRGGBB colour by a brightness factor. */
export function shade(color: number, f: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * f));
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * f));
  const b = Math.min(255, Math.round((color & 0xff) * f));
  return (r << 16) | (g << 8) | b;
}

/** Blend two packed colours. t=0 returns a, t=1 returns b. */
export function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff,
    ag = (a >> 8) & 0xff,
    ab = a & 0xff;
  const br = (b >> 16) & 0xff,
    bg = (b >> 8) & 0xff,
    bb = b & 0xff;
  return (
    (Math.round(ar + (br - ar) * t) << 16) |
    (Math.round(ag + (bg - ag) * t) << 8) |
    Math.round(ab + (bb - ab) * t)
  );
}

export interface PrismOptions {
  /** Elevation of the prism's base above the floor. Used for stacking. */
  baseZ?: number;
  /** Overall opacity. */
  alpha?: number;
  /** Explicit top-face colour, when it should differ from the body. */
  topColor?: number;
  /** Draw the thin bright bevel along the top edge. Default true. */
  bevel?: boolean;
  /** Draw a soft contact shadow on the floor beneath. Default true. */
  shadow?: boolean;
  /** Dark outline around the silhouette. Default true — it keeps props legible. */
  outline?: boolean;
  /** Outline colour. */
  outlineColor?: number;
  /** How strongly the side faces darken toward the floor (ambient occlusion). */
  ao?: number;
}

// --- Flat shapes -----------------------------------------------------------

/**
 * Fill a world-space rectangle lying flat on the floor plane (or at elevation
 * `z`). This is the workhorse for floors, rugs, road paint and any decal.
 */
export function fillDiamond(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
  alpha = 1,
  z = 0
) {
  g.fillStyle(color, alpha);
  g.fillPoints(rectCorners(x, y, w, h, z) as Phaser.Types.Math.Vector2Like[], true);
}

/** Stroke the outline of a flat world-space rectangle. */
export function strokeDiamond(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
  width = 1,
  alpha = 1,
  z = 0
) {
  g.lineStyle(width, color, alpha);
  g.strokePoints(rectCorners(x, y, w, h, z) as Phaser.Types.Math.Vector2Like[], true);
}

/**
 * Soft contact shadow. Drawn as concentric ellipses rather than a single fill
 * so it falls off gradually — a hard-edged shadow makes props look pasted on.
 * The ellipse is squashed to KY/KX so it sits convincingly on the floor plane.
 */
export function fillShadow(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  strength = 0.34
) {
  const c = toIso(x + w / 2, y + h / 2, 0);
  const rx = (w + h) * KX * 0.46;
  const ry = (h + w) * KY * 0.46;
  const rings = 3;
  for (let i = rings; i >= 1; i--) {
    const t = i / rings;
    g.fillStyle(0x000000, (strength / rings) * (1.35 - t * 0.5));
    g.fillEllipse(c.x, c.y, rx * 2 * t, ry * 2 * t);
  }
}

// --- Extruded volume -------------------------------------------------------

/**
 * Draw a world-space box extruded to `height` world units.
 *
 * Face selection: in this projection the camera looks toward increasing x and
 * y, so exactly two side faces are ever visible — the +y face (appears on the
 * lower left) and the +x face (lower right). Drawing the hidden faces would be
 * wasted fill and would show through translucent props.
 */
export function fillPrism(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  height: number,
  color: number,
  opts: PrismOptions = {}
) {
  const {
    baseZ = 0,
    alpha = 1,
    topColor,
    bevel = true,
    shadow = true,
    outline = true,
    outlineColor = 0x05050a,
    ao = 0.55
  } = opts;

  const topZ = baseZ + height;

  if (shadow && baseZ <= 0.01) fillShadow(g, x, y, w, h);

  // Ground-plane corners: [top, right, bottom, left] of the diamond.
  const base = rectCorners(x, y, w, h, baseZ);
  const top = rectCorners(x, y, w, h, topZ);
  const [, bRight, bBottom, bLeft] = base;
  const [tTop, tRight, tBottom, tLeft] = top;

  // +y face — lower-left, angled toward the key light.
  drawShadedFace(g, [tLeft, tBottom, bBottom, bLeft], shade(color, F_LEFT), alpha, ao);
  // +x face — lower-right, turned away from the light.
  drawShadedFace(g, [tBottom, tRight, bRight, bBottom], shade(color, F_RIGHT), alpha, ao);

  // Top face.
  g.fillStyle(topColor ?? shade(color, F_TOP), alpha);
  g.fillPoints(top as Phaser.Types.Math.Vector2Like[], true);

  // Bevel: a bright hairline along the two upper edges of the top face.
  if (bevel && height > 1) {
    g.lineStyle(1, shade(topColor ?? color, F_BEVEL), alpha * 0.85);
    g.beginPath();
    g.moveTo(tLeft.x, tLeft.y);
    g.lineTo(tTop.x, tTop.y);
    g.lineTo(tRight.x, tRight.y);
    g.strokePath();
  }

  if (outline) {
    // Silhouette only: the outer boundary of top face + visible side faces.
    g.lineStyle(1, outlineColor, alpha * 0.55);
    g.strokePoints(
      [tTop, tRight, bRight, bBottom, bLeft, tLeft] as Phaser.Types.Math.Vector2Like[],
      true
    );
  }
}

/**
 * Fill a side face with a vertical gradient approximating ambient occlusion —
 * darker where it meets the floor. Phaser's Graphics has no gradient fill, so
 * this is banded into horizontal slices. Four bands is enough to read as a
 * gradient at this scale and stays cheap.
 */
function drawShadedFace(
  g: Phaser.GameObjects.Graphics,
  quad: IsoPoint[],
  color: number,
  alpha: number,
  ao: number
) {
  const [tA, tB, bB, bA] = quad;
  const BANDS = 4;
  for (let i = 0; i < BANDS; i++) {
    const t0 = i / BANDS;
    const t1 = (i + 1) / BANDS;
    // Darken toward the base of the face.
    const f = 1 - ao * ((t0 + t1) / 2) * 0.5;
    g.fillStyle(shade(color, f), alpha);
    g.fillPoints(
      [
        lerpPt(tA, bA, t0),
        lerpPt(tB, bB, t0),
        lerpPt(tB, bB, t1),
        lerpPt(tA, bA, t1)
      ] as Phaser.Types.Math.Vector2Like[],
      true
    );
  }
}

function lerpPt(a: IsoPoint, b: IsoPoint, t: number): IsoPoint {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

// --- Cylinders (lamps, plant pots, trash cans) -----------------------------

/**
 * An extruded ellipse. Same lighting logic as a prism, but the side is a single
 * curved band so it gets a horizontal gradient instead of two flat faces.
 */
export function fillCylinder(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  rw: number,
  rh: number,
  height: number,
  color: number,
  opts: { baseZ?: number; alpha?: number; shadow?: boolean; topColor?: number } = {}
) {
  const { baseZ = 0, alpha = 1, shadow = true, topColor } = opts;
  if (shadow && baseZ <= 0.01) fillShadow(g, cx - rw, cy - rh, rw * 2, rh * 2, 0.28);

  const bc = toIso(cx, cy, baseZ);
  const tc = toIso(cx, cy, baseZ + height);
  const ex = (rw + rh) * KX;
  const ey = (rw + rh) * KY;

  // Side wall, sliced vertically so it can carry a curvature gradient.
  const SLICES = 7;
  for (let i = 0; i < SLICES; i++) {
    const a0 = Math.PI * (i / SLICES);
    const a1 = Math.PI * ((i + 1) / SLICES);
    // Brightest a third of the way across, mimicking a cylindrical highlight.
    const t = (i + 0.5) / SLICES;
    const f = F_RIGHT + (F_LEFT - F_RIGHT) * Math.max(0, 1 - Math.abs(t - 0.34) * 2.1);
    g.fillStyle(shade(color, f), alpha);
    g.fillPoints(
      [
        { x: bc.x + Math.cos(a0) * ex, y: bc.y + Math.sin(a0) * ey },
        { x: bc.x + Math.cos(a1) * ex, y: bc.y + Math.sin(a1) * ey },
        { x: tc.x + Math.cos(a1) * ex, y: tc.y + Math.sin(a1) * ey },
        { x: tc.x + Math.cos(a0) * ex, y: tc.y + Math.sin(a0) * ey }
      ] as Phaser.Types.Math.Vector2Like[],
      true
    );
  }

  g.fillStyle(topColor ?? shade(color, F_TOP), alpha);
  g.fillEllipse(tc.x, tc.y, ex * 2, ey * 2);
  g.lineStyle(1, shade(topColor ?? color, F_BEVEL), alpha * 0.7);
  g.strokeEllipse(tc.x, tc.y, ex * 2, ey * 2);
}

// --- Wall segments ---------------------------------------------------------

/** Which way a wall faces determines whether it can occlude the player. */
export type WallFacing = "N" | "S" | "E" | "W";

/**
 * A wall is just a long, thin prism, but it gets its own entry point because
 * walls need a cap colour distinct from their faces (so the top reads as a
 * different material) and because their facing drives occlusion.
 */
export function fillWall(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  height: number,
  color: number,
  capColor: number,
  alpha = 1
) {
  fillPrism(g, x, y, w, h, height, color, {
    alpha,
    topColor: capColor,
    shadow: false,
    bevel: true,
    outline: true,
    ao: 0.7
  });
}

/**
 * True when a wall segment sits between the camera and a world position, and so
 * should fade out. Only north- and west-facing walls can ever occlude, because
 * the camera looks toward +x/+y — south and east walls are always behind what
 * they enclose.
 */
export function wallOccludes(
  wall: { x: number; y: number; w: number; h: number; facing: WallFacing },
  px: number,
  py: number,
  reach = 96
): boolean {
  if (wall.facing !== "N" && wall.facing !== "W") return false;
  if (wall.facing === "N") {
    // Occludes when the subject is below it and roughly within its span.
    return py > wall.y && py - wall.y < reach && px > wall.x - 24 && px < wall.x + wall.w + 24;
  }
  return px > wall.x && px - wall.x < reach && py > wall.y - 24 && py < wall.y + wall.h + 24;
}

// --- Screen-space helpers --------------------------------------------------

/**
 * Vertical screen offset for a given world elevation. Sprites that are drawn as
 * plain 2D art (characters, loot glyphs) are billboarded: kept upright and
 * simply lifted, rather than skewed into the floor plane.
 */
export function liftPx(z: number): number {
  return z * KZ;
}

/** Horizontal:vertical ratio of the projection, for squashing round shapes. */
export const ISO_SQUASH = KY / KX;
