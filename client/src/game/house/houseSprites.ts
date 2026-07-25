import Phaser from "phaser";
import {
  PALETTE,
  WORLD,
  type FurnitureDef,
  type InteractableDef,
  type Rect
} from "./houseLayout";
import { type FloorExit, type FloorLayout } from "./floors";

// Depth bands (floor=0, doors=1, labels=2, interactables=3, cat=4, player=5,
// money=6). Furniture sits between the floor and the interactables so cabinets,
// the chest, coins and characters always render on top and stay readable.
const DEPTH_RUG = 1;
const DEPTH_FURNITURE = 2;

// Cool moonlit blue used for the top-floor escape window.
const WINDOW_GLASS = 0x2b4a6e;
const WINDOW_GLASS_DARK = 0x16273d;
const WINDOW_MARKER = 0x5fb0ff;
// Warm amber used to highlight stairs.
const STAIRS_MARKER = 0xffb648;
const STAIRS_TREAD = 0x4a3f2c;
const STAIRS_TREAD_LIGHT = 0x6b5a3c;

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
}

export interface HouseWorldResult {
  backDoor: { x: number; y: number };
  escapeMarker: Phaser.GameObjects.Rectangle;
}

export interface InteractUi {
  interactPrompt: Phaser.GameObjects.Text;
  feedbackText: Phaser.GameObjects.Text;
}

function drawRect(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: number,
  line: number,
  lineWidth: number
) {
  scene.add
    .rectangle(x + w / 2, y + h / 2, w, h, fill)
    .setStrokeStyle(lineWidth, line)
    .setDepth(0);
}

function drawDoor(scene: Phaser.Scene, x: number, y: number, w: number, h: number) {
  scene.add.rectangle(x, y, w, h, PALETTE.hallway).setDepth(1);
}

/** A wooden escape door (floor 1). */
function drawDoorExit(
  scene: Phaser.Scene,
  cx: number,
  cy: number
): Phaser.GameObjects.Rectangle {
  const doorW = 20;
  const doorH = 72;
  const escapePad = 3;
  const escapeMarker = scene.add
    .rectangle(0, 0, doorW + 6 + escapePad * 2, doorH + 6 + escapePad * 2)
    .setStrokeStyle(2, PALETTE.attic, 0.9)
    .setFillStyle(PALETTE.attic, 0.04);
  const frame = scene.add
    .rectangle(0, 0, doorW + 6, doorH + 6, PALETTE.doorWoodDark)
    .setStrokeStyle(2, PALETTE.outline);
  const panel = scene.add
    .rectangle(0, 0, doorW, doorH, PALETTE.doorWood)
    .setStrokeStyle(2, PALETTE.outline);
  const inset = scene.add.rectangle(0, 0, doorW - 6, doorH - 10, PALETTE.doorWoodDark, 0.55);
  const handle = scene.add
    .rectangle(-doorW / 2 + 5, 2, 2, 10, PALETTE.doorHandle)
    .setStrokeStyle(1, PALETTE.outline);
  scene.add.container(cx, cy, [escapeMarker, frame, panel, inset, handle]).setDepth(1);
  return escapeMarker;
}

/** A flight of stairs going up (floors 2-3). */
function drawStairsExit(
  scene: Phaser.Scene,
  cx: number,
  cy: number
): Phaser.GameObjects.Rectangle {
  const w = 56;
  const h = 60;
  const escapeMarker = scene.add
    .rectangle(0, 0, w + 10, h + 10)
    .setStrokeStyle(2, STAIRS_MARKER, 0.9)
    .setFillStyle(STAIRS_MARKER, 0.05);
  const parts: Phaser.GameObjects.GameObject[] = [escapeMarker];
  const steps = 5;
  for (let i = 0; i < steps; i++) {
    const stepW = w - i * (w / (steps + 2));
    const stepY = h / 2 - 6 - i * (h / steps);
    parts.push(
      scene.add
        .rectangle(0, stepY, stepW, h / steps - 2, i % 2 ? STAIRS_TREAD_LIGHT : STAIRS_TREAD)
        .setStrokeStyle(1, PALETTE.outline)
    );
  }
  // Up arrow at the top of the flight.
  parts.push(
    scene.add.triangle(0, -h / 2 - 4, 0, 8, 7, -4, -7, -4, STAIRS_MARKER).setDepth(2)
  );
  scene.add.container(cx, cy, parts).setDepth(1);
  return escapeMarker;
}

/** An open escape window on the outer wall (top floor). */
function drawWindowExit(
  scene: Phaser.Scene,
  cx: number,
  cy: number
): Phaser.GameObjects.Rectangle {
  const w = 54;
  const h = 46;
  const escapeMarker = scene.add
    .rectangle(0, 0, w + 10, h + 10)
    .setStrokeStyle(2, WINDOW_MARKER, 0.9)
    .setFillStyle(WINDOW_MARKER, 0.05);
  const frame = scene.add
    .rectangle(0, 0, w + 6, h + 6, PALETTE.doorWoodDark)
    .setStrokeStyle(2, PALETTE.outline);
  const glass = scene.add.rectangle(0, 0, w, h, WINDOW_GLASS).setStrokeStyle(2, PALETTE.outline);
  const glassDark = scene.add.rectangle(0, 0, w - 6, h - 6, WINDOW_GLASS_DARK, 0.5);
  const barV = scene.add.rectangle(0, 0, 2, h, PALETTE.doorWoodDark);
  const barH = scene.add.rectangle(0, 0, w, 2, PALETTE.doorWoodDark);
  scene.add.container(cx, cy, [escapeMarker, frame, glass, glassDark, barV, barH]).setDepth(1);
  return escapeMarker;
}

function drawExit(scene: Phaser.Scene, exit: FloorExit): Phaser.GameObjects.Rectangle {
  if (exit.type === "stairs") return drawStairsExit(scene, exit.x, exit.y);
  if (exit.type === "window") return drawWindowExit(scene, exit.x, exit.y);
  return drawDoorExit(scene, exit.x, exit.y);
}

function exitCaption(type: FloorExit["type"]): string {
  if (type === "stairs") return "Stairs up";
  if (type === "window") return "Window";
  return "Exit door";
}

export function drawHouseWorld(scene: Phaser.Scene, layout: FloorLayout): HouseWorldResult {
  drawRect(scene, WORLD.x, WORLD.y, WORLD.w, WORLD.h, layout.tint, PALETTE.wallLine, 2);

  layout.rooms.forEach((room, i) => {
    const fill =
      room.key === "hallway" ? PALETTE.hallway : i % 2 ? PALETTE.floorAlt : layout.tint;
    drawRect(scene, room.x, room.y, room.w, room.h, fill, PALETTE.wallLine, 2);
  });

  // Doorway gaps in the hallway walls, derived from each room's connector.
  layout.connectors.forEach((c) => {
    const gapX = c.x + c.w / 2;
    const wallY = c.y < 270 ? 270 : 330; // top rooms join the hallway's top wall
    drawDoor(scene, gapX, wallY, 46, 14);
  });

  // Exit caption. The window sits on the top wall, so its label goes just BELOW
  // the marker (otherwise it renders on top of the window graphic); the door and
  // stairs captions stay near the top of their room where they never overlap.
  const exitRoom = layout.rooms.find((r) => r.key === layout.exit.roomKey);
  if (exitRoom) {
    const isWindow = layout.exit.type === "window";
    const capX = isWindow ? layout.exit.x : exitRoom.x + exitRoom.w / 2;
    const capY = isWindow ? layout.exit.y + 44 : exitRoom.y + 22;
    scene.add
      .text(capX, capY, exitCaption(layout.exit.type), {
        fontFamily: "Inter, sans-serif",
        fontSize: "12px",
        color: isWindow ? "#7fc0ff" : "#8a8690",
        align: "center"
      })
      .setOrigin(0.5)
      .setDepth(2);
  }

  const escapeMarker = drawExit(scene, layout.exit);
  const backDoor = { x: layout.exit.x, y: layout.exit.y };
  return { backDoor, escapeMarker };
}

export function buildInteractUi(scene: Phaser.Scene): InteractUi {
  const interactPrompt = scene.add
    .text(400, 568, "", {
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: "13px",
      color: PALETTE.interactHint,
      align: "center"
    })
    .setOrigin(0.5)
    .setDepth(20)
    .setVisible(false);

  const feedbackText = scene.add
    .text(400, 542, "", {
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: "14px",
      color: "#e8e4f0",
      align: "center",
      fontStyle: "bold"
    })
    .setOrigin(0.5)
    .setDepth(20)
    .setAlpha(0);

  return { interactPrompt, feedbackText };
}

export function showInteractFeedback(scene: Phaser.Scene, feedbackText: Phaser.GameObjects.Text, message: string) {
  feedbackText.setText(message);
  feedbackText.setAlpha(1);
  scene.tweens.killTweensOf(feedbackText);
  scene.tweens.add({
    targets: feedbackText,
    alpha: 0,
    duration: 1800,
    delay: 900,
    ease: "Quad.easeOut"
  });
}

export function applyOpenedVisual(item: InteractableMarker) {
  if (item.opened) return;
  item.opened = true;
  item.lockVisual?.destroy();
  item.lockVisual = undefined;
  item.container.setAlpha(0.72);
  if (item.def.kind === "chest") {
    item.container.setAngle(-4);
  } else if (item.def.kind === "box") {
    item.container.setScale(0.96, 0.9);
  }
}

function buildCabinet(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Container {
  const body = scene.add
    .rectangle(0, 0, 36, 48, PALETTE.cabinet)
    .setStrokeStyle(2, PALETTE.outline);
  const inset = scene.add.rectangle(0, 2, 28, 38, PALETTE.cabinetDark, 0.55);
  const handle = scene.add
    .rectangle(10, 0, 4, 10, PALETTE.doorHandle)
    .setStrokeStyle(1, PALETTE.outline);
  const legs = scene.add.rectangle(0, 26, 30, 6, PALETTE.cabinetDark);
  return scene.add.container(x, y, [legs, body, inset, handle]).setDepth(3);
}

function buildBox(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Container {
  const body = scene.add.rectangle(0, 4, 34, 28, PALETTE.box).setStrokeStyle(2, PALETTE.outline);
  const flap = scene.add
    .rectangle(0, -8, 34, 10, PALETTE.boxFlap)
    .setStrokeStyle(2, PALETTE.outline);
  const tape = scene.add.rectangle(0, 4, 6, 28, 0x8a7a62, 0.45);
  return scene.add.container(x, y, [body, tape, flap]).setDepth(3);
}

function buildChest(
  scene: Phaser.Scene,
  x: number,
  y: number,
  locked: boolean
): { container: Phaser.GameObjects.Container; lockVisual?: Phaser.GameObjects.GameObject } {
  const base = scene.add
    .rectangle(0, 6, 44, 28, PALETTE.chest)
    .setStrokeStyle(2, PALETTE.outline);
  const lid = scene.add
    .rectangle(0, -6, 46, 14, PALETTE.chestTrim)
    .setStrokeStyle(2, PALETTE.outline);
  const band = scene.add.rectangle(0, 6, 44, 4, PALETTE.chestTrim);
  const lock = locked
    ? scene.add
        .rectangle(0, 2, 8, 10, PALETTE.chestLock)
        .setStrokeStyle(1, PALETTE.outline)
    : undefined;
  const container = scene.add.container(x, y, [base, band, lid, ...(lock ? [lock] : [])]).setDepth(3);
  return { container, lockVisual: lock };
}

function buildInteractable(
  scene: Phaser.Scene,
  def: InteractableDef
): { container: Phaser.GameObjects.Container; lockVisual?: Phaser.GameObjects.GameObject } {
  if (def.kind === "box") return { container: buildBox(scene, def.x, def.y) };
  if (def.kind === "chest") return buildChest(scene, def.x, def.y, !!def.locked);
  return { container: buildCabinet(scene, def.x, def.y) };
}

export function spawnInteractables(scene: Phaser.Scene, layout: FloorLayout): InteractableMarker[] {
  return layout.interactables.map((def) => {
    const built = buildInteractable(scene, def);
    return {
      def,
      container: built.container,
      opened: false,
      lockVisual: built.lockVisual
    };
  });
}

function spawnMoneyMarker(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Container {
  // Dark contrast disc first: keeps the coin readable even on a light rug or
  // furniture, so loot never gets lost against the background.
  const backing = scene.add.circle(0, 0, 21, 0x05050a, 0.55);
  const whiteRing = scene.add.circle(0, 0, 22, 0xffffff, 0.42);
  const halo = scene.add.circle(0, 0, 19, PALETTE.moneyGlow, 0.38);
  const borderRing = scene.add.circle(0, 0, 16, PALETTE.outline);
  const coin = scene.add
    .circle(0, 0, 14, PALETTE.moneyGold, 1)
    .setStrokeStyle(3, PALETTE.outline, 1);
  const shine = scene.add.circle(-4, -4, 6, PALETTE.moneyHighlight, 0.6);
  const sign = scene.add
    .text(0, 1, "$", {
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: "22px",
      color: "#0a0a0f",
      fontStyle: "bold"
    })
    .setOrigin(0.5);
  const container = scene.add
    .container(x, y, [backing, whiteRing, halo, borderRing, coin, shine, sign])
    .setDepth(6);
  scene.tweens.add({
    targets: halo,
    scale: { from: 0.85, to: 1.45 },
    alpha: { from: 0.4, to: 0.08 },
    duration: 1200,
    yoyo: true,
    repeat: -1
  });
  scene.tweens.add({
    targets: whiteRing,
    scale: { from: 0.9, to: 1.2 },
    alpha: { from: 0.45, to: 0.12 },
    duration: 1400,
    yoyo: true,
    repeat: -1
  });
  return container;
}

export function spawnMoney(scene: Phaser.Scene, layout: FloorLayout): MoneyMarker[] {
  return layout.moneySpots.map((spot) => ({
    x: spot.x,
    y: spot.y,
    container: spawnMoneyMarker(scene, spot.x, spot.y),
    collected: false
  }));
}

export function buildPlayer(
  scene: Phaser.Scene,
  x: number,
  y: number,
  color = PALETTE.player
): Phaser.GameObjects.Container {
  const shadow = scene.add.ellipse(0, 12, 26, 10, 0x000000, 0.4);
  const body = scene.add.circle(0, 0, 12, color);
  const ring = scene.add.circle(0, 0, 12).setStrokeStyle(2, PALETTE.playerDark);
  const eyeL = scene.add.circle(-4, -3, 1.8, 0x0a0a0f);
  const eyeR = scene.add.circle(4, -3, 1.8, 0x0a0a0f);
  const dir = scene.add.triangle(0, 14, 0, 0, 5, 8, -5, 8, color);
  dir.setRotation(-Math.PI / 2);
  return scene.add.container(x, y, [shadow, dir, body, ring, eyeL, eyeR]).setDepth(5);
}

export function buildCat(
  scene: Phaser.Scene,
  x: number,
  y: number,
  bodyColor = PALETTE.cat,
  eyeColor = 0xffe23a
): Phaser.GameObjects.Container {
  const shadow = scene.add.ellipse(0, 14, 34, 12, 0x000000, 0.45);
  const earL = scene.add.triangle(-9, -12, 0, 0, 10, 0, 5, -12, PALETTE.catEar);
  const earR = scene.add.triangle(9, -12, 0, 0, 10, 0, 5, -12, PALETTE.catEar);
  const body = scene.add.ellipse(0, 0, 34, 28, bodyColor);
  const eyeL = scene.add.circle(-6, -2, 2.4, eyeColor);
  const eyeR = scene.add.circle(6, -2, 2.4, eyeColor);
  const tail = scene.add.ellipse(20, 6, 18, 6, bodyColor);
  return scene.add.container(x, y, [shadow, tail, earL, earR, body, eyeL, eyeR]).setDepth(4);
}

// ---------------------------------------------------------------------------
// Furniture & decoration. Each builder returns the child GameObjects for a
// single piece, positioned relative to the piece centre (0, 0); spawnFurniture
// wraps them in a container placed at the piece's world (x, y). Solid pieces get
// their collision from floors.ts (baked into the grid) — nothing here touches
// gameplay, this is purely visual.
// ---------------------------------------------------------------------------
type GO = Phaser.GameObjects.GameObject;

function rectPart(
  scene: Phaser.Scene,
  ox: number,
  oy: number,
  w: number,
  h: number,
  fill: number,
  line = PALETTE.outline,
  lineW = 2,
  alpha = 1
): Phaser.GameObjects.Rectangle {
  const r = scene.add.rectangle(ox, oy, w, h, fill, alpha);
  if (lineW > 0) r.setStrokeStyle(lineW, line);
  return r;
}

function buildFurniturePiece(scene: Phaser.Scene, def: FurnitureDef): GO[] {
  const w = def.w ?? 32;
  const h = def.h ?? 32;
  const P = PALETTE;
  switch (def.kind) {
    case "rug": {
      // Kept low-alpha and muted so bright coins on top always read clearly.
      const base = rectPart(scene, 0, 0, w, h, P.rug, P.rugTrim, 2, 0.22);
      const inner = rectPart(scene, 0, 0, w - 12, h - 12, P.rugAlt, P.rugTrim, 1, 0.16);
      return [base, inner];
    }
    case "couch": {
      const back = rectPart(scene, 0, -h / 2 + 5, w, 12, P.couchDark);
      const base = rectPart(scene, 0, 2, w, h - 6, P.couch);
      const cuL = rectPart(scene, -w / 4, 2, w / 2 - 6, h - 12, P.couchCushion, P.couchDark, 1);
      const cuR = rectPart(scene, w / 4, 2, w / 2 - 6, h - 12, P.couchCushion, P.couchDark, 1);
      const armL = rectPart(scene, -w / 2 + 5, 0, 10, h, P.couchDark);
      const armR = rectPart(scene, w / 2 - 5, 0, 10, h, P.couchDark);
      return [back, base, cuL, cuR, armL, armR];
    }
    case "coffeeTable": {
      const legs = rectPart(scene, 0, 0, w, h, P.woodDark);
      const top = rectPart(scene, 0, -2, w - 8, h - 8, P.woodLight);
      return [legs, top];
    }
    case "diningTable": {
      const chairs: GO[] = [
        rectPart(scene, -w / 2 - 6, 0, 12, 16, P.woodDark, P.outline, 1),
        rectPart(scene, w / 2 + 6, 0, 12, 16, P.woodDark, P.outline, 1),
        rectPart(scene, 0, -h / 2 - 6, 16, 12, P.woodDark, P.outline, 1),
        rectPart(scene, 0, h / 2 + 6, 16, 12, P.woodDark, P.outline, 1)
      ];
      const top = rectPart(scene, 0, 0, w, h, P.wood);
      const inlay = rectPart(scene, 0, 0, w - 12, h - 12, P.woodLight, P.woodDark, 1);
      return [...chairs, top, inlay];
    }
    case "tvStand": {
      const stand = rectPart(scene, 0, h / 2 - 12, w, 22, P.woodDark);
      const screen = rectPart(scene, 0, -h / 2 + 18, w + 20, 30, P.screen, P.outline, 2);
      const glow = rectPart(scene, 0, -h / 2 + 18, w + 12, 22, P.screenGlow, P.screenGlow, 0, 0.5);
      return [stand, screen, glow];
    }
    case "counter": {
      const base = rectPart(scene, 0, 3, w, h - 4, P.wood);
      const top = rectPart(scene, 0, -h / 2 + 4, w, 8, P.counterTop);
      const seam = rectPart(scene, 0, 3, 1, h - 8, P.woodDark, P.woodDark, 0, 0.6);
      return [base, top, seam];
    }
    case "stove": {
      const body = rectPart(scene, 0, 0, w, h, P.appliance);
      const top = rectPart(scene, 0, -h / 2 + 5, w, 8, P.appliancePanel);
      const b1 = scene.add.circle(-w / 4, 3, 5, P.appliancePanel).setStrokeStyle(1, P.metal);
      const b2 = scene.add.circle(w / 4, 3, 5, P.appliancePanel).setStrokeStyle(1, P.metal);
      return [body, top, b1, b2];
    }
    case "fridge": {
      const body = rectPart(scene, 0, 0, w, h, P.appliance);
      const divide = rectPart(scene, 0, -2, w, 1, P.appliancePanel, P.appliancePanel, 0);
      const handle = rectPart(scene, w / 2 - 5, -h / 4, 2, h / 3, P.metal);
      return [body, divide, handle];
    }
    case "bed": {
      const frame = rectPart(scene, 0, 0, w, h, P.woodDark);
      const mattress = rectPart(scene, 0, 6, w - 8, h - 12, P.bedSheet, P.woodDark, 1);
      const blanket = rectPart(scene, 0, h / 4, w - 8, h / 2 - 6, P.fabricDark, P.woodDark, 1);
      const pillow = rectPart(scene, 0, -h / 2 + 16, w - 22, 20, P.bedPillow, P.woodDark, 1);
      return [frame, mattress, blanket, pillow];
    }
    case "dresser": {
      const body = rectPart(scene, 0, 0, w, h, P.wood);
      const d1 = rectPart(scene, 0, -h / 4, w - 6, h / 3 - 3, P.woodDark, P.woodLight, 1);
      const d2 = rectPart(scene, 0, h / 6, w - 6, h / 3 - 3, P.woodDark, P.woodLight, 1);
      return [body, d1, d2];
    }
    case "nightstand": {
      const body = rectPart(scene, 0, 0, 22, 22, P.wood);
      const drawer = rectPart(scene, 0, -3, 16, 8, P.woodDark, P.woodLight, 1);
      const knob = scene.add.circle(0, 5, 1.6, P.woodLight);
      return [body, drawer, knob];
    }
    case "bathtub": {
      const outer = rectPart(scene, 0, 0, w, h, P.porcelain, P.porcelainDark, 2);
      const basin = rectPart(scene, 0, 4, w - 12, h - 20, P.porcelainDark, P.porcelain, 1, 0.7);
      const tap = scene.add.circle(0, -h / 2 + 8, 2.4, P.metal);
      return [outer, basin, tap];
    }
    case "toilet": {
      const tank = rectPart(scene, 0, -h / 2 + 6, w, 10, P.porcelain, P.porcelainDark, 1);
      const bowl = scene.add
        .ellipse(0, 4, w - 6, h - 12, P.porcelain)
        .setStrokeStyle(2, P.porcelainDark);
      const seat = scene.add.ellipse(0, 4, w - 14, h - 20, P.porcelainDark, 0.7);
      return [tank, bowl, seat];
    }
    case "sink": {
      const body = rectPart(scene, 0, 0, 30, 20, P.porcelain, P.porcelainDark, 2);
      const basin = scene.add.ellipse(0, 1, 20, 12, P.porcelainDark, 0.7);
      const tap = scene.add.circle(0, -7, 2, P.metal);
      return [body, basin, tap];
    }
    case "shelving": {
      const body = rectPart(scene, 0, 0, w, h, P.wood);
      const shelves: GO[] = [];
      for (let i = -1; i <= 1; i++) {
        shelves.push(rectPart(scene, 0, (i * h) / 4, w - 4, 3, P.woodDark, P.woodDark, 0));
      }
      return [body, ...shelves];
    }
    case "sideTable": {
      const top = scene.add.circle(0, 0, 12, P.wood).setStrokeStyle(2, P.woodDark);
      const inlay = scene.add.circle(0, 0, 7, P.woodLight, 0.7);
      return [top, inlay];
    }
    case "wallArt": {
      const frame = rectPart(scene, 0, 0, w, h, P.artFrame);
      const art = rectPart(scene, 0, 0, w - 6, h - 5, P.art, P.artFrame, 1);
      return [frame, art];
    }
    case "framedPictures": {
      const parts: GO[] = [];
      for (let i = -1; i <= 1; i++) {
        parts.push(rectPart(scene, i * 18, 0, 14, 11, P.artFrame));
        parts.push(rectPart(scene, i * 18, 0, 10, 7, P.art, P.artFrame, 1));
      }
      return parts;
    }
    case "lamp": {
      const glow = scene.add.circle(0, -2, 12, P.lampShade, 0.18);
      const shade = scene.add.triangle(0, -6, 0, 0, 14, 10, -14, 10, P.lampShade).setStrokeStyle(1, P.outline);
      const stand = rectPart(scene, 0, 6, 2, 12, P.metal, P.outline, 0);
      const base = rectPart(scene, 0, 12, 12, 3, P.woodDark);
      return [glow, base, stand, shade];
    }
    case "plant": {
      const pot = scene.add.triangle(0, 8, -8, 8, 8, 8, 6, -6, P.plantPot).setStrokeStyle(1, P.outline);
      const l1 = scene.add.circle(-4, -4, 7, P.plantLeaf, 0.95);
      const l2 = scene.add.circle(5, -6, 6, P.plantLeaf, 0.95);
      const l3 = scene.add.circle(0, -11, 6, P.plantLeaf, 0.95);
      return [pot, l1, l2, l3];
    }
    case "mirror": {
      const frame = scene.add.ellipse(0, 0, 22, 30, P.woodLight).setStrokeStyle(2, P.woodDark);
      const glass = scene.add.ellipse(0, 0, 15, 23, P.screenGlow, 0.55);
      return [frame, glass];
    }
    case "coatRack": {
      const pole = rectPart(scene, 0, 0, 3, 34, P.woodDark);
      const base = scene.add.circle(0, 16, 6, P.woodDark);
      const hookL = rectPart(scene, -6, -14, 6, 2, P.metal, P.outline, 0);
      const hookR = rectPart(scene, 6, -14, 6, 2, P.metal, P.outline, 0);
      const coat = rectPart(scene, 6, -4, 12, 18, P.fabric, P.fabricDark, 1);
      return [pole, base, hookL, hookR, coat];
    }
    case "clutter": {
      const b1 = rectPart(scene, -6, 2, 14, 10, P.box, P.outline, 1);
      const bootL = rectPart(scene, 6, 4, 6, 10, P.woodDark, P.outline, 1);
      const bootR = rectPart(scene, 13, 4, 6, 10, P.woodDark, P.outline, 1);
      return [b1, bootL, bootR];
    }
    default:
      return [rectPart(scene, 0, 0, w, h, PALETTE.wood)];
  }
}

/** Draw the whole furniture/decoration layer for a floor (visual only). */
export function spawnFurniture(scene: Phaser.Scene, layout: FloorLayout): void {
  for (const def of layout.furniture ?? []) {
    const parts = buildFurniturePiece(scene, def);
    const depth = def.kind === "rug" ? DEPTH_RUG : DEPTH_FURNITURE;
    scene.add.container(def.x, def.y, parts).setDepth(depth);
  }
}
