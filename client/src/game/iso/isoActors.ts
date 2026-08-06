import Phaser from "phaser";
import type { FloorLayout } from "../house/floors";
import {
  CHEST_KEY_ID,
  PALETTE,
  type InteractableDef
} from "../house/houseLayout";
import type { Skin } from "../skins";
import { fillCylinder, fillDiamond, fillPrism, fillShadow, shade } from "./isoDraw";
import { DepthBias, KX, KY, depthOf, toIso } from "./projection";

/** Horizontal:vertical ratio of the projection, for squashing floor rings. */
const KX_RATIO = KX;

// ---------------------------------------------------------------------------
// Actors: characters, loot and searchable containers.
//
// BILLBOARDING. Props are skewed into the floor plane because they are part of
// the architecture. Characters are not — they are drawn upright and simply
// positioned and lifted, the way a sprite is in every isometric game ever
// shipped. Skewing a face into a diamond makes it unreadable, and readability
// of the player and the cat is the single most important thing on screen.
//
// What sells them as being IN the world rather than on top of it is the contact
// shadow: an ellipse squashed to the projection's ratio, drawn on the floor and
// moving with the actor. Without it characters appear to hover.
// ---------------------------------------------------------------------------

export interface MoneyMarker {
  x: number;
  y: number;
  container: Phaser.GameObjects.Container;
  collected: boolean;
}

export interface InteractableMarker {
  def: InteractableDef;
  container: Phaser.GameObjects.Container;
  opened: boolean;
  lockVisual?: Phaser.GameObjects.GameObject;
  highlight?: Phaser.GameObjects.GameObject;
}

/**
 * Move an actor to a world position: project to screen, and re-derive its depth
 * so it sorts correctly against every prop this frame. Call this instead of
 * `container.setPosition` anywhere an actor moves.
 */
export function placeActor(
  obj: Phaser.GameObjects.Container,
  wx: number,
  wy: number,
  z = 0
): void {
  const p = toIso(wx, wy, z);
  obj.setPosition(p.x, p.y);
  obj.setDepth(depthOf(wx, wy, DepthBias.ACTOR));
}

/** Same, for anything that should sort as loot rather than as an actor. */
export function placeLoot(obj: Phaser.GameObjects.Container, wx: number, wy: number, z = 0): void {
  const p = toIso(wx, wy, z);
  obj.setPosition(p.x, p.y);
  obj.setDepth(depthOf(wx, wy, DepthBias.LOOT));
}

// ---------------------------------------------------------------------------
// Characters
// ---------------------------------------------------------------------------

/**
 * Contact shadow that lives inside an actor's own container. Because the
 * container is positioned at the actor's projected floor point, the shadow sits
 * at local (0, 0) and needs no separate tracking.
 */
function actorShadow(scene: Phaser.Scene, radius: number, alpha = 0.42) {
  const g = scene.add.graphics();
  for (let i = 3; i >= 1; i--) {
    const t = i / 3;
    g.fillStyle(0x000000, (alpha / 3) * (1.4 - t * 0.5));
    // Squashed to the projection ratio so it lies convincingly on the floor.
    g.fillEllipse(0, 0, radius * 2.1 * t, radius * 2.1 * t * (KY / KX_RATIO) * 1.0);
  }
  return g;
}

/**
 * The player: a chunky standing figure. Built bottom-up so the pieces overlap
 * correctly — feet, torso, then head, then whatever the skin adds on top.
 */
export function buildIsoPlayer(
  scene: Phaser.Scene,
  wx: number,
  wy: number,
  color: number,
  skin?: Skin
): Phaser.GameObjects.Container {
  const parts: Phaser.GameObjects.GameObject[] = [];
  const alpha = skin?.alpha ?? 1;

  parts.push(actorShadow(scene, 11));

  const body = scene.add.graphics();

  // Outer glow, for skins that carry one.
  if (skin?.glow) {
    for (let i = 3; i >= 1; i--) {
      body.fillStyle(color, 0.07);
      body.fillCircle(0, -20, 20 + i * 5);
    }
  }

  // --- legs ---
  body.fillStyle(shade(color, 0.42), alpha);
  body.fillRoundedRect(-8, -12, 6, 13, 3);
  body.fillRoundedRect(2, -12, 6, 13, 3);

  // --- torso: a tapered slab, lit from upper left ---
  body.fillStyle(shade(color, 0.62), alpha);
  body.fillRoundedRect(-11, -30, 22, 20, 6);
  body.fillStyle(color, alpha);
  body.fillRoundedRect(-11, -30, 13, 20, 6);
  body.fillStyle(shade(color, 1.18), alpha);
  body.fillRoundedRect(-10, -29, 6, 8, 3);

  // --- arms ---
  body.fillStyle(shade(color, 0.5), alpha);
  body.fillRoundedRect(-14, -28, 5, 14, 2.5);
  body.fillRoundedRect(9, -28, 5, 14, 2.5);

  // --- head ---
  body.fillStyle(shade(color, 1.05), alpha);
  body.fillCircle(0, -38, 11);
  body.fillStyle(shade(color, 1.22), alpha);
  body.fillCircle(-3, -41, 7);
  body.lineStyle(1.5, 0x05050a, alpha * 0.6);
  body.strokeCircle(0, -38, 11);

  parts.push(body);

  // --- skin pattern on the head ---
  const face = scene.add.graphics();
  const eyeColor = skin?.eyeGlow ?? (skin?.pattern === "mask" || skin?.pattern === "panda" ? 0xfff4d0 : 0x0a0a0f);

  switch (skin?.pattern) {
    case "mask":
      face.fillStyle(0x14141c, alpha * 0.9);
      face.fillRoundedRect(-11, -42, 22, 8, 2);
      break;
    case "stripe":
      face.fillStyle(0x000000, alpha * 0.3);
      face.fillRect(-10, -44, 20, 2.5);
      face.fillRect(-11, -39, 22, 2.5);
      break;
    case "spots":
      face.fillStyle(0x000000, alpha * 0.28);
      face.fillCircle(-6, -42, 3);
      face.fillCircle(5, -36, 2.4);
      break;
    case "panda":
      face.fillStyle(0x1b1b22, alpha * 0.9);
      face.fillCircle(-4.5, -40, 4.2);
      face.fillCircle(4.5, -40, 4.2);
      break;
    case "circuit":
      face.lineStyle(1.2, 0x0a2a30, alpha * 0.8);
      face.strokeRect(-8, -43, 16, 1);
      face.strokeRect(-9, -36, 18, 1);
      face.fillStyle(0xfff27a, alpha);
      face.fillCircle(6, -35, 1.6);
      break;
    case "skull":
      face.fillStyle(0x1b1b22, alpha);
      face.fillCircle(-4, -40, 3.6);
      face.fillCircle(4, -40, 3.6);
      face.fillRect(-4, -33, 8, 4);
      face.fillStyle(color, alpha);
      face.fillRect(-0.7, -33, 1.4, 4);
      break;
    default:
      break;
  }

  // Eyes, unless the skull already replaced them.
  if (skin?.pattern !== "skull") {
    face.fillStyle(eyeColor, alpha);
    const r = skin?.accessory === "antenna" ? 2.6 : 1.9;
    face.fillCircle(-4, -39, r);
    face.fillCircle(4, -39, r);
    if (skin?.eyeGlow) {
      face.fillStyle(eyeColor, alpha * 0.3);
      face.fillCircle(-4, -39, r * 2.4);
      face.fillCircle(4, -39, r * 2.4);
    }
  }
  parts.push(face);

  // --- accessories ---
  const acc = scene.add.graphics();
  switch (skin?.accessory) {
    case "cap":
      acc.fillStyle(0x2b2b45, alpha);
      acc.fillRoundedRect(-11, -50, 22, 8, 3);
      acc.fillStyle(0x1d1d30, alpha);
      acc.fillRoundedRect(2, -45, 14, 3.5, 1.5);
      break;
    case "beanie":
      acc.fillStyle(0x3b4a63, alpha);
      acc.fillRoundedRect(-11, -51, 22, 9, 4);
      acc.fillStyle(0x2a374c, alpha);
      acc.fillRoundedRect(-12, -45, 24, 4, 2);
      acc.fillStyle(0x53506a, alpha);
      acc.fillCircle(0, -54, 3.2);
      break;
    case "crown":
      acc.fillStyle(0xffd633, alpha);
      acc.fillRect(-9, -50, 18, 4);
      acc.fillTriangle(-9, -49, -5, -49, -7, -56);
      acc.fillTriangle(-2, -49, 2, -49, 0, -57);
      acc.fillTriangle(5, -49, 9, -49, 7, -56);
      break;
    case "halo":
      acc.lineStyle(2.5, 0xffe488, alpha);
      acc.strokeEllipse(0, -53, 22, 8);
      break;
    case "ears":
      acc.fillStyle(color, alpha);
      acc.fillTriangle(-10, -46, -2, -46, -6, -56);
      acc.fillTriangle(2, -46, 10, -46, 6, -56);
      acc.lineStyle(1.2, 0x05050a, alpha * 0.7);
      acc.strokeTriangle(-10, -46, -2, -46, -6, -56);
      acc.strokeTriangle(2, -46, 10, -46, 6, -56);
      break;
    case "antenna":
      acc.fillStyle(color, alpha);
      acc.fillRect(-6, -55, 1.8, 9);
      acc.fillRect(4.2, -55, 1.8, 9);
      acc.fillCircle(-5, -56, 2.8);
      acc.fillCircle(5, -56, 2.8);
      break;
    case "sheet":
      acc.fillStyle(color, alpha * 0.7);
      acc.fillTriangle(-12, -10, -5, -10, -8.5, -1);
      acc.fillTriangle(-4, -10, 3, -10, -0.5, -1);
      acc.fillTriangle(4, -10, 11, -10, 7.5, -1);
      break;
    default:
      break;
  }
  parts.push(acc);

  const c = scene.add.container(0, 0, parts);
  placeActor(c, wx, wy);
  return c;
}

/**
 * The cat. Deliberately lower and longer than the player so its silhouette is
 * instantly distinguishable at a glance, which matters when it is chasing you.
 */
export function buildIsoCat(
  scene: Phaser.Scene,
  wx: number,
  wy: number
): Phaser.GameObjects.Container {
  const parts: Phaser.GameObjects.GameObject[] = [];
  parts.push(actorShadow(scene, 12, 0.5));

  const g = scene.add.graphics();
  const fur = PALETTE.cat;

  // Tail, curling up behind.
  g.lineStyle(4, shade(fur, 0.8), 1);
  g.beginPath();
  g.moveTo(9, -8);
  g.lineTo(16, -12);
  g.lineTo(19, -21);
  g.strokePath();

  // Low, long body.
  g.fillStyle(shade(fur, 0.85), 1);
  g.fillEllipse(0, -10, 28, 16);
  g.fillStyle(fur, 1);
  g.fillEllipse(-2, -12, 24, 13);

  // Legs.
  g.fillStyle(shade(fur, 0.6), 1);
  g.fillRoundedRect(-10, -6, 4.5, 7, 2);
  g.fillRoundedRect(5, -6, 4.5, 7, 2);

  // Head.
  g.fillStyle(shade(fur, 1.15), 1);
  g.fillCircle(-9, -21, 9);
  g.lineStyle(1.2, 0x000000, 0.5);
  g.strokeCircle(-9, -21, 9);

  // Ears.
  g.fillStyle(PALETTE.catEar, 1);
  g.fillTriangle(-16, -25, -10, -25, -14, -33);
  g.fillTriangle(-8, -25, -2, -25, -4, -33);

  // Eyes: the one part that must always read, so they get a glow.
  g.fillStyle(0xffe23a, 0.28);
  g.fillCircle(-12, -22, 4.5);
  g.fillCircle(-6, -22, 4.5);
  g.fillStyle(0xffe23a, 1);
  g.fillEllipse(-12, -22, 4, 5);
  g.fillEllipse(-6, -22, 4, 5);
  g.fillStyle(0x0a0a0f, 1);
  g.fillEllipse(-12, -22, 1.4, 4.6);
  g.fillEllipse(-6, -22, 1.4, 4.6);

  parts.push(g);

  const c = scene.add.container(0, 0, parts);
  placeActor(c, wx, wy);
  return c;
}

// ---------------------------------------------------------------------------
// Loot
// ---------------------------------------------------------------------------

/** Loot glyphs, rotated through so a level's pickups don't read as identical. */
const LOOT_KINDS = ["cash", "ring", "trophy", "gem", "watch", "chocolate"] as const;
type LootKind = (typeof LOOT_KINDS)[number];

const LOOT_RARITY: Record<LootKind, { color: number; ring: number }> = {
  cash: { color: 0x6ede8a, ring: 0x9aa3b5 },
  chocolate: { color: 0x8a5a3a, ring: 0x9aa3b5 },
  watch: { color: 0xc0c6d2, ring: 0x4c9aff },
  ring: { color: 0xe8e2ff, ring: 0x4c9aff },
  gem: { color: 0x4cd6ff, ring: 0xf5c542 },
  trophy: { color: 0xffd633, ring: 0xf5c542 }
};

/**
 * Draw a loot glyph centred on a SCREEN point. The shapes are deliberately not
 * projected: loot is billboarded so it stays readable at any distance, exactly
 * like the characters.
 */
function drawLootGlyphAt(g: Phaser.GameObjects.Graphics, kind: LootKind, ax: number, ay: number) {
  const c = LOOT_RARITY[kind].color;
  const X = (v: number) => ax + v;
  const Y = (v: number) => ay + v;
  switch (kind) {
    case "cash":
      g.fillStyle(0x2f6b45, 1);
      g.fillRoundedRect(X(-8), Y(-5), 16, 10, 2);
      g.fillStyle(c, 1);
      g.fillRoundedRect(X(-7), Y(-4), 14, 8, 2);
      g.fillStyle(0x2f6b45, 1);
      g.fillCircle(X(0), Y(0), 2.6);
      break;
    case "ring":
      g.lineStyle(2.6, 0xf5d76e, 1);
      g.strokeCircle(X(0), Y(2), 5.5);
      g.fillStyle(c, 1);
      g.fillTriangle(X(-3.4), Y(-3.5), X(3.4), Y(-3.5), X(0), Y(-9));
      break;
    case "trophy":
      g.fillStyle(c, 1);
      g.fillRoundedRect(X(-5), Y(-8), 10, 9, 2);
      g.fillRect(X(-1.6), Y(1), 3.2, 4);
      g.fillRoundedRect(X(-4.5), Y(5), 9, 2.6, 1);
      g.lineStyle(1.6, c, 1);
      g.strokeCircle(X(-6.5), Y(-5), 2.6);
      g.strokeCircle(X(6.5), Y(-5), 2.6);
      break;
    case "gem":
      g.fillStyle(c, 1);
      g.fillTriangle(X(-6), Y(-2), X(6), Y(-2), X(0), Y(8));
      g.fillTriangle(X(-6), Y(-2), X(0), Y(-8), X(0), Y(-2));
      g.fillStyle(shade(c, 1.4), 1);
      g.fillTriangle(X(0), Y(-8), X(6), Y(-2), X(0), Y(-2));
      break;
    case "watch":
      g.fillStyle(0x3a3f4a, 1);
      g.fillRoundedRect(X(-2.4), Y(-9), 4.8, 18, 2);
      g.fillStyle(c, 1);
      g.fillCircle(X(0), Y(0), 5.4);
      g.fillStyle(0x1a1d22, 1);
      g.fillCircle(X(0), Y(0), 3.6);
      g.lineStyle(1.2, c, 1);
      g.beginPath();
      g.moveTo(X(0), Y(0));
      g.lineTo(X(0), Y(-2.6));
      g.moveTo(X(0), Y(0));
      g.lineTo(X(2.2), Y(0.6));
      g.strokePath();
      break;
    case "chocolate":
      g.fillStyle(0x5a3a24, 1);
      g.fillRoundedRect(X(-7), Y(-5), 14, 10, 1.5);
      g.fillStyle(c, 1);
      g.fillRoundedRect(X(-6), Y(-4), 12, 8, 1);
      g.lineStyle(1, 0x4a2f1c, 1);
      g.strokeRect(X(-2), Y(-4), 0.1, 8);
      g.strokeRect(X(2), Y(-4), 0.1, 8);
      g.strokeRect(X(-6), Y(0), 12, 0.1);
      break;
  }
}

/**
 * A loot pickup: a glowing floor ring plus a hovering, bobbing glyph. The floor
 * ring is what makes loot findable in a cluttered isometric room — a glyph
 * alone disappears behind furniture.
 */
export function spawnIsoMoney(scene: Phaser.Scene, layout: FloorLayout): MoneyMarker[] {
  return layout.moneySpots.map((spot, i) => {
    const kind = LOOT_KINDS[i % LOOT_KINDS.length];
    const rarity = LOOT_RARITY[kind];

    // COORDINATE SPACES — the one thing to get right in this file.
    //
    // The floor marker is WORLD geometry: it is drawn at absolute world
    // coordinates and skewed into the floor plane by the projection, so it
    // lies flat like a decal. The glyph is SCREEN art: it is drawn upright at
    // the projected anchor point, offset in screen pixels.
    //
    // Both live in a container pinned at the origin, so the container applies
    // no translation of its own. Passing already-projected coordinates through
    // a translated container would apply the projection offset twice and fling
    // the marker outside the building.
    const anchor = toIso(spot.x, spot.y);

    const floor = scene.add.graphics();
    for (let r = 3; r >= 1; r--) {
      const rad = 8 + r * 5;
      fillDiamond(floor, spot.x - rad, spot.y - rad, rad * 2, rad * 2, rarity.ring, 0.06 + (3 - r) * 0.04);
    }
    floor.lineStyle(1.5, rarity.ring, 0.5);
    floor.strokeEllipse(anchor.x, anchor.y, 34, 34 * (KY / KX_RATIO));

    const glyph = scene.add.graphics();
    glyph.fillStyle(rarity.color, 0.16);
    glyph.fillCircle(anchor.x, anchor.y - 22, 13);
    drawLootGlyphAt(glyph, kind, anchor.x, anchor.y - 22);

    const container = scene.add.container(0, 0, [floor, glyph]);
    container.setDepth(depthOf(spot.x, spot.y, DepthBias.LOOT));

    scene.tweens.add({
      targets: glyph,
      y: -7,
      duration: 1100,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut"
    });
    scene.tweens.add({
      targets: floor,
      alpha: { from: 0.55, to: 1 },
      duration: 1100,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut"
    });

    return { x: spot.x, y: spot.y, container, collected: false };
  });
}

// ---------------------------------------------------------------------------
// Interactables
// ---------------------------------------------------------------------------

/**
 * Searchable containers. Each is a real volume so it occludes and is occluded
 * like any other prop, with a pulsing highlight ring on the floor beneath.
 */
export function spawnIsoInteractables(
  scene: Phaser.Scene,
  layout: FloorLayout
): InteractableMarker[] {
  return layout.interactables.map((def) => {
    const isChest = def.kind === "chest";
    const markerColor = isChest ? 0xffd633 : 0x6fc7ff;
    // Absolute world coordinates. See the note in spawnIsoMoney: these shapes
    // are already projected, so their container must stay pinned at the origin.
    const X = def.x;
    const Y = def.y;
    const anchor = toIso(X, Y);

    // --- floor highlight ---
    const highlight = scene.add.graphics();
    const R = isChest ? 26 : 21;
    for (let i = 3; i >= 1; i--) {
      const r = R + i * 4;
      fillDiamond(highlight, X - r, Y - r, r * 2, r * 2, markerColor, 0.05);
    }
    highlight.lineStyle(1.5, markerColor, 0.55);
    highlight.strokeEllipse(anchor.x, anchor.y, R * 2.4, R * 2.4 * (KY / KX_RATIO));

    // --- the container volume ---
    const g = scene.add.graphics();
    if (isChest) {
      fillPrism(g, X - 16, Y - 11, 32, 22, 13, PALETTE.chest, { ao: 0.6 });
      fillPrism(g, X - 16, Y - 11, 32, 22, 7, PALETTE.chestTrim, {
        baseZ: 13,
        shadow: false,
        topColor: shade(PALETTE.chestTrim, 1.2)
      });
      // Iron banding across the lid.
      fillPrism(g, X - 5, Y - 11, 3, 22, 21, PALETTE.metal, {
        shadow: false,
        bevel: false,
        outline: false
      });
      if (def.locked) {
        fillPrism(g, X - 3, Y + 8, 6, 4, 6, PALETTE.chestLock, {
          baseZ: 11,
          shadow: false,
          topColor: shade(PALETTE.chestLock, 1.3)
        });
      }
    } else if (def.kind === "box") {
      fillPrism(g, X - 14, Y - 14, 28, 28, 18, PALETTE.box, {
        ao: 0.55,
        topColor: shade(PALETTE.box, 1.15)
      });
      // Open flaps.
      fillPrism(g, X - 14, Y - 14, 28, 3, 5, PALETTE.boxFlap, { baseZ: 18, shadow: false });
      fillPrism(g, X - 14, Y + 11, 28, 3, 5, PALETTE.boxFlap, { baseZ: 18, shadow: false });
    } else {
      // Cabinet.
      fillPrism(g, X - 15, Y - 10, 30, 20, 26, PALETTE.cabinet, {
        ao: 0.6,
        topColor: shade(PALETTE.cabinet, 1.2)
      });
      fillPrism(g, X - 15, Y + 9, 30, 1, 22, PALETTE.cabinetDark, {
        baseZ: 2,
        shadow: false,
        bevel: false
      });
      fillPrism(g, X - 1, Y + 9, 2, 1.6, 5, 0x9a8866, {
        baseZ: 12,
        shadow: false,
        bevel: false,
        outline: false
      });
    }

    const container = scene.add.container(0, 0, [highlight, g]);
    // Solid volumes: sort them as props, not as loot.
    container.setDepth(depthOf(X, Y, DepthBias.PROP));

    scene.tweens.add({
      targets: highlight,
      alpha: { from: 0.4, to: 1 },
      duration: 1250,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut"
    });

    let lockVisual: Phaser.GameObjects.GameObject | undefined;
    if (def.locked && def.keyId === CHEST_KEY_ID) {
      const lock = scene.add.graphics();
      lock.fillStyle(PALETTE.chestLock, 1);
      lock.fillRoundedRect(anchor.x - 4, anchor.y - 34, 8, 7, 1.5);
      lock.lineStyle(1.6, PALETTE.chestLock, 1);
      lock.strokeCircle(anchor.x, anchor.y - 35, 3);
      container.add(lock);
      lockVisual = lock;
    }

    return { def, container, opened: false, lockVisual, highlight };
  });
}

/** Visual state change once a container has been searched. */
export function applyIsoOpenedVisual(item: InteractableMarker) {
  item.opened = true;
  item.highlight?.destroy();
  item.highlight = undefined;
  item.lockVisual?.destroy();
  item.lockVisual = undefined;
  item.container.setAlpha(0.55);
}

/** Ambient dust motes, drifting in the projected plane. Pure atmosphere. */
export function spawnIsoDust(scene: Phaser.Scene, count = 26) {
  for (let i = 0; i < count; i++) {
    const wx = Math.random() * 1280;
    const wy = Math.random() * 720;
    const p = toIso(wx, wy, 10 + Math.random() * 40);
    const d = scene.add.circle(p.x, p.y, 0.8 + Math.random() * 1.2, 0xffffff, 0.16);
    d.setDepth(depthOf(wx, wy, DepthBias.OVERLAY));
    scene.tweens.add({
      targets: d,
      y: p.y - (18 + Math.random() * 26),
      x: p.x + (Math.random() - 0.5) * 30,
      alpha: { from: 0.16, to: 0 },
      duration: 5000 + Math.random() * 5000,
      repeat: -1,
      delay: Math.random() * 4000
    });
  }
}

export { fillShadow, fillCylinder };
