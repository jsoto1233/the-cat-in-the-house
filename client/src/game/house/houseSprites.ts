import Phaser from "phaser";
import {
  PALETTE,
  WORLD,
  type InteractableDef,
  type Rect
} from "./houseLayout";
import { type FloorExit, type FloorLayout } from "./floors";

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
    scene.add
      .text(room.x + 10, room.y + 8, room.name, {
        fontFamily: "Inter, sans-serif",
        fontSize: "12px",
        color: PALETTE.label
      })
      .setDepth(2);
  });

  // Doorway gaps in the hallway walls, derived from each room's connector.
  layout.connectors.forEach((c) => {
    const gapX = c.x + c.w / 2;
    const wallY = c.y < 270 ? 270 : 330; // top rooms join the hallway's top wall
    drawDoor(scene, gapX, wallY, 46, 14);
  });

  // Exit caption inside the exit room.
  const exitRoom = layout.rooms.find((r) => r.key === layout.exit.roomKey);
  if (exitRoom) {
    scene.add
      .text(exitRoom.x + exitRoom.w / 2, exitRoom.y + 22, exitCaption(layout.exit.type), {
        fontFamily: "Inter, sans-serif",
        fontSize: "12px",
        color: layout.exit.type === "window" ? "#7fc0ff" : "#8a8690",
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
  const whiteRing = scene.add.circle(0, 0, 18, 0xffffff, 0.35);
  const halo = scene.add.circle(0, 0, 16, PALETTE.moneyGlow, 0.28);
  const borderRing = scene.add.circle(0, 0, 14, PALETTE.outline);
  const coin = scene.add
    .circle(0, 0, 12, PALETTE.moneyGold, 1)
    .setStrokeStyle(3, PALETTE.outline, 1);
  const shine = scene.add.circle(-3, -3, 5, PALETTE.moneyHighlight, 0.55);
  const sign = scene.add
    .text(0, 1, "$", {
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: "20px",
      color: "#0a0a0f",
      fontStyle: "bold"
    })
    .setOrigin(0.5);
  const container = scene.add
    .container(x, y, [whiteRing, halo, borderRing, coin, shine, sign])
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
