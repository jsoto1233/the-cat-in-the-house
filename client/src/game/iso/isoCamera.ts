import Phaser from "phaser";
import { WORLD_H, WORLD_W } from "../house/houseLayout";
import { toIso } from "./projection";

// ---------------------------------------------------------------------------
// Camera rig.
//
// The projection already fits the whole level on screen at zoom 1.0, so the
// camera exists to add intimacy rather than to make the level reachable: it
// pushes in during play, pulls back when the player asks to read the floorplan,
// and punches on impact. Because zoom 1.0 is always a valid full view, the rig
// can never strand the player looking at nothing.
// ---------------------------------------------------------------------------

/** Whole floorplan visible. Also the safe fallback for any bad state. */
export const ZOOM_TACTICAL = 1.0;
/** Default play framing. */
export const ZOOM_DEFAULT = 1.5;
/** Pushed in for a timed interaction. */
export const ZOOM_FOCUS = 2.0;

/**
 * Spring stiffness for camera follow. Tuned so the camera trails the player
 * enough to feel weighty but never enough to lose them off the edge.
 */
const FOLLOW_STIFFNESS = 62;
const ZOOM_STIFFNESS = 40;

export class IsoCameraRig {
  private cam: Phaser.Cameras.Scene2D.Camera;

  private cx = WORLD_W / 2;
  private cy = WORLD_H / 2;
  private vx = 0;
  private vy = 0;

  private zoom = ZOOM_DEFAULT;
  private zoomTarget = ZOOM_DEFAULT;
  private zoomVel = 0;

  private shakeMag = 0;
  private shakeDecay = 0;

  /** When false the rig holds the full-level framing and ignores the target. */
  private following = true;

  constructor(scene: Phaser.Scene) {
    this.cam = scene.cameras.main;
    this.cam.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cam.setZoom(ZOOM_DEFAULT);
    this.cam.centerOn(WORLD_W / 2, WORLD_H / 2);
  }

  /** Snap straight to a world position with no easing. Use on level start. */
  snapTo(worldX: number, worldY: number) {
    const p = toIso(worldX, worldY);
    this.cx = p.x;
    this.cy = p.y;
    this.vx = 0;
    this.vy = 0;
    this.cam.centerOn(this.cx, this.cy);
  }

  setZoom(target: number) {
    this.zoomTarget = target;
  }

  /** Tab-held tactical view: pull back to see the whole floor. */
  setTactical(on: boolean) {
    this.zoomTarget = on ? ZOOM_TACTICAL : ZOOM_DEFAULT;
  }

  /** Push in for a timed interaction such as searching a container. */
  setFocused(on: boolean) {
    this.zoomTarget = on ? ZOOM_FOCUS : ZOOM_DEFAULT;
  }

  setFollowing(on: boolean) {
    this.following = on;
  }

  /**
   * Impact punch. Magnitude is in screen pixels; the shake decays exponentially
   * rather than linearly so it lands hard and settles fast.
   */
  punch(magnitude = 6, decay = 7) {
    this.shakeMag = Math.max(this.shakeMag, magnitude);
    this.shakeDecay = decay;
  }

  /**
   * Advance the rig. `dt` is in seconds.
   *
   * Both the pan and the zoom use a critically damped spring: damping is set to
   * 2·sqrt(stiffness), which is the exact value that reaches the target as fast
   * as possible without ever overshooting. Overshoot on a game camera reads as
   * nausea, so it is worth getting right rather than eyeballing a lerp factor.
   */
  update(dt: number, targetWorldX: number, targetWorldY: number) {
    const step = Math.min(dt, 1 / 30); // clamp so a stalled tab cannot fling the camera

    if (this.following) {
      const p = toIso(targetWorldX, targetWorldY);
      const damping = 2 * Math.sqrt(FOLLOW_STIFFNESS);
      const ax = (p.x - this.cx) * FOLLOW_STIFFNESS - this.vx * damping;
      const ay = (p.y - this.cy) * FOLLOW_STIFFNESS - this.vy * damping;
      this.vx += ax * step;
      this.vy += ay * step;
      this.cx += this.vx * step;
      this.cy += this.vy * step;
    } else {
      // Ease back to the centre of the projected world.
      const c = toIso(WORLD_W / 2, WORLD_H / 2);
      this.cx += (c.x - this.cx) * Math.min(1, step * 6);
      this.cy += (c.y - this.cy) * Math.min(1, step * 6);
    }

    // Zoom, same spring.
    const zd = 2 * Math.sqrt(ZOOM_STIFFNESS);
    const az = (this.zoomTarget - this.zoom) * ZOOM_STIFFNESS - this.zoomVel * zd;
    this.zoomVel += az * step;
    this.zoom += this.zoomVel * step;
    this.cam.setZoom(this.zoom);

    // Shake, applied after the pan so it never feeds back into the spring.
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
