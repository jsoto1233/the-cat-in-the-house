import Phaser from "phaser";
import type { FloorLayout } from "../house/floors";
import { WORLD_H, WORLD_W } from "../house/houseLayout";
import { MAX_ELEVATION, KZ, toIso } from "./projection";

// ---------------------------------------------------------------------------
// Camera rig.
//
// BOUNDS ARE PROJECTED, NOT NOMINAL. The first version clamped the camera to
// the 1280x720 world rectangle, but that rectangle is a Cartesian construct —
// after projection the level is a DIAMOND sitting inside a different box
// entirely. Clamping to the wrong box let the camera pan off the level and
// stare into empty space, which is the dead black area in the bug report.
//
// Bounds here are computed from the projected extent of the actual rooms, then
// inset, so the camera stops while the level still fills the frame.
// ---------------------------------------------------------------------------

/** Whole floorplan visible. Also the safe fallback for any bad state. */
export const ZOOM_TACTICAL = 1.0;
/** Default play framing. */
export const ZOOM_DEFAULT = 1.55;
/** Pushed in for a timed interaction. */
export const ZOOM_FOCUS = 2.0;

const FOLLOW_STIFFNESS = 62;
const ZOOM_STIFFNESS = 40;

/**
 * Fraction of the level's projected size trimmed off each edge of the camera's
 * travel. Because the level is a diamond, a camera sitting exactly on the
 * bounding box corner is looking mostly at void. Pulling the limits in keeps
 * geometry on screen without the clamp feeling like a wall.
 */
const BOUNDS_INSET = 0.11;

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Projected bounding box of a level's rooms, including headroom for elevation.
 * Falls back to the whole world when a layout has no rooms.
 */
export function projectedBounds(layout?: FloorLayout): Bounds {
  const rects =
    layout?.rooms?.length
      ? layout.rooms
      : [{ x: 0, y: 0, w: WORLD_W, h: WORLD_H }];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const r of rects) {
    // All four corners: a rectangle projects to a diamond, so testing only two
    // opposite corners would miss the extremes on the other diagonal.
    for (const [x, y] of [
      [r.x, r.y],
      [r.x + r.w, r.y],
      [r.x, r.y + r.h],
      [r.x + r.w, r.y + r.h]
    ]) {
      const p = toIso(x, y);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
  }

  // Walls and props rise above the floor plane; leave room for them at the top.
  minY -= MAX_ELEVATION * KZ;
  return { minX, minY, maxX, maxY };
}

export class IsoCameraRig {
  private cam: Phaser.Cameras.Scene2D.Camera;
  private bounds: Bounds;

  private cx = WORLD_W / 2;
  private cy = WORLD_H / 2;
  private vx = 0;
  private vy = 0;

  private zoom = ZOOM_DEFAULT;
  private zoomTarget = ZOOM_DEFAULT;
  private zoomVel = 0;

  private shakeMag = 0;
  private shakeDecay = 0;
  private following = true;

  constructor(scene: Phaser.Scene, layout?: FloorLayout) {
    this.cam = scene.cameras.main;
    const b = projectedBounds(layout);
    const iw = (b.maxX - b.minX) * BOUNDS_INSET;
    const ih = (b.maxY - b.minY) * BOUNDS_INSET;
    this.bounds = {
      minX: b.minX + iw,
      maxX: b.maxX - iw,
      minY: b.minY + ih,
      maxY: b.maxY - ih
    };

    // Phaser's own setBounds is deliberately NOT used. It clamps against the
    // scroll rectangle and behaves badly when the bounds are smaller than the
    // viewport, which happens at low zoom on the narrower levels. The clamp
    // below handles that case explicitly.
    this.cam.setZoom(ZOOM_DEFAULT);
    this.cam.centerOn(WORLD_W / 2, WORLD_H / 2);
  }

  snapTo(worldX: number, worldY: number) {
    const p = toIso(worldX, worldY);
    const c = this.clamp(p.x, p.y, this.zoom);
    this.cx = c.x;
    this.cy = c.y;
    this.vx = 0;
    this.vy = 0;
    this.cam.centerOn(this.cx, this.cy);
  }

  setZoom(target: number) {
    this.zoomTarget = target;
  }
  setTactical(on: boolean) {
    this.zoomTarget = on ? ZOOM_TACTICAL : ZOOM_DEFAULT;
  }
  setFocused(on: boolean) {
    this.zoomTarget = on ? ZOOM_FOCUS : ZOOM_DEFAULT;
  }
  setFollowing(on: boolean) {
    this.following = on;
  }

  punch(magnitude = 6, decay = 7) {
    this.shakeMag = Math.max(this.shakeMag, magnitude);
    this.shakeDecay = decay;
  }

  /**
   * Keep the camera centre inside the level.
   *
   * When the level is WIDER than the view, the centre is clamped so the view
   * edge never passes the level edge. When the level is NARROWER than the view
   * (low zoom, or a short level) there is no valid clamp range, so the axis is
   * centred instead — clamping there would jam the camera against one side and
   * leave all the empty space on the other.
   */
  private clamp(x: number, y: number, zoom: number) {
    const halfW = WORLD_W / zoom / 2;
    const halfH = WORLD_H / zoom / 2;

    const loX = this.bounds.minX + halfW;
    const hiX = this.bounds.maxX - halfW;
    const loY = this.bounds.minY + halfH;
    const hiY = this.bounds.maxY - halfH;

    return {
      x: loX > hiX ? (this.bounds.minX + this.bounds.maxX) / 2 : Math.min(Math.max(x, loX), hiX),
      y: loY > hiY ? (this.bounds.minY + this.bounds.maxY) / 2 : Math.min(Math.max(y, loY), hiY)
    };
  }

  /**
   * Advance the rig. `dt` is in seconds.
   *
   * Pan and zoom both use a critically damped spring: damping is 2·sqrt(k),
   * the exact value that reaches the target as fast as possible without ever
   * overshooting. Overshoot on a game camera reads as nausea.
   */
  update(dt: number, targetWorldX: number, targetWorldY: number) {
    const step = Math.min(dt, 1 / 30); // a stalled tab must not fling the camera

    // Zoom first, so this frame's clamp uses the zoom actually being rendered.
    const zd = 2 * Math.sqrt(ZOOM_STIFFNESS);
    const az = (this.zoomTarget - this.zoom) * ZOOM_STIFFNESS - this.zoomVel * zd;
    this.zoomVel += az * step;
    this.zoom += this.zoomVel * step;
    this.cam.setZoom(this.zoom);

    if (this.following) {
      const p = toIso(targetWorldX, targetWorldY);
      const goal = this.clamp(p.x, p.y, this.zoom);
      const damping = 2 * Math.sqrt(FOLLOW_STIFFNESS);
      this.vx += ((goal.x - this.cx) * FOLLOW_STIFFNESS - this.vx * damping) * step;
      this.vy += ((goal.y - this.cy) * FOLLOW_STIFFNESS - this.vy * damping) * step;
      this.cx += this.vx * step;
      this.cy += this.vy * step;
    } else {
      const c = this.clamp((this.bounds.minX + this.bounds.maxX) / 2, (this.bounds.minY + this.bounds.maxY) / 2, this.zoom);
      this.cx += (c.x - this.cx) * Math.min(1, step * 6);
      this.cy += (c.y - this.cy) * Math.min(1, step * 6);
    }

    // Hard clamp after integrating: the spring can overshoot the goal slightly
    // on a long frame, and the bound must hold regardless.
    const fixed = this.clamp(this.cx, this.cy, this.zoom);
    this.cx = fixed.x;
    this.cy = fixed.y;

    // Shake is applied on top, never fed back into the spring or the clamp.
    let ox = 0;
    let oy = 0;
    if (this.shakeMag > 0.05) {
      ox = (Math.random() - 0.5) * 2 * this.shakeMag;
      oy = (Math.random() - 0.5) * 2 * this.shakeMag;
      this.shakeMag *= Math.exp(-this.shakeDecay * step);
    } else {
      this.shakeMag = 0;
    }

    this.cam.centerOn(this.cx + ox, this.cy + oy);
  }
}
