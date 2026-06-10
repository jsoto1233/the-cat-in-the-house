import Phaser from "phaser";
import { CollisionMap } from "../CollisionMap";
import { CatAI } from "../CatAI";

// Playable house scene (scene key "HousePreview" — kept identical so Jose's
// GameView pause/resume + preview:update contract is unchanged). Drives real
// movement, loot pickups, cat AI, lives and escape on the canonical
// HousePreviewScene layout. Emits:
//   - "preview:update" (PreviewState) on loot/lives/mood/attic changes
//   - "match:over" ({ outcome }) when the player escapes or is caught

export type PreviewMood = "calm" | "warning" | "aggressive";
export type PreviewDifficulty = "normal" | "ludicrous";

export interface PreviewState {
  cashFound: number;
  cashTotal: number;
  mood: PreviewMood;
  atticUnlocked: boolean;
  lives: number;
  livesTotal: number;
  difficulty: PreviewDifficulty;
}

export type MatchOutcome = "escaped" | "caught";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Room extends Rect {
  key: string;
  name: string;
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
  outline: 0x000000,
  moneyGlow: 0xffe23a,
  moneyGold: 0xffd633,
  moneyHighlight: 0xfff4a8,
  attic: 0xc41e3a,
  doorWood: 0x3a2b22,
  doorWoodDark: 0x241a14,
  doorHandle: 0x141010
};

const WORLD = { x: 30, y: 30, w: 740, h: 540 };
const CASH_TOTAL = 4;
const LIVES_TOTAL = 3;

const PLAYER_SPAWN = { x: 400, y: 300 };
const PLAYER_SPAWNS = [
  { x: 380, y: 300 },
  { x: 420, y: 300 },
  { x: 380, y: 320 },
  { x: 420, y: 320 }
];
const PLAYER_COLORS = [0x4aa3df, 0x4adf7a, 0xdf4a9f, 0xdfae4a];
const CAT_SPAWN = { x: 440, y: 150 };

const PLAYER_SPEED = 165; // px/s
const PICKUP_RADIUS = 26;
const CATCH_RADIUS = 24;
const INVULN_SECONDS = 1.6;
const ESCAPE_RADIUS = 34;

const ROOMS: Room[] = [
  { key: "living", name: "Living Room", x: 30, y: 30, w: 330, h: 230 },
  { key: "kitchen", name: "Kitchen", x: 380, y: 30, w: 390, h: 230 },
  { key: "hallway", name: "Hallway", x: 30, y: 270, w: 740, h: 60 },
  { key: "bedroom", name: "Bedroom", x: 30, y: 340, w: 290, h: 230 },
  { key: "bathroom", name: "Bathroom", x: 340, y: 340, w: 200, h: 230 },
  { key: "attic", name: "Back door", x: 560, y: 340, w: 210, h: 230, isAttic: true }
];

const MONEY_SPOTS = [
  { x: 195, y: 159 }, // living
  { x: 575, y: 159 }, // kitchen
  { x: 175, y: 469 }, // bedroom
  { x: 440, y: 469 } // bathroom
];

// Walkable rectangles: room interiors (slightly inset off the wall stroke) plus
// generous door "bridge" rects that overlap the hallway so rooms connect.
const ROOM_INSET = 4;
const WALKABLE_RECTS: Rect[] = [
  ...ROOMS.map((r) => ({
    x: r.x + ROOM_INSET,
    y: r.y + ROOM_INSET,
    w: r.w - ROOM_INSET * 2,
    h: r.h - ROOM_INSET * 2
  })),
  // Top rooms <-> hallway (around the upper doorway gaps)
  { x: 168, y: 248, w: 44, h: 42 },
  { x: 518, y: 248, w: 44, h: 42 },
  // Bottom rooms <-> hallway (around the lower doorway gaps)
  { x: 148, y: 308, w: 44, h: 42 },
  { x: 408, y: 308, w: 44, h: 42 },
  { x: 628, y: 308, w: 44, h: 42 }
];

const TILE = 20;

interface MoneyMarker {
  x: number;
  y: number;
  container: Phaser.GameObjects.Container;
  collected: boolean;
}

export class PlayableHouseScene extends Phaser.Scene {
  private difficulty: PreviewDifficulty = "normal";
  private multiplayer = false;
  private isHost = true;
  private localId = "p1";
  private playerIds: string[] = ["p1"];
  private remotePlayers = new Map<string, Phaser.GameObjects.Container>();
  private remotePositions = new Map<string, { x: number; y: number; alive: boolean }>();
  private syncTimer = 0;
  private onMove?: (x: number, y: number) => void;
  private onHostSync?: (state: Record<string, unknown>) => void;
  private getTimeLeftMs?: () => number;

  private collisionMap!: CollisionMap;
  private cat!: CatAI;

  private playerContainer!: Phaser.GameObjects.Container;
  private catContainer!: Phaser.GameObjects.Container;

  private playerX = PLAYER_SPAWN.x;
  private playerY = PLAYER_SPAWN.y;

  private money: MoneyMarker[] = [];
  private backDoor = { x: 0, y: 0 };
  private escapeMarker!: Phaser.GameObjects.Rectangle;

  private cashFound = 0;
  private lives = LIVES_TOTAL;
  private invulnRemaining = 0;
  private matchEnded = false;
  private lastMood: PreviewMood = "calm";
  private lastAtticUnlocked = false;

  private keys!: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    w: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    s: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
  };

  constructor() {
    super("HousePreview");
  }

  create() {
    const mode = this.registry.get("difficulty");
    this.difficulty = mode === "ludicrous" ? "ludicrous" : "normal";
    this.multiplayer = !!this.registry.get("multiplayer");
    this.localId = this.registry.get("localId") ?? "p1";
    this.isHost = this.registry.get("isHost") ?? true;
    this.playerIds = this.registry.get("playerIds") ?? [this.localId];
    this.onMove = this.registry.get("onMove");
    this.onHostSync = this.registry.get("onHostSync");
    this.getTimeLeftMs = this.registry.get("getTimeLeftMs");

    const spawnIdx = Math.max(0, this.playerIds.indexOf(this.localId));
    const spawn = this.multiplayer ? PLAYER_SPAWNS[spawnIdx] ?? PLAYER_SPAWN : PLAYER_SPAWN;
    this.playerX = spawn.x;
    this.playerY = spawn.y;

    this.cameras.main.setBackgroundColor("#08080c");

    this.drawWorld();
    this.buildCollisionMap();
    this.spawnMoney();
    this.buildEntities();
    if (this.multiplayer) this.spawnRemotePlayers();
    this.setupInput();
    this.setupCat();

    this.playerContainer.setPosition(this.playerX, this.playerY);
    this.onMove?.(this.playerX, this.playerY);

    const attachNetwork = this.registry.get("attachNetwork") as
      | ((scene: PlayableHouseScene) => void)
      | undefined;
    attachNetwork?.(this);

    this.emitPreview(true);
  }

  shutdown() {
    const detachNetwork = this.registry.get("detachNetwork") as (() => void) | undefined;
    detachNetwork?.();
  }

  update(_time: number, delta: number) {
    if (this.matchEnded) return;

    const dt = Math.min(delta, 50) / 1000;

    if (this.multiplayer && !this.isHost) {
      this.invulnRemaining = Math.max(0, this.invulnRemaining - dt);
      this.movePlayer(dt);
      this.syncRemoteSprites();
      this.updateInvulnVisual();
      return;
    }

    this.invulnRemaining = Math.max(0, this.invulnRemaining - dt);
    this.movePlayer(dt);

    const uncollectedLoot = this.money
      .filter((m) => !m.collected)
      .map((m) => ({ x: m.x, y: m.y }));
    this.cat.setHuntContext(this.cashFound, uncollectedLoot);

    this.cat.update(delta, this.getAllPlayerStates());
    this.catContainer.setPosition(this.cat.x, this.cat.y);

    this.checkPickups();
    this.checkCatch();
    this.checkEscape();

    this.syncMoodAndAttic();
    this.updateInvulnVisual();
    this.syncRemoteSprites();

    if (this.multiplayer && this.isHost) {
      this.syncTimer += delta;
      if (this.syncTimer >= 50) {
        this.syncTimer = 0;
        this.onHostSync?.(this.buildSyncState());
      }
    }
  }

  // ---------- world / layout ----------

  private drawWorld() {
    this.drawRect(WORLD.x, WORLD.y, WORLD.w, WORLD.h, PALETTE.floor, PALETTE.wallLine, 2);

    ROOMS.forEach((room, i) => {
      const floor =
        room.key === "hallway" ? PALETTE.hallway : i % 2 ? PALETTE.floorAlt : PALETTE.floor;
      this.drawRect(room.x, room.y, room.w, room.h, floor, PALETTE.wallLine, 2);
      this.add
        .text(room.x + 10, room.y + 8, room.name, {
          fontFamily: "Inter, sans-serif",
          fontSize: "12px",
          color: PALETTE.label
        })
        .setDepth(2);
    });

    this.drawDoor(190, 260, 46, 14);
    this.drawDoor(540, 260, 46, 14);
    this.drawDoor(170, 330, 46, 14);
    this.drawDoor(430, 330, 46, 14);
    this.drawDoor(650, 330, 46, 14);

    const attic = ROOMS.find((r) => r.isAttic)!;
    this.add
      .text(attic.x + attic.w / 2, attic.y + attic.h / 2, "Back door", {
        fontFamily: "Inter, sans-serif",
        fontSize: "13px",
        color: "#8a8690",
        align: "center"
      })
      .setOrigin(0.5)
      .setDepth(2);
    this.drawBackDoor(attic);
  }

  private buildCollisionMap() {
    const cols = Math.ceil(800 / TILE);
    const rows = Math.ceil(600 / TILE);
    const grid: boolean[][] = [];
    for (let row = 0; row < rows; row++) {
      grid[row] = [];
      for (let col = 0; col < cols; col++) {
        const cx = col * TILE + TILE / 2;
        const cy = row * TILE + TILE / 2;
        grid[row][col] = this.isWalkablePoint(cx, cy);
      }
    }
    this.collisionMap = new CollisionMap(TILE, TILE, grid);
  }

  private isWalkablePoint(x: number, y: number): boolean {
    for (const r of WALKABLE_RECTS) {
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true;
    }
    return false;
  }

  // ---------- entities ----------

  private buildEntities() {
    this.playerContainer = this.buildPlayer(PLAYER_SPAWN.x, PLAYER_SPAWN.y);
    this.catContainer = this.buildCat(CAT_SPAWN.x, CAT_SPAWN.y);
  }

  private setupInput() {
    const kb = this.input.keyboard!;
    this.keys = {
      up: kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
      down: kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
      left: kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      w: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      a: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      s: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      d: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D)
    };
    // Don't swallow arrow keys to the page; leave Escape to React (pause).
    kb.addCapture([
      Phaser.Input.Keyboard.KeyCodes.UP,
      Phaser.Input.Keyboard.KeyCodes.DOWN,
      Phaser.Input.Keyboard.KeyCodes.LEFT,
      Phaser.Input.Keyboard.KeyCodes.RIGHT
    ]);
  }

  private setupCat() {
    this.cat = new CatAI(CAT_SPAWN, 800, 600, this.collisionMap);
    this.cat.reset();
    // Difficulty drives hunt cadence (both modes hunt immediately; ludicrous re-plans faster) and the
    // behavior re-evaluation cadence inside CatAI.
    this.cat.setDifficulty(this.difficulty);
  }

  // ---------- per-frame systems ----------

  private movePlayer(dt: number) {
    let dx = 0;
    let dy = 0;
    if (this.keys.left.isDown || this.keys.a.isDown) dx -= 1;
    if (this.keys.right.isDown || this.keys.d.isDown) dx += 1;
    if (this.keys.up.isDown || this.keys.w.isDown) dy -= 1;
    if (this.keys.down.isDown || this.keys.s.isDown) dy += 1;
    if (dx === 0 && dy === 0) return;

    const len = Math.sqrt(dx * dx + dy * dy);
    const step = PLAYER_SPEED * dt;
    const toX = this.playerX + (dx / len) * step;
    const toY = this.playerY + (dy / len) * step;

    const resolved = this.collisionMap.resolveMove(this.playerX, this.playerY, toX, toY);
    this.playerX = resolved.x;
    this.playerY = resolved.y;
    this.playerContainer.setPosition(this.playerX, this.playerY);
    this.onMove?.(this.playerX, this.playerY);
  }

  private getAllPlayerStates() {
    const states = [{ id: this.localId, x: this.playerX, y: this.playerY, alive: true }];
    for (const [id, pos] of this.remotePositions) {
      if (id === this.localId) continue;
      states.push({ id, x: pos.x, y: pos.y, alive: pos.alive });
    }
    return states;
  }

  setRemotePosition(id: string, x: number, y: number) {
    if (id === this.localId) return;
    this.remotePositions.set(id, { x, y, alive: true });
    this.ensureRemotePlayer(id).setPosition(x, y);
  }

  private syncRemoteSprites() {
    for (const [id, container] of this.remotePlayers) {
      const pos = this.remotePositions.get(id);
      if (pos) container.setPosition(pos.x, pos.y);
    }
  }

  applyGameState(state: {
    players: Record<string, { x: number; y: number; alive: boolean }>;
    cashFound: number;
    collectedLoot: number[];
    cat: { x: number; y: number; mood: string };
    lives: number;
    timeLeftMs: number;
    matchEnded?: boolean;
    outcome?: MatchOutcome;
  }) {
    this.cashFound = state.cashFound;
    this.lives = state.lives;
    state.collectedLoot.forEach((idx) => {
      const m = this.money[idx];
      if (m && !m.collected) {
        m.collected = true;
        m.container.destroy();
      }
    });
    this.cat.x = state.cat.x;
    this.cat.y = state.cat.y;
    this.catContainer.setPosition(state.cat.x, state.cat.y);
    this.lastMood = state.cat.mood as PreviewMood;
    for (const [id, p] of Object.entries(state.players)) {
      if (id === this.localId) continue;
      this.remotePositions.set(id, { x: p.x, y: p.y, alive: p.alive });
      this.ensureRemotePlayer(id)?.setPosition(p.x, p.y);
    }
    this.emitPreview();
    if (state.matchEnded && state.outcome) this.endMatch(state.outcome);
  }

  private buildSyncState() {
    const players: Record<string, { x: number; y: number; alive: boolean }> = {};
    players[this.localId] = { x: this.playerX, y: this.playerY, alive: true };
    for (const [id, pos] of this.remotePositions) {
      players[id] = { x: pos.x, y: pos.y, alive: pos.alive };
    }
    return {
      players,
      cashFound: this.cashFound,
      collectedLoot: this.money.map((m, i) => (m.collected ? i : -1)).filter((i) => i >= 0),
      cat: { x: this.cat.x, y: this.cat.y, mood: this.cat.mood },
      lives: this.lives,
      timeLeftMs: this.getTimeLeftMs?.() ?? 60000,
      matchEnded: this.matchEnded
    };
  }

  private spawnRemotePlayers() {
    this.playerIds.forEach((id, i) => {
      if (id === this.localId) return;
      const spawn = PLAYER_SPAWNS[i] ?? PLAYER_SPAWN;
      this.remotePlayers.set(id, this.buildPlayer(spawn.x, spawn.y, PLAYER_COLORS[i] ?? PALETTE.player));
      this.remotePositions.set(id, { x: spawn.x, y: spawn.y, alive: true });
    });
  }

  private ensureRemotePlayer(id: string) {
    if (this.remotePlayers.has(id)) return this.remotePlayers.get(id)!;
    const idx = this.playerIds.indexOf(id);
    const container = this.buildPlayer(PLAYER_SPAWN.x, PLAYER_SPAWN.y, PLAYER_COLORS[idx] ?? PALETTE.player);
    this.remotePlayers.set(id, container);
    return container;
  }

  private checkPickups() {
    for (const m of this.money) {
      if (m.collected) continue;
      for (const p of this.getAllPlayerStates()) {
        if (!p.alive) continue;
        const dx = p.x - m.x;
        const dy = p.y - m.y;
        if (Math.sqrt(dx * dx + dy * dy) > PICKUP_RADIUS) continue;
        m.collected = true;
        m.container.destroy();
        this.cashFound = Math.min(CASH_TOTAL, this.cashFound + 1);
        this.cat.onClueCollected(p.id, `cash_${this.cashFound}`);
        this.emitPreview();
        break;
      }
    }
  }

  private checkCatch() {
    if (this.invulnRemaining > 0) return;
    for (const p of this.getAllPlayerStates()) {
      if (!p.alive) continue;
      const dx = this.cat.x - p.x;
      const dy = this.cat.y - p.y;
      if (Math.sqrt(dx * dx + dy * dy) > CATCH_RADIUS) continue;

      this.lives = Math.max(0, this.lives - 1);
      this.emitPreview();

      if (this.lives <= 0) {
        this.endMatch("caught");
        return;
      }

      this.invulnRemaining = INVULN_SECONDS;
      if (p.id === this.localId) {
        this.playerX = PLAYER_SPAWN.x;
        this.playerY = PLAYER_SPAWN.y;
        this.playerContainer.setPosition(this.playerX, this.playerY);
      } else {
        const idx = this.playerIds.indexOf(p.id);
        const spawn = PLAYER_SPAWNS[idx] ?? PLAYER_SPAWN;
        this.remotePositions.set(p.id, { x: spawn.x, y: spawn.y, alive: true });
        this.remotePlayers.get(p.id)?.setPosition(spawn.x, spawn.y);
      }
      this.cat.x = CAT_SPAWN.x;
      this.cat.y = CAT_SPAWN.y;
      this.catContainer.setPosition(this.cat.x, this.cat.y);
      this.cat.calm(25);
      return;
    }
  }

  private checkEscape() {
    if (this.cashFound < CASH_TOTAL) return;
    for (const p of this.getAllPlayerStates()) {
      if (!p.alive) continue;
      const dx = p.x - this.backDoor.x;
      const dy = p.y - this.backDoor.y;
      if (Math.sqrt(dx * dx + dy * dy) <= ESCAPE_RADIUS) {
        this.endMatch("escaped");
        return;
      }
    }
  }

  private syncMoodAndAttic() {
    const mood = this.cat.mood;
    const atticUnlocked = this.cashFound >= CASH_TOTAL;
    if (mood !== this.lastMood || atticUnlocked !== this.lastAtticUnlocked) {
      this.emitPreview();
    }
  }

  private updateInvulnVisual() {
    const blinking = this.invulnRemaining > 0;
    this.playerContainer.setAlpha(blinking ? 0.45 + 0.35 * Math.sin(this.time.now / 60) : 1);
  }

  private endMatch(outcome: MatchOutcome) {
    if (this.matchEnded) return;
    this.matchEnded = true;
    this.emitPreview();
    if (this.multiplayer && this.isHost) {
      this.onHostSync?.({ ...this.buildSyncState(), matchEnded: true, outcome });
      this.registry.get("onMatchOver")?.(outcome);
    }
    this.game.events.emit("match:over", { outcome });
  }

  // ---------- preview emit ----------

  private emitPreview(_initial = false) {
    if (!this.multiplayer || this.isHost) {
      this.lastMood = this.cat ? this.cat.mood : "calm";
    }
    this.lastAtticUnlocked = this.cashFound >= CASH_TOTAL;
    const state: PreviewState = {
      cashFound: this.cashFound,
      cashTotal: CASH_TOTAL,
      mood: this.lastMood,
      atticUnlocked: this.lastAtticUnlocked,
      lives: this.lives,
      livesTotal: LIVES_TOTAL,
      difficulty: this.difficulty
    };
    this.game.events.emit("preview:update", state);
  }

  private distTo(x: number, y: number): number {
    const dx = x - this.playerX;
    const dy = y - this.playerY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // ---------- drawing helpers (ported from HousePreviewScene) ----------

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

  private drawBackDoor(room: Rect) {
    const doorW = 20;
    const doorH = 72;
    const wallInset = 5;
    const cx = room.x + room.w - wallInset - doorW / 2;
    const cy = room.y + room.h / 2 + 28;
    this.backDoor = { x: cx, y: cy };

    const escapePad = 3;
    const escapeW = doorW + 6 + escapePad * 2;
    const escapeH = doorH + 6 + escapePad * 2;
    this.escapeMarker = this.add
      .rectangle(0, 0, escapeW, escapeH)
      .setStrokeStyle(2, PALETTE.attic, 0.9)
      .setFillStyle(PALETTE.attic, 0.04);

    const frame = this.add
      .rectangle(0, 0, doorW + 6, doorH + 6, PALETTE.doorWoodDark)
      .setStrokeStyle(2, PALETTE.outline);
    const panel = this.add
      .rectangle(0, 0, doorW, doorH, PALETTE.doorWood)
      .setStrokeStyle(2, PALETTE.outline);
    const inset = this.add.rectangle(0, 0, doorW - 6, doorH - 10, PALETTE.doorWoodDark, 0.55);
    const handle = this.add
      .rectangle(-doorW / 2 + 5, 2, 2, 10, PALETTE.doorHandle)
      .setStrokeStyle(1, PALETTE.outline);

    this.add.container(cx, cy, [this.escapeMarker, frame, panel, inset, handle]).setDepth(1);
  }

  private spawnMoney() {
    MONEY_SPOTS.forEach((spot) => {
      const container = this.spawnMoneyMarker(spot.x, spot.y);
      this.money.push({ x: spot.x, y: spot.y, container, collected: false });
    });
  }

  private spawnMoneyMarker(x: number, y: number): Phaser.GameObjects.Container {
    const whiteRing = this.add.circle(0, 0, 18, 0xffffff, 0.35);
    const halo = this.add.circle(0, 0, 16, PALETTE.moneyGlow, 0.28);
    const borderRing = this.add.circle(0, 0, 14, PALETTE.outline);
    const coin = this.add
      .circle(0, 0, 12, PALETTE.moneyGold, 1)
      .setStrokeStyle(3, PALETTE.outline, 1);
    const shine = this.add.circle(-3, -3, 5, PALETTE.moneyHighlight, 0.55);
    const sign = this.add
      .text(0, 1, "$", {
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: "20px",
        color: "#0a0a0f",
        fontStyle: "bold"
      })
      .setOrigin(0.5);
    const container = this.add
      .container(x, y, [whiteRing, halo, borderRing, coin, shine, sign])
      .setDepth(6);
    this.tweens.add({
      targets: halo,
      scale: { from: 0.85, to: 1.45 },
      alpha: { from: 0.4, to: 0.08 },
      duration: 1200,
      yoyo: true,
      repeat: -1
    });
    this.tweens.add({
      targets: whiteRing,
      scale: { from: 0.9, to: 1.2 },
      alpha: { from: 0.45, to: 0.12 },
      duration: 1400,
      yoyo: true,
      repeat: -1
    });
    return container;
  }

  private buildPlayer(x: number, y: number, color = PALETTE.player): Phaser.GameObjects.Container {
    const shadow = this.add.ellipse(0, 12, 26, 10, 0x000000, 0.4);
    const body = this.add.circle(0, 0, 12, color);
    const ring = this.add.circle(0, 0, 12).setStrokeStyle(2, PALETTE.playerDark);
    const eyeL = this.add.circle(-4, -3, 1.8, 0x0a0a0f);
    const eyeR = this.add.circle(4, -3, 1.8, 0x0a0a0f);
    const dir = this.add.triangle(0, 14, 0, 0, 5, 8, -5, 8, color);
    dir.setRotation(-Math.PI / 2);
    return this.add.container(x, y, [shadow, dir, body, ring, eyeL, eyeR]).setDepth(5);
  }

  private buildCat(x: number, y: number): Phaser.GameObjects.Container {
    const shadow = this.add.ellipse(0, 14, 34, 12, 0x000000, 0.45);
    const earL = this.add.triangle(-9, -12, 0, 0, 10, 0, 5, -12, PALETTE.catEar);
    const earR = this.add.triangle(9, -12, 0, 0, 10, 0, 5, -12, PALETTE.catEar);
    const body = this.add.ellipse(0, 0, 34, 28, PALETTE.cat);
    const eyeL = this.add.circle(-6, -2, 2.4, 0xffe23a);
    const eyeR = this.add.circle(6, -2, 2.4, 0xffe23a);
    const tail = this.add.ellipse(20, 6, 18, 6, PALETTE.cat);
    return this.add.container(x, y, [shadow, tail, earL, earR, body, eyeL, eyeR]).setDepth(4);
  }
}
