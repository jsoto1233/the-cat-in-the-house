import Phaser from "phaser";
import { CatAI } from "../CatAI";
import {
  CASH_TOTAL,
  CAT_SPAWN,
  CATCH_RADIUS,
  createHouseCollisionMap,
  ESCAPE_RADIUS,
  INTERACT_RADIUS,
  INVULN_SECONDS,
  LIVES_TOTAL,
  PALETTE,
  PICKUP_RADIUS,
  PLAYER_COLORS,
  PLAYER_SPAWN,
  PLAYER_SPAWNS,
  PLAYER_SPEED,
  type MatchOutcome,
  type PreviewDifficulty,
  type PreviewMood,
  type PreviewState
} from "../house/houseLayout";
import {
  applyOpenedVisual,
  buildCat,
  buildInteractUi,
  buildPlayer,
  drawHouseWorld,
  showInteractFeedback,
  spawnInteractables,
  spawnMoney,
  type InteractableMarker,
  type MoneyMarker
} from "../house/houseSprites";

export type { MatchOutcome, PreviewDifficulty, PreviewMood, PreviewState } from "../house/houseLayout";

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
  private onInteract?: () => void;
  private onHostSync?: (state: Record<string, unknown>) => void;
  private getTimeLeftMs?: () => number;

  private collisionMap = createHouseCollisionMap();
  private cat!: CatAI;

  private playerContainer!: Phaser.GameObjects.Container;
  private catContainer!: Phaser.GameObjects.Container;

  private playerX = PLAYER_SPAWN.x;
  private playerY = PLAYER_SPAWN.y;

  private money: MoneyMarker[] = [];
  private interactables: InteractableMarker[] = [];
  private interactPrompt!: Phaser.GameObjects.Text;
  private feedbackText!: Phaser.GameObjects.Text;
  private backDoor = { x: 0, y: 0 };

  private cashFound = 0;
  private hasKey = false;
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
    e: Phaser.Input.Keyboard.Key;
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
    this.onInteract = this.registry.get("onInteract");
    this.onHostSync = this.registry.get("onHostSync");
    this.getTimeLeftMs = this.registry.get("getTimeLeftMs");

    const spawnIdx = Math.max(0, this.playerIds.indexOf(this.localId));
    const spawn = this.multiplayer ? PLAYER_SPAWNS[spawnIdx] ?? PLAYER_SPAWN : PLAYER_SPAWN;
    this.playerX = spawn.x;
    this.playerY = spawn.y;

    this.cameras.main.setBackgroundColor("#08080c");

    const world = drawHouseWorld(this);
    this.backDoor = world.backDoor;
    this.collisionMap = createHouseCollisionMap();
    this.money = spawnMoney(this);
    this.interactables = spawnInteractables(this);
    this.playerContainer = buildPlayer(this, PLAYER_SPAWN.x, PLAYER_SPAWN.y);
    this.catContainer = buildCat(this, CAT_SPAWN.x, CAT_SPAWN.y);
    ({ interactPrompt: this.interactPrompt, feedbackText: this.feedbackText } = buildInteractUi(this));

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
      this.checkInteractInputRemote();
      this.updateInteractPrompt();
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
    this.checkInteractInput();
    this.updateInteractPrompt();
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

  setRemotePosition(id: string, x: number, y: number) {
    if (id === this.localId) return;
    this.remotePositions.set(id, { x, y, alive: true });
    this.ensureRemotePlayer(id).setPosition(x, y);
  }

  getPlayerPosition(id: string): { x: number; y: number } | null {
    if (id === this.localId) return { x: this.playerX, y: this.playerY };
    const pos = this.remotePositions.get(id);
    return pos ? { x: pos.x, y: pos.y } : null;
  }

  applyGameState(state: {
    players: Record<string, { x: number; y: number; alive: boolean }>;
    cashFound: number;
    collectedLoot: number[];
    hasKey?: boolean;
    openedInteractables?: string[];
    cat: { x: number; y: number; mood: string };
    lives: number;
    timeLeftMs: number;
    matchEnded?: boolean;
    outcome?: MatchOutcome;
  }) {
    this.cashFound = state.cashFound;
    this.hasKey = !!state.hasKey;
    this.lives = state.lives;
    state.collectedLoot.forEach((idx) => {
      const m = this.money[idx];
      if (m && !m.collected) {
        m.collected = true;
        m.container.destroy();
      }
    });
    (state.openedInteractables ?? []).forEach((id) => {
      const item = this.interactables.find((i) => i.def.id === id);
      if (item && !item.opened) applyOpenedVisual(item);
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

  tryInteractAt(playerId: string, x: number, y: number) {
    const target = this.getNearestInteractable(x, y);
    if (!target) return;
    this.openInteractable(target, playerId);
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
      d: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      e: kb.addKey(Phaser.Input.Keyboard.KeyCodes.E)
    };
    kb.addCapture([
      Phaser.Input.Keyboard.KeyCodes.UP,
      Phaser.Input.Keyboard.KeyCodes.DOWN,
      Phaser.Input.Keyboard.KeyCodes.LEFT,
      Phaser.Input.Keyboard.KeyCodes.RIGHT,
      Phaser.Input.Keyboard.KeyCodes.E
    ]);
  }

  private setupCat() {
    this.cat = new CatAI(CAT_SPAWN, 800, 600, this.collisionMap);
    this.cat.reset();
    this.cat.setDifficulty(this.difficulty);
  }

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

  private syncRemoteSprites() {
    for (const [id, container] of this.remotePlayers) {
      const pos = this.remotePositions.get(id);
      if (pos) container.setPosition(pos.x, pos.y);
    }
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
      hasKey: this.hasKey,
      openedInteractables: this.interactables.filter((i) => i.opened).map((i) => i.def.id),
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
      this.remotePlayers.set(id, buildPlayer(this, spawn.x, spawn.y, PLAYER_COLORS[i] ?? PALETTE.player));
      this.remotePositions.set(id, { x: spawn.x, y: spawn.y, alive: true });
    });
  }

  private ensureRemotePlayer(id: string) {
    if (this.remotePlayers.has(id)) return this.remotePlayers.get(id)!;
    const idx = this.playerIds.indexOf(id);
    const container = buildPlayer(this, PLAYER_SPAWN.x, PLAYER_SPAWN.y, PLAYER_COLORS[idx] ?? PALETTE.player);
    this.remotePlayers.set(id, container);
    return container;
  }

  private checkInteractInput() {
    if (!Phaser.Input.Keyboard.JustDown(this.keys.e)) return;
    this.tryInteractAt(this.localId, this.playerX, this.playerY);
  }

  private checkInteractInputRemote() {
    if (!Phaser.Input.Keyboard.JustDown(this.keys.e)) return;
    this.onInteract?.();
  }

  private getNearestInteractable(x: number, y: number): InteractableMarker | null {
    let best: InteractableMarker | null = null;
    let bestDist = INTERACT_RADIUS;
    for (const item of this.interactables) {
      const dx = x - item.def.x;
      const dy = y - item.def.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= bestDist) {
        bestDist = dist;
        best = item;
      }
    }
    return best;
  }

  private openInteractable(item: InteractableMarker, playerId: string) {
    const { def } = item;
    if (item.opened) {
      showInteractFeedback(this, this.feedbackText, "Already searched");
      return;
    }
    if (def.locked && def.keyId && !this.hasKey) {
      showInteractFeedback(this, this.feedbackText, "Locked — find the key first");
      return;
    }

    applyOpenedVisual(item);

    if (def.contains === "key") {
      this.hasKey = true;
      showInteractFeedback(this, this.feedbackText, "Found a key!");
      this.cat.onClueCollected(playerId, `key_${def.id}`);
    } else if (def.contains === "cash") {
      this.grantCash(1, playerId, def.id);
      showInteractFeedback(this, this.feedbackText, "Found $1!");
    } else if (def.contains === "cash_x2") {
      this.grantCash(2, playerId, def.id);
      showInteractFeedback(this, this.feedbackText, "Chest opened — $2!");
    } else {
      showInteractFeedback(this, this.feedbackText, "Nothing inside");
    }

    this.emitPreview();
  }

  private grantCash(amount: number, playerId: string, sourceId: string) {
    const added = Math.min(amount, CASH_TOTAL - this.cashFound);
    if (added <= 0) return;
    this.cashFound += added;
    this.cat.onClueCollected(playerId, `loot_${sourceId}`);
  }

  private updateInteractPrompt() {
    const target = this.getNearestInteractable(this.playerX, this.playerY);
    if (!target || target.opened) {
      this.interactPrompt.setVisible(false);
      return;
    }
    const label =
      target.def.locked && !this.hasKey
        ? `Press E — ${target.def.label} (locked)`
        : `Press E — Search ${target.def.label.toLowerCase()}`;
    this.interactPrompt.setText(label);
    this.interactPrompt.setVisible(true);
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
      hasKey: this.hasKey,
      lives: this.lives,
      livesTotal: LIVES_TOTAL,
      difficulty: this.difficulty
    };
    this.game.events.emit("preview:update", state);
  }
}
