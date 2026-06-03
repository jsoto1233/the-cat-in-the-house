import Phaser from "phaser";

// A fully self-contained visual preview of the house. It does NOT depend on the
// team's HouseScene, entities, systems, or networking — everything here is drawn
// programmatically with Phaser shapes for the Week-2+ UI demo.

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
  wall: 0x1b1b27,
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

const ROOMS: Room[] = [
  { key: "living", name: "Living Room", x: 30, y: 30, w: 330, h: 230, hasClue: true },
  { key: "kitchen", name: "Kitchen", x: 380, y: 30, w: 390, h: 230, hasClue: true },
  { key: "hallway", name: "Hallway", x: 30, y: 270, w: 740, h: 60 },
  { key: "bedroom", name: "Bedroom", x: 30, y: 340, w: 290, h: 230, hasClue: true },
  { key: "bathroom", name: "Bathroom", x: 340, y: 340, w: 200, h: 230, hasClue: true },
  { key: "attic", name: "Attic", x: 560, y: 340, w: 210, h: 230, isAttic: true }
];

// Walkable interiors (rooms inset off the wall lines) + doorway passages that
// bridge each room to the central hallway. The player's centre must stay inside
// the union of these rects, so walls block movement and doorways let you pass.
const WALKABLE: Rect[] = [
  { x: 36, y: 36, w: 318, h: 218 }, // living
  { x: 386, y: 36, w: 378, h: 218 }, // kitchen
  { x: 36, y: 276, w: 728, h: 48 }, // hallway
  { x: 36, y: 346, w: 278, h: 218 }, // bedroom
  { x: 346, y: 346, w: 188, h: 218 }, // bathroom
  { x: 566, y: 346, w: 198, h: 218 }, // attic
  { x: 167, y: 250, w: 46, h: 80 }, // living <-> hallway door
  { x: 517, y: 250, w: 46, h: 80 }, // kitchen <-> hallway door
  { x: 147, y: 320, w: 46, h: 34 }, // hallway <-> bedroom door
  { x: 407, y: 320, w: 46, h: 34 }, // hallway <-> bathroom door
  { x: 627, y: 320, w: 46, h: 34 } // hallway <-> attic door
];

// Hallway-side waypoint for each room's doorway, used for cat navigation.
const DOOR_WP: Record<string, { x: number; y: number }> = {
  living: { x: 190, y: 300 },
  kitchen: { x: 540, y: 300 },
  bedroom: { x: 170, y: 300 },
  bathroom: { x: 430, y: 300 },
  attic: { x: 650, y: 300 }
};

const CLUE_SPOTS = [
  { x: 195, y: 159 }, // living
  { x: 575, y: 159 }, // kitchen
  { x: 175, y: 469 }, // bedroom
  { x: 440, y: 469 } // bathroom
];

export class HousePreviewScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Container;
  private playerDir!: Phaser.GameObjects.Triangle;
  private cat!: Phaser.GameObjects.Container;
  private catEyes: Phaser.GameObjects.Arc[] = [];
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;

  private clues: { marker: Phaser.GameObjects.Container; x: number; y: number; collected: boolean }[] =
    [];
  private atticZone = { x: 0, y: 0, w: 0, h: 0 };
  private atticGlow!: Phaser.GameObjects.Rectangle;
  private atticLabel!: Phaser.GameObjects.Text;

  private cluesTotal = 0;
  private cluesFound = 0;
  private facing = { x: 0, y: 1 };

  private catTarget = { x: 400, y: 300 };
  private catRepick = 0;
  private escaped = false;

  private readonly spawn = { x: 400, y: 300 };
  private readonly livesTotal = 3;
  private lives = 3;
  private invulnerableUntil = 0;
  private caught = false;
  private readonly hitRadius = 22;

  // Difficulty + grace.
  private difficulty: PreviewDifficulty = "normal";
  private graceMs = GRACE_MS;
  private lastGraceSec = -1;

  // Ludicrous-only state.
  private nextTeleport = 0;
  private nextShuffle = 0;
  private darkOverlay?: Phaser.GameObjects.Rectangle;
  private flashlight?: Phaser.GameObjects.Image;

  constructor() {
    super("HousePreview");
  }

  create() {
    const mode = this.registry.get("difficulty");
    this.difficulty = mode === "ludicrous" ? "ludicrous" : "normal";
    this.graceMs = this.difficulty === "ludicrous" ? 0 : GRACE_MS;

    this.cameras.main.setBackgroundColor("#08080c");

    // Outer house shell.
    this.drawRect(WORLD.x, WORLD.y, WORLD.w, WORLD.h, PALETTE.floor, PALETTE.wallLine, 2);

    // Rooms.
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

    // Attic exit marker.
    const attic = ROOMS.find((r) => r.isAttic)!;
    this.atticZone = { x: attic.x, y: attic.y, w: attic.w, h: attic.h };
    this.atticGlow = this.add
      .rectangle(attic.x + attic.w / 2, attic.y + attic.h / 2, attic.w - 16, attic.h - 16)
      .setStrokeStyle(2, PALETTE.attic, 0.35)
      .setFillStyle(PALETTE.attic, 0.04)
      .setDepth(1);
    this.atticLabel = this.add
      .text(attic.x + attic.w / 2, attic.y + attic.h / 2, "ATTIC\nLOCKED", {
        fontFamily: "Inter, sans-serif",
        fontSize: "13px",
        color: "#8a8690",
        align: "center"
      })
      .setOrigin(0.5)
      .setDepth(2);

    // Clue markers.
    CLUE_SPOTS.forEach((spot) => this.spawnClue(spot.x, spot.y));
    this.cluesTotal = this.clues.length;

    // Cat + player.
    this.cat = this.buildCat(440, 150);
    this.player = this.buildPlayer(this.spawn.x, this.spawn.y);

    if (this.difficulty === "ludicrous") this.setupLudicrousFog();

    // Input.
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys("W,A,S,D") as Record<
      string,
      Phaser.Input.Keyboard.Key
    >;

    this.emitState();
  }

  update(time: number, delta: number) {
    this.updateGrace(delta);
    this.movePlayer(delta);
    this.moveCat(time, delta);
    if (this.difficulty === "ludicrous") this.updateLudicrous(time);
    this.checkClues();
    this.checkEscape();
    this.checkCatHit(time);
    this.updateInvulnerability(time);
    this.animateCatEyes(time);
  }

  // ---------- collision helpers ----------

  private pointWalkable(x: number, y: number) {
    for (const r of WALKABLE) {
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true;
    }
    return false;
  }

  private regionOf(x: number, y: number): string | null {
    for (const r of ROOMS) {
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r.key;
    }
    return null;
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
    const marker = this.add.container(x, y, [halo, dot]).setDepth(3);
    this.tweens.add({
      targets: halo,
      scale: { from: 0.8, to: 1.6 },
      alpha: { from: 0.35, to: 0.05 },
      duration: 1100,
      yoyo: true,
      repeat: -1
    });
    this.clues.push({ marker, x, y, collected: false });
  }

  private buildPlayer(x: number, y: number) {
    const shadow = this.add.ellipse(0, 12, 26, 10, 0x000000, 0.4);
    const body = this.add.circle(0, 0, 12, PALETTE.player);
    const ring = this.add.circle(0, 0, 12).setStrokeStyle(2, PALETTE.playerDark);
    const eyeL = this.add.circle(-4, -3, 1.8, 0x0a0a0f);
    const eyeR = this.add.circle(4, -3, 1.8, 0x0a0a0f);
    this.playerDir = this.add.triangle(0, 14, 0, 0, 5, 8, -5, 8, PALETTE.player);
    return this.add
      .container(x, y, [shadow, this.playerDir, body, ring, eyeL, eyeR])
      .setDepth(5);
  }

  private buildCat(x: number, y: number) {
    const shadow = this.add.ellipse(0, 14, 34, 12, 0x000000, 0.45);
    const earL = this.add.triangle(-9, -12, 0, 0, 10, 0, 5, -12, PALETTE.catEar);
    const earR = this.add.triangle(9, -12, 0, 0, 10, 0, 5, -12, PALETTE.catEar);
    const body = this.add.ellipse(0, 0, 34, 28, PALETTE.cat);
    const eyeL = this.add.circle(-6, -2, 2.4, 0xffe23a);
    const eyeR = this.add.circle(6, -2, 2.4, 0xffe23a);
    this.catEyes = [eyeL, eyeR];
    const tail = this.add.ellipse(20, 6, 18, 6, PALETTE.cat);
    return this.add
      .container(x, y, [shadow, tail, earL, earR, body, eyeL, eyeR])
      .setDepth(4);
  }

  // ---------- ludicrous flashlight ----------

  private setupLudicrousFog() {
    this.darkOverlay = this.add
      .rectangle(WORLD.x + WORLD.w / 2, WORLD.y + WORLD.h / 2, WORLD.w, WORLD.h, 0x04040a, 0.82)
      .setDepth(18);

    const size = 360;
    const key = "flashlight-cone";
    if (!this.textures.exists(key)) {
      const canvasTex = this.textures.createCanvas(key, size, size);
      const ctx = canvasTex?.getContext();
      if (canvasTex && ctx) {
        const grad = ctx.createRadialGradient(size / 2, size / 2, 8, size / 2, size / 2, size / 2);
        grad.addColorStop(0, "rgba(255,244,214,0.55)");
        grad.addColorStop(0.5, "rgba(255,232,180,0.16)");
        grad.addColorStop(1, "rgba(255,232,180,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
        canvasTex.refresh();
      }
    }
    this.flashlight = this.add
      .image(this.spawn.x, this.spawn.y, key)
      .setDepth(19)
      .setBlendMode(Phaser.BlendModes.ADD);
  }

  private updateLudicrous(time: number) {
    this.flashlight?.setPosition(this.player.x, this.player.y);

    // Blink-teleport the cat near the player periodically.
    if (!this.caught && time > this.nextTeleport) {
      this.nextTeleport = time + Phaser.Math.Between(2800, 4200);
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const radius = Phaser.Math.Between(120, 210);
      const tx = Phaser.Math.Clamp(
        this.player.x + Math.cos(angle) * radius,
        WORLD.x + 30,
        WORLD.x + WORLD.w - 30
      );
      const ty = Phaser.Math.Clamp(
        this.player.y + Math.sin(angle) * radius,
        WORLD.y + 30,
        WORLD.y + WORLD.h - 30
      );
      this.cat.setAlpha(0.15);
      this.cat.setPosition(tx, ty);
      this.tweens.add({ targets: this.cat, alpha: 1, duration: 220 });
      this.cameras.main.flash(120, 60, 0, 10);
    }

    // Reshuffle uncollected clues periodically.
    if (time > this.nextShuffle) {
      this.nextShuffle = time + Phaser.Math.Between(7000, 9000);
      this.reshuffleClues();
    }
  }

  private reshuffleClues() {
    const spots = Phaser.Utils.Array.Shuffle([...CLUE_SPOTS]);
    let i = 0;
    this.clues.forEach((clue) => {
      if (clue.collected) return;
      const spot = spots[i % spots.length];
      i += 1;
      clue.x = spot.x;
      clue.y = spot.y;
      this.tweens.add({
        targets: clue.marker,
        x: spot.x,
        y: spot.y,
        duration: 320,
        ease: "Sine.InOut"
      });
    });
  }

  // ---------- movement ----------

  private movePlayer(delta: number) {
    const speed = 0.18 * delta;
    let dx = 0;
    let dy = 0;
    if (this.cursors.left.isDown || this.wasd.A.isDown) dx -= 1;
    if (this.cursors.right.isDown || this.wasd.D.isDown) dx += 1;
    if (this.cursors.up.isDown || this.wasd.W.isDown) dy -= 1;
    if (this.cursors.down.isDown || this.wasd.S.isDown) dy += 1;

    if (dx === 0 && dy === 0) return;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    this.facing = { x: dx, y: dy };
    this.playerDir.setRotation(Math.atan2(dy, dx) - Math.PI / 2);

    // Per-axis AABB collision so the player slides along walls and only passes
    // through doorways.
    const nx = this.player.x + dx * speed;
    if (this.pointWalkable(nx, this.player.y)) this.player.x = nx;
    const ny = this.player.y + dy * speed;
    if (this.pointWalkable(this.player.x, ny)) this.player.y = ny;
  }

  private moveCat(time: number, delta: number) {
    const distToPlayer = Math.hypot(this.player.x - this.cat.x, this.player.y - this.cat.y);

    const aggression = this.cluesTotal ? Math.min(1, this.cluesFound / this.cluesTotal) : 0;
    const chaseRange = 170 + aggression * 260;
    const chasing = distToPlayer < chaseRange || this.cluesFound >= this.cluesTotal;

    const ludicrous = this.difficulty === "ludicrous";

    // Pick a target. Ludicrous cats phase straight at the player; Normal cats
    // route through doorways via the hallway.
    if (chasing) {
      this.catTarget = ludicrous ? { x: this.player.x, y: this.player.y } : this.catNavTarget();
    } else if (time > this.catRepick) {
      this.catRepick = time + Phaser.Math.Between(1400, 2800);
      const spot = Phaser.Utils.Array.GetRandom(WALKABLE);
      this.catTarget = { x: spot.x + spot.w / 2, y: spot.y + spot.h / 2 };
    }

    const baseSpeed = ludicrous ? 0.075 + aggression * 0.075 : 0.05 + aggression * 0.06;
    const speed = (chasing ? baseSpeed * 1.4 : baseSpeed) * delta;

    const dx = this.catTarget.x - this.cat.x;
    const dy = this.catTarget.y - this.cat.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= 1.5) return;
    const vx = (dx / dist) * speed;
    const vy = (dy / dist) * speed;

    if (ludicrous) {
      // No walls — phase freely.
      this.cat.x = Phaser.Math.Clamp(this.cat.x + vx, WORLD.x + 16, WORLD.x + WORLD.w - 16);
      this.cat.y = Phaser.Math.Clamp(this.cat.y + vy, WORLD.y + 16, WORLD.y + WORLD.h - 16);
      return;
    }

    let moved = false;
    if (this.pointWalkable(this.cat.x + vx, this.cat.y)) {
      this.cat.x += vx;
      moved = true;
    }
    if (this.pointWalkable(this.cat.x, this.cat.y + vy)) {
      this.cat.y += vy;
      moved = true;
    }
    // If wedged against a wall, briefly re-route to a random walkable cell.
    if (!moved && time > this.catRepick) {
      this.catRepick = time + 600;
      const spot = Phaser.Utils.Array.GetRandom(WALKABLE);
      this.catTarget = { x: spot.x + spot.w / 2, y: spot.y + spot.h / 2 };
    }
  }

  // Route the cat room -> hallway -> room through doorways (star topology).
  private catNavTarget(): { x: number; y: number } {
    const px = this.player.x;
    const py = this.player.y;
    const cr = this.regionOf(this.cat.x, this.cat.y);
    const pr = this.regionOf(px, py);

    if (cr !== null && cr === pr) return { x: px, y: py };

    // Cat is inside a room (not the hallway): head out through its own door.
    if (cr && cr !== "hallway" && DOOR_WP[cr]) return DOOR_WP[cr];

    // Cat is in the hallway (or transitioning): aim for the player's room door,
    // then dive in once aligned with the opening.
    if (pr && pr !== "hallway" && DOOR_WP[pr]) {
      const door = DOOR_WP[pr];
      if (Math.abs(this.cat.x - door.x) < 20) return { x: px, y: py };
      return door;
    }

    return { x: px, y: py };
  }

  private updateGrace(delta: number) {
    if (this.caught || this.graceMs <= 0) return;
    this.graceMs = Math.max(0, this.graceMs - delta);
    const sec = Math.ceil(this.graceMs / 1000);
    if (sec !== this.lastGraceSec) {
      this.lastGraceSec = sec;
      this.emitState();
      if (this.graceMs <= 0) this.onCatAwake();
    }
  }

  private onCatAwake() {
    this.cameras.main.flash(260, 90, 0, 14);
    this.game.events.emit("preview:awake");
  }

  private checkCatHit(time: number) {
    if (this.caught || this.graceMs > 0 || time < this.invulnerableUntil) return;
    const dist = Math.hypot(this.player.x - this.cat.x, this.player.y - this.cat.y);
    if (dist < this.hitRadius) this.registerHit(time);
  }

  private registerHit(time: number) {
    this.lives = Math.max(0, this.lives - 1);
    this.cameras.main.shake(220, 0.013);
    this.game.events.emit("preview:hit", { lives: this.lives });

    if (this.lives <= 0) {
      this.caught = true;
      this.player.setAlpha(0.25);
      this.game.events.emit("preview:caught");
      this.emitState();
      return;
    }

    // Brief invulnerability + reset player to spawn and knock the cat back.
    this.invulnerableUntil = time + 1500;
    this.player.setPosition(this.spawn.x, this.spawn.y);
    const len = Math.hypot(this.cat.x - this.spawn.x, this.cat.y - this.spawn.y) || 1;
    const knockX = this.spawn.x + ((this.cat.x - this.spawn.x) / len) * 170;
    const knockY = this.spawn.y + ((this.cat.y - this.spawn.y) / len) * 170;
    this.cat.setPosition(
      Phaser.Math.Clamp(knockX, WORLD.x + 30, WORLD.x + WORLD.w - 30),
      Phaser.Math.Clamp(knockY, WORLD.y + 30, WORLD.y + WORLD.h - 30)
    );
    this.catRepick = time + 1200;
    if (this.difficulty === "ludicrous") this.nextTeleport = time + 1600;
    this.emitState();
  }

  private updateInvulnerability(time: number) {
    if (this.caught) return;
    if (time < this.invulnerableUntil) {
      // Blink the player so a hit is readable and not instantly repeated.
      this.player.setAlpha(Math.sin(time / 70) > 0 ? 1 : 0.3);
    } else {
      this.player.setAlpha(1);
    }
  }

  private animateCatEyes(time: number) {
    const mood = this.currentMood();
    const color = mood === "aggressive" ? 0xff3a3a : mood === "warning" ? 0xffa53a : 0xffe23a;
    const flicker = 0.7 + Math.sin(time / 180) * 0.3;
    this.catEyes.forEach((eye) => {
      eye.setFillStyle(color, mood === "calm" ? 1 : flicker);
    });
  }

  // ---------- mechanics ----------

  private checkClues() {
    this.clues.forEach((clue) => {
      if (clue.collected) return;
      const d = Math.hypot(this.player.x - clue.x, this.player.y - clue.y);
      if (d < 20) {
        clue.collected = true;
        this.cluesFound += 1;
        this.tweens.add({
          targets: clue.marker,
          scale: 0,
          alpha: 0,
          duration: 250,
          onComplete: () => clue.marker.destroy()
        });
        this.onCluesChanged();
      }
    });
  }

  private onCluesChanged() {
    const unlocked = this.cluesFound >= this.cluesTotal;
    if (unlocked) {
      this.atticGlow.setStrokeStyle(3, PALETTE.attic, 0.9).setFillStyle(PALETTE.attic, 0.12);
      this.atticLabel.setText("ATTIC\nESCAPE").setColor("#ffb3c0");
      this.tweens.add({
        targets: this.atticGlow,
        alpha: { from: 0.6, to: 1 },
        duration: 700,
        yoyo: true,
        repeat: -1
      });
    }
    this.emitState();
  }

  private checkEscape() {
    if (this.escaped || this.cluesFound < this.cluesTotal) return;
    const inAttic =
      this.player.x > this.atticZone.x &&
      this.player.x < this.atticZone.x + this.atticZone.w &&
      this.player.y > this.atticZone.y &&
      this.player.y < this.atticZone.y + this.atticZone.h;
    if (inAttic) {
      this.escaped = true;
      this.game.events.emit("preview:escaped");
    }
  }

  private currentMood(): PreviewMood {
    if (this.cluesFound >= this.cluesTotal) return "aggressive";
    if (this.cluesFound >= Math.ceil(this.cluesTotal / 2)) return "warning";
    return "calm";
  }

  private emitState() {
    const state: PreviewState = {
      cluesFound: this.cluesFound,
      cluesTotal: this.cluesTotal,
      mood: this.currentMood(),
      atticUnlocked: this.cluesFound >= this.cluesTotal,
      lives: this.lives,
      livesTotal: this.livesTotal,
      graceMs: this.graceMs,
      lethal: this.graceMs <= 0,
      difficulty: this.difficulty
    };
    this.game.events.emit("preview:update", state);
  }
}
