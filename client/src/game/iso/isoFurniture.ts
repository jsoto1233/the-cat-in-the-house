import Phaser from "phaser";
import type { FloorLayout } from "../house/floors";
import { PALETTE, type FurnitureDef, type FurnitureKind } from "../house/houseLayout";
import { fillCylinder, fillDiamond, fillPrism, fillShadow, mix, shade } from "./isoDraw";
import {
  FLOOR_DECALS,
  FURNITURE_HEIGHT,
  ROUND_KINDS,
  WALL_H,
  WALL_MOUNTED
} from "./isoMaterials";
import { DepthBias, depthOfCentre } from "./projection";

// ---------------------------------------------------------------------------
// Isometric furniture.
//
// Every prop is assembled from stacked prisms. The pattern throughout is: lay
// down the bulk volume, then add smaller volumes on top of it using `baseZ` to
// sit them at the right elevation. A couch is a slab plus a backrest plus two
// arms; a bed is a mattress plus a headboard plus pillows. Building props this
// way instead of drawing bespoke shapes means they all share one lighting model
// and therefore look like they belong in the same world.
// ---------------------------------------------------------------------------

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function boxOf(def: FurnitureDef): Box {
  const w = def.w ?? 32;
  const h = def.h ?? 32;
  return { x: def.x - w / 2, y: def.y - h / 2, w, h };
}

type G = Phaser.GameObjects.Graphics;

// ---------------------------------------------------------------------------
// Floor decals
// ---------------------------------------------------------------------------

function drawDecal(g: G, def: FurnitureDef) {
  const b = boxOf(def);
  switch (def.kind) {
    case "rug": {
      fillDiamond(g, b.x, b.y, b.w, b.h, PALETTE.rug, 0.85);
      fillDiamond(g, b.x + 5, b.y + 5, b.w - 10, b.h - 10, PALETTE.rugAlt, 0.7);
      fillDiamond(g, b.x + 9, b.y + 9, b.w - 18, b.h - 18, PALETTE.rugTrim, 0.5);
      // Fringe along the two near edges reads as a real rug rather than paint.
      for (let i = 0; i < b.w; i += 6) {
        fillDiamond(g, b.x + i, b.y + b.h, 3, 3, PALETTE.rugTrim, 0.55);
      }
      break;
    }
    case "pond": {
      // Recessed: drawn as a shallow negative prism, then water on top.
      fillDiamond(g, b.x, b.y, b.w, b.h, 0x000000, 0.4);
      fillDiamond(g, b.x + 2, b.y + 2, b.w - 4, b.h - 4, PALETTE.water, 0.95);
      for (let i = 0; i < 3; i++) {
        const t = 0.6 - i * 0.15;
        fillDiamond(
          g,
          b.x + b.w * 0.18,
          b.y + b.h * (0.2 + i * 0.22),
          b.w * 0.5,
          2.5,
          PALETTE.waterLight,
          t * 0.5
        );
      }
      break;
    }
    case "road":
      fillDiamond(g, b.x, b.y, b.w, b.h, PALETTE.asphalt, 1);
      // Slight camber: lighter down the crown of the road.
      fillDiamond(g, b.x, b.y + b.h * 0.42, b.w, b.h * 0.16, 0xffffff, 0.02);
      break;
    case "roadLine":
      fillDiamond(g, b.x, b.y, b.w, b.h, 0xd8c96a, 0.75);
      break;
    case "crosswalk": {
      const bars = Math.max(2, Math.floor(b.w / 12));
      for (let i = 0; i < bars; i++) {
        fillDiamond(g, b.x + i * (b.w / bars), b.y, (b.w / bars) * 0.55, b.h, 0xe4e0d4, 0.6);
      }
      break;
    }
    case "sidewalk": {
      fillDiamond(g, b.x, b.y, b.w, b.h, 0x33363d, 1);
      // Expansion joints.
      const step = 26;
      const along = b.w >= b.h;
      for (let d = step; d < (along ? b.w : b.h); d += step) {
        if (along) fillDiamond(g, b.x + d, b.y, 1.2, b.h, 0x24262b, 0.8);
        else fillDiamond(g, b.x, b.y + d, b.w, 1.2, 0x24262b, 0.8);
      }
      break;
    }
    default:
      fillDiamond(g, b.x, b.y, b.w, b.h, PALETTE.rug, 0.6);
  }
}

// ---------------------------------------------------------------------------
// Wall-mounted panels
// ---------------------------------------------------------------------------

/**
 * Art, mirrors and photo groupings hang flat against a wall. They are drawn as
 * thin prisms lifted to eye height rather than as floor props.
 */
function drawWallMounted(g: G, def: FurnitureDef) {
  const b = boxOf(def);
  const eye = WALL_H * 0.52;
  const thin = 2.5;
  const along = b.w >= b.h;
  const w = along ? b.w : thin;
  const h = along ? thin : b.h;
  const panelH = along ? b.h : b.w;

  switch (def.kind) {
    case "wallArt":
      fillPrism(g, b.x, b.y, w, h, panelH, PALETTE.artFrame, {
        baseZ: eye,
        shadow: false,
        topColor: PALETTE.artFrame
      });
      fillPrism(g, b.x + 2, b.y + 1, Math.max(2, w - 4), h, panelH - 5, PALETTE.art, {
        baseZ: eye + 3,
        shadow: false,
        bevel: false
      });
      break;
    case "mirror":
      fillPrism(g, b.x, b.y, w, h, panelH, PALETTE.metal, { baseZ: eye, shadow: false });
      fillPrism(g, b.x + 2, b.y + 1, Math.max(2, w - 4), h, panelH - 5, 0x5d6b7d, {
        baseZ: eye + 3,
        shadow: false,
        bevel: false,
        topColor: 0x8fa3ba
      });
      break;
    default: {
      // framedPictures: a cluster of three small frames at varied heights.
      const n = 3;
      for (let i = 0; i < n; i++) {
        const off = (i - 1) * (along ? w / 3 : h / 3);
        const lift = eye + (i % 2 ? 6 : 0);
        fillPrism(
          g,
          b.x + (along ? off + w / 2 - 5 : 0),
          b.y + (along ? 0 : off + h / 2 - 5),
          along ? 10 : thin,
          along ? thin : 10,
          10,
          PALETTE.artFrame,
          { baseZ: lift, shadow: false }
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Volume props
// ---------------------------------------------------------------------------

function drawPiece(g: G, def: FurnitureDef) {
  const b = boxOf(def);
  const H = FURNITURE_HEIGHT[def.kind] ?? 16;
  /** True when the piece is wider than deep, so its back is the north edge. */
  const backNorth = b.w >= b.h;

  switch (def.kind) {
    // ---------------- seating ----------------
    case "couch": {
      const seatH = H * 0.55;
      fillPrism(g, b.x, b.y, b.w, b.h, seatH, PALETTE.couch, { ao: 0.6 });
      // Backrest along the far edge.
      if (backNorth) {
        fillPrism(g, b.x, b.y, b.w, b.h * 0.3, H, PALETTE.couchDark, { shadow: false });
        fillPrism(g, b.x, b.y, b.w * 0.14, b.h, H * 0.85, PALETTE.couchDark, { shadow: false });
        fillPrism(g, b.x + b.w * 0.86, b.y, b.w * 0.14, b.h, H * 0.85, PALETTE.couchDark, {
          shadow: false
        });
        // Seat cushions.
        const n = Math.max(2, Math.round(b.w / 26));
        for (let i = 0; i < n; i++) {
          fillPrism(
            g,
            b.x + b.w * 0.16 + (i * b.w * 0.68) / n,
            b.y + b.h * 0.34,
            (b.w * 0.68) / n - 2,
            b.h * 0.58,
            3,
            PALETTE.couchCushion,
            { baseZ: seatH, shadow: false, ao: 0.3 }
          );
        }
      } else {
        fillPrism(g, b.x, b.y, b.w * 0.3, b.h, H, PALETTE.couchDark, { shadow: false });
        fillPrism(g, b.x, b.y, b.w, b.h * 0.14, H * 0.85, PALETTE.couchDark, { shadow: false });
        fillPrism(g, b.x, b.y + b.h * 0.86, b.w, b.h * 0.14, H * 0.85, PALETTE.couchDark, {
          shadow: false
        });
        const n = Math.max(2, Math.round(b.h / 26));
        for (let i = 0; i < n; i++) {
          fillPrism(
            g,
            b.x + b.w * 0.34,
            b.y + b.h * 0.16 + (i * b.h * 0.68) / n,
            b.w * 0.58,
            (b.h * 0.68) / n - 2,
            3,
            PALETTE.couchCushion,
            { baseZ: seatH, shadow: false, ao: 0.3 }
          );
        }
      }
      break;
    }

    case "bench": {
      fillPrism(g, b.x, b.y, b.w, b.h, H, PALETTE.wood, { ao: 0.6 });
      // Slats.
      const along = backNorth;
      const n = 4;
      for (let i = 0; i < n; i++) {
        if (along) {
          fillPrism(g, b.x, b.y + (i * b.h) / n + 1, b.w, b.h / n - 2, 1.2, PALETTE.woodLight, {
            baseZ: H,
            shadow: false,
            bevel: false,
            outline: false
          });
        } else {
          fillPrism(g, b.x + (i * b.w) / n + 1, b.y, b.w / n - 2, b.h, 1.2, PALETTE.woodLight, {
            baseZ: H,
            shadow: false,
            bevel: false,
            outline: false
          });
        }
      }
      break;
    }

    // ---------------- tables ----------------
    case "coffeeTable":
    case "sideTable":
    case "diningTable":
    case "picnicTable": {
      const legH = H * 0.75;
      const topT = H - legH;
      const inset = Math.min(b.w, b.h) * 0.13;
      const legW = Math.max(3, Math.min(b.w, b.h) * 0.12);
      for (const [lx, ly] of [
        [b.x + inset, b.y + inset],
        [b.x + b.w - inset - legW, b.y + inset],
        [b.x + inset, b.y + b.h - inset - legW],
        [b.x + b.w - inset - legW, b.y + b.h - inset - legW]
      ]) {
        fillPrism(g, lx, ly, legW, legW, legH, PALETTE.woodDark, {
          shadow: false,
          bevel: false,
          outline: false
        });
      }
      fillShadow(g, b.x, b.y, b.w, b.h, 0.3);
      fillPrism(g, b.x, b.y, b.w, b.h, Math.max(2.5, topT), PALETTE.wood, {
        baseZ: legH,
        shadow: false,
        topColor: PALETTE.woodLight,
        ao: 0.35
      });
      if (def.kind === "picnicTable") {
        // Attached benches either side.
        if (backNorth) {
          fillPrism(g, b.x, b.y - 9, b.w, 7, H * 0.6, PALETTE.woodDark, { shadow: false });
          fillPrism(g, b.x, b.y + b.h + 2, b.w, 7, H * 0.6, PALETTE.woodDark, { shadow: false });
        } else {
          fillPrism(g, b.x - 9, b.y, 7, b.h, H * 0.6, PALETTE.woodDark, { shadow: false });
          fillPrism(g, b.x + b.w + 2, b.y, 7, b.h, H * 0.6, PALETTE.woodDark, { shadow: false });
        }
      }
      break;
    }

    case "tvStand": {
      fillPrism(g, b.x, b.y, b.w, b.h, H, PALETTE.woodDark, { ao: 0.6 });
      // Screen standing on the far edge of the unit.
      const sw = backNorth ? b.w * 0.8 : 3;
      const sh = backNorth ? 3 : b.h * 0.8;
      fillPrism(
        g,
        b.x + (backNorth ? b.w * 0.1 : b.w * 0.2),
        b.y + (backNorth ? b.h * 0.2 : b.h * 0.1),
        sw,
        sh,
        20,
        PALETTE.screen,
        { baseZ: H, shadow: false, topColor: PALETTE.screen }
      );
      fillPrism(
        g,
        b.x + (backNorth ? b.w * 0.12 : b.w * 0.2 + 0.6),
        b.y + (backNorth ? b.h * 0.2 + 0.6 : b.h * 0.12),
        backNorth ? sw - b.w * 0.04 : 1.6,
        backNorth ? 1.6 : sh - b.h * 0.04,
        16,
        PALETTE.screenGlow,
        { baseZ: H + 2, shadow: false, bevel: false, alpha: 0.9 }
      );
      break;
    }

    // ---------------- kitchen ----------------
    case "counter": {
      fillPrism(g, b.x, b.y, b.w, b.h, H, PALETTE.wood, {
        topColor: PALETTE.counterTop,
        ao: 0.65
      });
      // Cabinet door seams along the front face.
      const n = Math.max(2, Math.round((backNorth ? b.w : b.h) / 24));
      for (let i = 1; i < n; i++) {
        if (backNorth) {
          fillPrism(g, b.x + (i * b.w) / n, b.y + b.h - 1, 1, 1, H - 2, PALETTE.woodDark, {
            shadow: false,
            bevel: false,
            outline: false
          });
        } else {
          fillPrism(g, b.x + b.w - 1, b.y + (i * b.h) / n, 1, 1, H - 2, PALETTE.woodDark, {
            shadow: false,
            bevel: false,
            outline: false
          });
        }
      }
      break;
    }

    case "stove": {
      fillPrism(g, b.x, b.y, b.w, b.h, H, PALETTE.appliance, {
        topColor: PALETTE.appliancePanel,
        ao: 0.6
      });
      // Four burners.
      for (const [ox, oy] of [
        [0.28, 0.28],
        [0.68, 0.28],
        [0.28, 0.68],
        [0.68, 0.68]
      ]) {
        const r = Math.min(b.w, b.h) * 0.13;
        fillCylinder(g, b.x + b.w * ox, b.y + b.h * oy, r, r, 0.8, 0x1a1d22, {
          baseZ: H,
          shadow: false,
          topColor: 0x24282f
        });
      }
      // Control panel standing at the back.
      if (backNorth) {
        fillPrism(g, b.x, b.y, b.w, 3, 9, PALETTE.applianceLight, { baseZ: H, shadow: false });
      } else {
        fillPrism(g, b.x, b.y, 3, b.h, 9, PALETTE.applianceLight, { baseZ: H, shadow: false });
      }
      break;
    }

    case "fridge": {
      fillPrism(g, b.x, b.y, b.w, b.h, H, PALETTE.appliance, {
        topColor: shade(PALETTE.appliance, 1.2),
        ao: 0.6
      });
      // Freezer/fridge split and handles on the front face.
      const splitZ = H * 0.62;
      if (backNorth) {
        fillPrism(g, b.x, b.y + b.h - 1, b.w, 1, 1.2, PALETTE.appliancePanel, {
          baseZ: splitZ,
          shadow: false,
          bevel: false,
          outline: false
        });
        fillPrism(g, b.x + b.w * 0.78, b.y + b.h - 1.5, 2.5, 1.5, H * 0.4, 0x8a929e, {
          baseZ: splitZ + 2,
          shadow: false,
          bevel: false
        });
      } else {
        fillPrism(g, b.x + b.w - 1, b.y, 1, b.h, 1.2, PALETTE.appliancePanel, {
          baseZ: splitZ,
          shadow: false,
          bevel: false,
          outline: false
        });
        fillPrism(g, b.x + b.w - 1.5, b.y + b.h * 0.78, 1.5, 2.5, H * 0.4, 0x8a929e, {
          baseZ: splitZ + 2,
          shadow: false,
          bevel: false
        });
      }
      break;
    }

    // ---------------- bedroom ----------------
    case "bed": {
      const frameH = H * 0.55;
      fillPrism(g, b.x, b.y, b.w, b.h, frameH, PALETTE.woodDark, { ao: 0.6 });
      // Mattress, inset so the frame shows.
      fillPrism(g, b.x + 1.5, b.y + 1.5, b.w - 3, b.h - 3, H - frameH, 0xb9bfcc, {
        baseZ: frameH,
        shadow: false,
        ao: 0.3
      });
      // Blanket covering the near two thirds.
      if (backNorth) {
        fillPrism(g, b.x + 1.5, b.y + b.h * 0.34, b.w - 3, b.h * 0.64, 2.2, PALETTE.bedSheet, {
          baseZ: H,
          shadow: false,
          ao: 0.25
        });
        // Pillows at the head.
        for (let i = 0; i < (b.w > 48 ? 2 : 1); i++) {
          fillPrism(
            g,
            b.x + 4 + i * (b.w / 2 - 2),
            b.y + b.h * 0.08,
            b.w / (b.w > 48 ? 2.6 : 1.6),
            b.h * 0.2,
            3.5,
            PALETTE.bedPillow,
            { baseZ: H, shadow: false, ao: 0.2 }
          );
        }
        fillPrism(g, b.x - 1, b.y - 4, b.w + 2, 4, 26, PALETTE.wood, { shadow: false, ao: 0.7 });
      } else {
        fillPrism(g, b.x + b.w * 0.34, b.y + 1.5, b.w * 0.64, b.h - 3, 2.2, PALETTE.bedSheet, {
          baseZ: H,
          shadow: false,
          ao: 0.25
        });
        for (let i = 0; i < (b.h > 48 ? 2 : 1); i++) {
          fillPrism(
            g,
            b.x + b.w * 0.08,
            b.y + 4 + i * (b.h / 2 - 2),
            b.w * 0.2,
            b.h / (b.h > 48 ? 2.6 : 1.6),
            3.5,
            PALETTE.bedPillow,
            { baseZ: H, shadow: false, ao: 0.2 }
          );
        }
        fillPrism(g, b.x - 4, b.y - 1, 4, b.h + 2, 26, PALETTE.wood, { shadow: false, ao: 0.7 });
      }
      break;
    }

    case "dresser":
    case "nightstand": {
      fillPrism(g, b.x, b.y, b.w, b.h, H, PALETTE.wood, {
        topColor: PALETTE.woodLight,
        ao: 0.6
      });
      // Drawer fronts on the near face.
      const drawers = def.kind === "dresser" ? 3 : 2;
      for (let i = 0; i < drawers; i++) {
        const dz = (H / drawers) * i + 2;
        const dh = H / drawers - 3;
        if (backNorth) {
          fillPrism(g, b.x + 2, b.y + b.h - 1, b.w - 4, 1, dh, PALETTE.woodDark, {
            baseZ: dz,
            shadow: false,
            bevel: false
          });
          fillPrism(g, b.x + b.w / 2 - 3, b.y + b.h - 1.6, 6, 1.6, 1.4, 0x9a8866, {
            baseZ: dz + dh / 2,
            shadow: false,
            bevel: false,
            outline: false
          });
        } else {
          fillPrism(g, b.x + b.w - 1, b.y + 2, 1, b.h - 4, dh, PALETTE.woodDark, {
            baseZ: dz,
            shadow: false,
            bevel: false
          });
        }
      }
      break;
    }

    // ---------------- bathroom ----------------
    case "bathtub": {
      fillPrism(g, b.x, b.y, b.w, b.h, H, PALETTE.porcelain, {
        topColor: shade(PALETTE.porcelain, 1.1),
        ao: 0.5
      });
      // Hollow basin.
      fillPrism(g, b.x + 3, b.y + 3, b.w - 6, b.h - 6, 1, 0x2a3038, {
        baseZ: H - 1,
        shadow: false,
        bevel: false
      });
      fillDiamond(g, b.x + 5, b.y + 5, b.w - 10, b.h - 10, 0x3b6a86, 0.55, H - 0.5);
      break;
    }

    case "toilet": {
      const r = Math.min(b.w, b.h) * 0.32;
      fillCylinder(g, def.x, def.y + b.h * 0.12, r, r, H * 0.75, PALETTE.porcelain, {});
      fillCylinder(g, def.x, def.y + b.h * 0.12, r * 1.08, r * 1.08, 2, PALETTE.porcelain, {
        baseZ: H * 0.75,
        shadow: false,
        topColor: shade(PALETTE.porcelain, 1.15)
      });
      // Cistern against the wall.
      if (backNorth) {
        fillPrism(g, b.x + b.w * 0.2, b.y, b.w * 0.6, b.h * 0.28, H * 1.25, PALETTE.porcelain, {
          shadow: false,
          ao: 0.45
        });
      } else {
        fillPrism(g, b.x, b.y + b.h * 0.2, b.w * 0.28, b.h * 0.6, H * 1.25, PALETTE.porcelain, {
          shadow: false,
          ao: 0.45
        });
      }
      break;
    }

    case "sink": {
      // Pedestal plus basin.
      fillPrism(
        g,
        b.x + b.w * 0.3,
        b.y + b.h * 0.3,
        b.w * 0.4,
        b.h * 0.4,
        H * 0.7,
        PALETTE.porcelainDark,
        { ao: 0.5 }
      );
      fillPrism(g, b.x, b.y, b.w, b.h, H * 0.3, PALETTE.porcelain, {
        baseZ: H * 0.7,
        shadow: false,
        topColor: shade(PALETTE.porcelain, 1.15),
        ao: 0.3
      });
      fillDiamond(g, b.x + 3, b.y + 3, b.w - 6, b.h - 6, 0x2f3740, 0.7, H);
      // Tap.
      fillPrism(g, def.x - 1, b.y + 2, 2, 2, 7, 0x9aa2ad, { baseZ: H, shadow: false });
      break;
    }

    // ---------------- storage ----------------
    case "shelving": {
      fillPrism(g, b.x, b.y, b.w, b.h, H, PALETTE.woodDark, { ao: 0.7 });
      // Shelf lines and a scatter of contents.
      const shelves = 4;
      for (let i = 1; i < shelves; i++) {
        const z = (H / shelves) * i;
        fillPrism(g, b.x + 1, b.y + 1, b.w - 2, b.h - 2, 1.2, PALETTE.wood, {
          baseZ: z,
          shadow: false,
          bevel: false,
          outline: false
        });
        // Books / boxes on the shelf.
        const n = Math.max(2, Math.round((backNorth ? b.w : b.h) / 12));
        for (let k = 0; k < n; k++) {
          const c = [0x6b4a3a, 0x3d5a6b, 0x5a4a6b, 0x6b6b3a][(i + k) % 4];
          if (backNorth) {
            fillPrism(g, b.x + 2 + (k * (b.w - 4)) / n, b.y + 2, (b.w - 4) / n - 1.5, b.h - 4, 7, c, {
              baseZ: z + 1.2,
              shadow: false,
              bevel: false
            });
          } else {
            fillPrism(g, b.x + 2, b.y + 2 + (k * (b.h - 4)) / n, b.w - 4, (b.h - 4) / n - 1.5, 7, c, {
              baseZ: z + 1.2,
              shadow: false,
              bevel: false
            });
          }
        }
      }
      break;
    }

    case "coatRack": {
      fillCylinder(g, def.x, def.y, 5, 5, 2, PALETTE.woodDark, {});
      fillCylinder(g, def.x, def.y, 1.6, 1.6, H - 2, PALETTE.wood, { baseZ: 2, shadow: false });
      // Pegs with a coat hanging off one.
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        fillPrism(g, def.x + Math.cos(a) * 4 - 1, def.y + Math.sin(a) * 4 - 1, 4, 2, 1.5, PALETTE.wood, {
          baseZ: H - 5,
          shadow: false,
          bevel: false
        });
      }
      fillPrism(g, def.x + 2, def.y - 2, 7, 5, 16, PALETTE.fabricDark, {
        baseZ: H - 20,
        shadow: false,
        ao: 0.5
      });
      break;
    }

    case "clutter": {
      // A few small scattered boxes, deterministic per position.
      const seed = Math.round(def.x * 3 + def.y);
      for (let i = 0; i < 3; i++) {
        const r = ((Math.sin(seed + i * 7.13) + 1) / 2) * 0.6;
        const s = 6 + r * 7;
        fillPrism(
          g,
          b.x + r * (b.w - s),
          b.y + ((Math.cos(seed + i * 3.7) + 1) / 2) * (b.h - s),
          s,
          s,
          H + r * 6,
          [PALETTE.box, PALETTE.woodDark, PALETTE.fabricDark][i % 3],
          { ao: 0.5 }
        );
      }
      break;
    }

    // ---------------- lighting and greenery ----------------
    case "lamp": {
      fillCylinder(g, def.x, def.y, 5, 5, 1.5, PALETTE.metal, {});
      fillCylinder(g, def.x, def.y, 1.2, 1.2, H - 9, PALETTE.metal, { baseZ: 1.5, shadow: false });
      fillCylinder(g, def.x, def.y, 7, 7, 8, PALETTE.lampShade, {
        baseZ: H - 8,
        shadow: false,
        topColor: shade(PALETTE.lampShade, 1.3)
      });
      // Pool of warm light on the floor beneath.
      for (let i = 3; i >= 1; i--) {
        const r = 10 + i * 7;
        fillDiamond(g, def.x - r, def.y - r, r * 2, r * 2, PALETTE.lampGlow, 0.035);
      }
      break;
    }

    case "streetLamp": {
      fillCylinder(g, def.x, def.y, 6, 6, 3, 0x2c2f36, {});
      fillCylinder(g, def.x, def.y, 1.8, 1.8, H - 3, PALETTE.metal, { baseZ: 3, shadow: false });
      // Arm and head, cantilevered.
      fillPrism(g, def.x - 1.5, def.y - 12, 3, 12, 3, PALETTE.metal, {
        baseZ: H - 3,
        shadow: false
      });
      fillPrism(g, def.x - 4, def.y - 15, 8, 6, 4, 0x3a3f47, {
        baseZ: H - 6,
        shadow: false,
        topColor: 0x4a5058
      });
      for (let i = 4; i >= 1; i--) {
        const r = 12 + i * 11;
        fillDiamond(g, def.x - r, def.y - 12 - r, r * 2, r * 2, PALETTE.lampGlow, 0.032);
      }
      break;
    }

    case "plant": {
      const r = Math.min(b.w, b.h) * 0.3;
      fillCylinder(g, def.x, def.y, r, r, H * 0.42, PALETTE.plantPot, {
        topColor: shade(PALETTE.plantPot, 0.7)
      });
      // Foliage: overlapping blobs at varied heights.
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const lr = r * (0.5 + (i % 2) * 0.28);
        fillCylinder(
          g,
          def.x + Math.cos(a) * r * 0.5,
          def.y + Math.sin(a) * r * 0.5,
          lr,
          lr,
          H * 0.3,
          i % 2 ? PALETTE.plantLeaf : shade(PALETTE.plantLeaf, 0.78),
          { baseZ: H * 0.42 + (i % 3) * 3, shadow: false }
        );
      }
      break;
    }

    case "bush": {
      const r = Math.min(b.w, b.h) * 0.34;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        fillCylinder(
          g,
          def.x + Math.cos(a) * r * 0.55,
          def.y + Math.sin(a) * r * 0.55,
          r * 0.72,
          r * 0.72,
          H * (0.7 + (i % 2) * 0.3),
          i % 2 ? PALETTE.bush : shade(PALETTE.bush, 0.8),
          { shadow: i === 0 }
        );
      }
      break;
    }

    case "tree": {
      const tr = Math.min(b.w, b.h) * 0.12;
      fillCylinder(g, def.x, def.y, tr, tr, H * 0.45, PALETTE.trunk, {});
      const cr = Math.min(b.w, b.h) * 0.42;
      // Canopy: three stacked, offset blobs so it isn't a perfect cone.
      for (let i = 0; i < 3; i++) {
        const s = 1 - i * 0.26;
        fillCylinder(
          g,
          def.x + (i - 1) * cr * 0.12,
          def.y + (i % 2 ? -1 : 1) * cr * 0.1,
          cr * s,
          cr * s,
          H * 0.24,
          i === 0 ? PALETTE.leafDark : PALETTE.leaf,
          { baseZ: H * 0.4 + i * H * 0.17, shadow: false }
        );
      }
      break;
    }

    // ---------------- outdoor structures ----------------
    case "car": {
      fillPrism(g, b.x, b.y, b.w, b.h, H * 0.62, PALETTE.carBody, { ao: 0.55 });
      // Cabin, inset from the body.
      const iw = b.w * (backNorth ? 0.62 : 0.78);
      const ih = b.h * (backNorth ? 0.78 : 0.62);
      fillPrism(
        g,
        b.x + (b.w - iw) / 2,
        b.y + (b.h - ih) / 2,
        iw,
        ih,
        H * 0.38,
        PALETTE.carGlass,
        { baseZ: H * 0.62, shadow: false, topColor: shade(PALETTE.carBody, 1.1) }
      );
      // Wheels tucked under the near side.
      const wr = 4;
      for (const [wx, wy] of backNorth
        ? [
            [b.x + b.w * 0.2, b.y + b.h],
            [b.x + b.w * 0.8, b.y + b.h]
          ]
        : [
            [b.x + b.w, b.y + b.h * 0.2],
            [b.x + b.w, b.y + b.h * 0.8]
          ]) {
        fillCylinder(g, wx, wy, wr, wr, 3, 0x15171b, { shadow: false });
      }
      // Headlights on the leading edge.
      fillDiamond(g, b.x + b.w * 0.15, b.y - 2, b.w * 0.16, 2.5, PALETTE.lampGlow, 0.8);
      fillDiamond(g, b.x + b.w * 0.69, b.y - 2, b.w * 0.16, 2.5, PALETTE.lampGlow, 0.8);
      break;
    }

    case "shed": {
      fillPrism(g, b.x, b.y, b.w, b.h, H * 0.7, PALETTE.wood, { ao: 0.7 });
      // Pitched roof, faked as two overhanging slabs.
      fillPrism(g, b.x - 3, b.y - 3, b.w + 6, b.h + 6, 4, PALETTE.woodDark, {
        baseZ: H * 0.7,
        shadow: false,
        topColor: shade(PALETTE.woodDark, 1.2)
      });
      fillPrism(g, b.x + 4, b.y + 4, b.w - 8, b.h - 8, 6, PALETTE.woodDark, {
        baseZ: H * 0.7 + 4,
        shadow: false,
        topColor: shade(PALETTE.woodDark, 1.35)
      });
      // Door on the near face.
      if (backNorth) {
        fillPrism(g, b.x + b.w * 0.34, b.y + b.h - 1, b.w * 0.32, 1, H * 0.5, PALETTE.woodDark, {
          baseZ: 0,
          shadow: false,
          bevel: false
        });
      } else {
        fillPrism(g, b.x + b.w - 1, b.y + b.h * 0.34, 1, b.h * 0.32, H * 0.5, PALETTE.woodDark, {
          baseZ: 0,
          shadow: false,
          bevel: false
        });
      }
      break;
    }

    case "fence": {
      const along = backNorth;
      const span = along ? b.w : b.h;
      const posts = Math.max(2, Math.round(span / 16));
      for (let i = 0; i <= posts; i++) {
        const t = i / posts;
        fillPrism(
          g,
          along ? b.x + t * (span - 3) : b.x,
          along ? b.y : b.y + t * (span - 3),
          along ? 3 : b.w,
          along ? b.h : 3,
          H,
          PALETTE.fence,
          { shadow: i === 0, bevel: false }
        );
      }
      // Two horizontal rails.
      for (const z of [H * 0.35, H * 0.72]) {
        fillPrism(g, b.x, b.y, along ? b.w : b.w, along ? b.h : b.h, 2.5, shade(PALETTE.fence, 0.85), {
          baseZ: z,
          shadow: false,
          bevel: false,
          outline: false
        });
      }
      break;
    }

    case "trashCan": {
      const r = Math.min(b.w, b.h) * 0.36;
      fillCylinder(g, def.x, def.y, r, r, H, PALETTE.metal, {
        topColor: shade(PALETTE.metal, 1.25)
      });
      fillCylinder(g, def.x, def.y, r * 1.1, r * 1.1, 1.6, shade(PALETTE.metal, 1.15), {
        baseZ: H,
        shadow: false
      });
      break;
    }

    default:
      fillPrism(g, b.x, b.y, b.w, b.h, H, PALETTE.wood, { ao: 0.55 });
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Build every furniture piece on a floor.
 *
 * Decals are painted into the shared `ground` graphics so they can never sort
 * above a prop standing on them. Volumes each get their own Graphics object and
 * a depth derived from their footprint centre, which is what lets the player
 * walk convincingly behind a bookcase and in front of a couch.
 */
export function spawnIsoFurniture(
  scene: Phaser.Scene,
  layout: FloorLayout,
  ground: Phaser.GameObjects.Graphics
): void {
  // Decals first, so road paint lands under kerbs and rugs under road surfaces.
  const defs = [...(layout.furniture ?? [])];
  for (const def of defs) {
    if (FLOOR_DECALS.has(def.kind)) drawDecal(ground, def);
  }

  for (const def of defs) {
    if (FLOOR_DECALS.has(def.kind)) continue;
    const g = scene.add.graphics();
    if (WALL_MOUNTED.has(def.kind)) {
      drawWallMounted(g, def);
      // Mounted flat against the far wall: sort with the wall, not the room.
      g.setDepth(depthOfCentre(def.x, def.y, DepthBias.DECAL));
    } else {
      drawPiece(g, def);
      g.setDepth(depthOfCentre(def.x, def.y, DepthBias.PROP));
    }
  }
}

/** Exposed for the preview scene, which renders a reduced prop set. */
export { drawPiece as drawIsoFurniturePiece, boxOf as furnitureBox };
export type { FurnitureKind };
export { ROUND_KINDS, mix };
