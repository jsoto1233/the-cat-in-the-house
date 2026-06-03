import Phaser from "phaser";

// Wall collision, player movement, and cat behavior are deferred to Ayman's
// game logic modules (CollisionMap.js, CatAI.js, Gamelogic.js). This file is
// visual layout + HUD shell only until integration.

export type PreviewMood = "calm" | "warning" | "aggressive";
export type PreviewDifficulty = "normal" | "ludicrous";

export interface PreviewState {
  cluesFound: number;
  cluesTotal: number;
  mood: PreviewMood;
  atticUnlocked: boolean;
  lives: number;
  livesTotal: number;
  graceMs: number;
  lethal: boolean;
  difficulty: PreviewDifficulty;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Room extends Rect {
  key: string;
  name: string;
  hasClue?: boolean;
  isAttic?: boolean;
}

const PALETTE = {
  wallLine: 0x32324a,
  floor: 0x121219,
  floorAlt: 0x16161f,
  hallway: 0x191922,
  label: "#6c6776",
  player: 0x4aa3df,
  playerDark: 0x2c6f9e,
  cat: 0x17171d,
  catEar: 0x101015,
  clue: 0xc9a227,
  attic: 0xc41e3a
};

const WORLD = { x: 30, y: 30, w: 740, h: 540 };
const GRACE_MS = 15000;
const CLUES_TOTAL = 4;
const LIVES_TOTAL = 3;

const PLAYER_SPAWN = { x: 400, y: 300 };
const CAT_SPAWN = { x: 440, y: 150 };

const ROOMS: Room[] = [
  { key: "living", name: "Living Room", x: 30, y: 30, w: 330, h: 230, hasClue: true },
  { key: "kitchen", name: "Kitchen", x: 380, y: 30, w: 390, h: 230, hasClue: true },
  { key: "hallway", name: "Hallway", x: 30, y: 270, w: 740, h: 60 },
  { key: "bedroom", name: "Bedroom", x: 30, y: 340, w: 290, h: 230, hasClue: true },
  { key: "bathroom", name: "Bathroom", x: 340, y: 340, w: 200, h: 230, hasClue: true },
  { key: "attic", name: "Attic", x: 560, y: 340, w: 210, h: 230, isAttic: true }
];

const CLUE_SPOTS = [
  { x: 195, y: 159 }, // living
  { x: 575, y: 159 }, // kitchen
  { x: 175, y: 469 }, // bedroom
  { x: 440, y: 469 } // bathroom
];

export class HousePreviewScene extends Phaser.Scene {
  private difficulty: PreviewDifficulty = "normal";

  constructor() {
    super("HousePreview");
  }

  create() {
    const mode = this.registry.get("difficulty");
    this.difficulty = mode === "ludicrous" ? "ludicrous" : "normal";

    this.cameras.main.setBackgroundColor("#08080c");

    // Outer house shell.
    this.drawRect(WORLD.x, WORLD.y, WORLD.w, WORLD.h, PALETTE.floor, PALETTE.wallLine, 2);

    // Rooms (walls drawn as stroked rectangles — visual only, not collision).
    ROOMS.forEach((room, i) => {
      const floor = room.key === "hallway" ? PALETTE.hallway : i % 2 ? PALETTE.floorAlt : PALETTE.floor;
      this.drawRect(room.x, room.y, room.w, room.h, floor, PALETTE.wallLine, 2);
      this.add
        .text(room.x + 10, room.y + 8, room.name, {
          fontFamily: "Inter, sans-serif",
          fontSize: "12px",
          color: PALETTE.label
        })
        .setDepth(2);
    });

    // Doorway openings (floor-colored gaps bridging the hallway).
    this.drawDoor(190, 260, 46, 14);
    this.drawDoor(540, 260, 46, 14);
    this.drawDoor(170, 330, 46, 14);
    this.drawDoor(430, 330, 46, 14);
    this.drawDoor(650, 330, 46, 14);

    // Attic exit marker (static locked state).
    const attic = ROOMS.find((r) => r.isAttic)!;
    this.add
      .rectangle(attic.x + attic.w / 2, attic.y + attic.h / 2, attic.w - 16, attic.h - 16)
      .setStrokeStyle(2, PALETTE.attic, 0.35)
      .setFillStyle(PALETTE.attic, 0.04)
      .setDepth(1);
    this.add
      .text(attic.x + attic.w / 2, attic.y + attic.h / 2, "ATTIC\nLOCKED", {
        fontFamily: "Inter, sans-serif",
        fontSize: "13px",
        color: "#8a8690",
        align: "center"
      })
      .setOrigin(0.5)
      .setDepth(2);

    // Clue markers (static yellow dots).
    CLUE_SPOTS.forEach((spot) => this.spawnClue(spot.x, spot.y));

    // Static player + cat visuals (not driven by preview game logic).
    this.buildPlayer(PLAYER_SPAWN.x, PLAYER_SPAWN.y);
    this.buildCat(CAT_SPAWN.x, CAT_SPAWN.y);

    // Honest integration notice.
    this.add
      .text(WORLD.x + WORLD.w / 2, WORLD.y + WORLD.h + 8, "Game logic: Ayman's CatAI + CollisionMap (integration pending)", {
        fontFamily: "Inter, sans-serif",
        fontSize: "11px",
        color: "#5a5664",
        align: "center"
      })
      .setOrigin(0.5, 0)
      .setDepth(10);

    this.emitPlaceholderState();
  }

  // ---------- drawing helpers ----------

  private drawRect(
    x: number,
    y: number,
    w: number,
    h: number,
    fill: number,
    line: number,
    lineWidth: number
  ) {
    this.add
      .rectangle(x + w / 2, y + h / 2, w, h, fill)
      .setStrokeStyle(lineWidth, line)
      .setDepth(0);
  }

  private drawDoor(x: number, y: number, w: number, h: number) {
    this.add.rectangle(x, y, w, h, PALETTE.hallway).setDepth(1);
  }

  private spawnClue(x: number, y: number) {
    const halo = this.add.circle(0, 0, 11, PALETTE.clue, 0.18);
    const dot = this.add.circle(0, 0, 5, PALETTE.clue, 1);
    this.add.container(x, y, [halo, dot]).setDepth(3);
    this.tweens.add({
      targets: halo,
      scale: { from: 0.8, to: 1.6 },
      alpha: { from: 0.35, to: 0.05 },
      duration: 1100,
      yoyo: true,
      repeat: -1
    });
  }

  private buildPlayer(x: number, y: number) {
    const shadow = this.add.ellipse(0, 12, 26, 10, 0x000000, 0.4);
    const body = this.add.circle(0, 0, 12, PALETTE.player);
    const ring = this.add.circle(0, 0, 12).setStrokeStyle(2, PALETTE.playerDark);
    const eyeL = this.add.circle(-4, -3, 1.8, 0x0a0a0f);
    const eyeR = this.add.circle(4, -3, 1.8, 0x0a0a0f);
    const dir = this.add.triangle(0, 14, 0, 0, 5, 8, -5, 8, PALETTE.player);
    dir.setRotation(-Math.PI / 2);
    this.add.container(x, y, [shadow, dir, body, ring, eyeL, eyeR]).setDepth(5);
  }

  private buildCat(x: number, y: number) {
    const shadow = this.add.ellipse(0, 14, 34, 12, 0x000000, 0.45);
    const earL = this.add.triangle(-9, -12, 0, 0, 10, 0, 5, -12, PALETTE.catEar);
    const earR = this.add.triangle(9, -12, 0, 0, 10, 0, 5, -12, PALETTE.catEar);
    const body = this.add.ellipse(0, 0, 34, 28, PALETTE.cat);
    const eyeL = this.add.circle(-6, -2, 2.4, 0xffe23a);
    const eyeR = this.add.circle(6, -2, 2.4, 0xffe23a);
    const tail = this.add.ellipse(20, 6, 18, 6, PALETTE.cat);
    this.add.container(x, y, [shadow, tail, earL, earR, body, eyeL, eyeR]).setDepth(4);
  }

  /** Static HUD placeholder values until Ayman's game logic is wired in. */
  private emitPlaceholderState() {
    const graceMs = this.difficulty === "ludicrous" ? 0 : GRACE_MS;
    const state: PreviewState = {
      cluesFound: 0,
      cluesTotal: CLUES_TOTAL,
      mood: "calm",
      atticUnlocked: false,
      lives: LIVES_TOTAL,
      livesTotal: LIVES_TOTAL,
      graceMs,
      lethal: graceMs <= 0,
      difficulty: this.difficulty
    };
    this.game.events.emit("preview:update", state);
  }
}
