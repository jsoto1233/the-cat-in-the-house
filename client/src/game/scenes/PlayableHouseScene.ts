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
  PLAYER_BODY_RADIUS,
  COIN_PICKUP_RADIUS,
  REMOTE_PICKUP_BUFFER,
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
  createFloorCollisionMap,
  getFloorLayout,
  type FloorLayout
} from "../house/floors";
import { playCatchSound } from "../sfx";
import {
  applyOpenedVisual,
  buildCat,
  buildInteractUi,
  buildPlayer,
  drawHouseWorld,
  showInteractFeedback,
  spawnFurniture,
  spawnInteractables,
  spawnMoney,
  type InteractableMarker,
  type MoneyMarker
} from "../house/houseSprites";

export type { MatchOutcome, PreviewDifficulty, PreviewMood, PreviewState } from "../house/houseLayout";

type RemotePos = {
  x: number;
  y: number;
  tx: number;
  ty: number;
  alive: boolean;
};

const HOST_SYNC_MS = 33;
const CAT_RECONCILE_SNAP_PX = 120;

export class PlayableHouseScene extends Phaser.Scene {
  private difficulty: PreviewDifficulty = "normal";
  private multiplayer = false;
  private isHost = true;
  private localId = "p1";
  private playerIds: string[] = ["p1"];
  private remotePlayers = new Map<string, Phaser.GameObjects.Container>();
  private remotePositions = new Map<string, RemotePos>();
  private pendingCoinPickups = new Set<number>();
  private syncTimer = 0;
  private onMove?: (x: number, y: number) => void;
  private onInteract?: () => void;
  private onCoinPickup?: (coinIndex: number) => void;
  private onHostSync?: (state: Record<string, unknown>) => void;
  private getTimeLeftMs?: () => number;
  private catHostX = 0;
  private catHostY = 0;
  private catHostSynced = false;

  private collisionMap = createHouseCollisionMap();
  private layout: FloorLayout = getFloorLayout(1);
  private currentFloor = 1;
  private floorTotal = 4;
  private catSpawnPos = CAT_SPAWN;
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
  private playerLives = new Map<string, number>();
  private playerInvuln = new Map<string, number>();
  private escapedPlayers = new Set<string>();
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
    this.onCoinPickup = this.registry.get("onCoinPickup");
    this.onHostSync = this.registry.get("onHostSync");
    this.getTimeLeftMs = this.registry.get("getTimeLeftMs");

    const savedLives = (this.registry.get("playerLives") as Record<string, number> | undefined) ?? {};
    this.playerLives = new Map();
    for (const id of this.playerIds) {
      this.playerLives.set(id, savedLives[id] ?? LIVES_TOTAL);
    }
    if (!this.playerLives.has(this.localId)) {
      this.playerLives.set(this.localId, savedLives[this.localId] ?? LIVES_TOTAL);
    }

    // Which floor (level) to build. GameView puts this in the registry and
    // remounts the whole game for each floor, so reading it here is enough.
    this.currentFloor = Number(this.registry.get("floor")) || 1;
    this.floorTotal = Number(this.registry.get("floorTotal")) || 4;
    this.layout = getFloorLayout(this.currentFloor);
    this.catSpawnPos = this.layout.catSpawn;

    const spawnIdx = Math.max(0, this.playerIds.indexOf(this.localId));
    const spawn = this.multiplayer ? PLAYER_SPAWNS[spawnIdx] ?? PLAYER_SPAWN : PLAYER_SPAWN;
    const playerColor = PLAYER_COLORS[spawnIdx] ?? PALETTE.player;
    this.playerX = spawn.x;
    this.playerY = spawn.y;

    this.cameras.main.setBackgroundColor("#08080c");

    const world = drawHouseWorld(this, this.layout);
    spawnFurniture(this, this.layout); // decoration layer (solid pieces bake into collision below)
    this.backDoor = world.backDoor;
    this.collisionMap = createFloorCollisionMap(this.layout);
    this.money = spawnMoney(this, this.layout);
    this.interactables = spawnInteractables(this, this.layout);
    this.playerContainer = buildPlayer(this, spawn.x, spawn.y, playerColor);
    this.catContainer = buildCat(this, this.catSpawnPos.x, this.catSpawnPos.y);
    ({ interactPrompt: this.interactPrompt, feedbackText: this.feedbackText } = buildInteractUi(this));

    if (this.multiplayer) this.spawnRemotePlayers();
    this.setupInput();
    this.setupCat();
    this.catHostX = this.cat.x;
    this.catHostY = this.cat.y;

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
      this.tickInvuln(dt);
      if (this.isPlayerActive(this.localId)) {
        this.movePlayer(dt);
        this.checkLocalPickups();
        this.checkInteractInputRemote();
        this.updateInteractPrompt();
      }
      this.updateClientCat(delta);
      this.syncRemoteSprites();
      this.updateInvulnVisual();
      return;
    }

    this.tickInvuln(dt);
    if (this.isPlayerActive(this.localId)) {
      this.movePlayer(dt);
    }

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
      if (this.syncTimer >= HOST_SYNC_MS) {
        this.syncTimer = 0;
        this.pushHostSync();
      }
    }
  }

  handleRemoteCoinPickup(playerId: string, coinIndex: number) {
    if (coinIndex < 0 || coinIndex >= this.money.length) return;
    const coin = this.money[coinIndex];
    if (!coin || coin.collected) {
      this.pushHostSync();
      return;
    }
    const pos = this.getPlayerPosition(playerId);
    if (!pos || !this.isPlayerActive(playerId)) return;
    const buffer = playerId === this.localId ? 0 : REMOTE_PICKUP_BUFFER;
    if (!this.overlapsPickup(pos.x, pos.y, coin.x, coin.y, buffer)) return;
    this.collectCoin(coinIndex, playerId, true);
  }

  setRemotePosition(id: string, x: number, y: number) {
    if (id === this.localId || this.hasEscaped(id)) return;
    const alive = this.isPlayerActive(id);
    let pos = this.remotePositions.get(id);
    if (!pos) {
      pos = { x, y, tx: x, ty: y, alive };
      this.remotePositions.set(id, pos);
    } else {
      pos.tx = x;
      pos.ty = y;
      pos.alive = alive;
      const jump = Phaser.Math.Distance.Between(pos.x, pos.y, x, y);
      if (jump > 120) {
        pos.x = x;
        pos.y = y;
      }
    }
    this.ensureRemotePlayer(id).setPosition(pos.x, pos.y);
  }

  getPlayerPosition(id: string): { x: number; y: number } | null {
    if (id === this.localId) return { x: this.playerX, y: this.playerY };
    const pos = this.remotePositions.get(id);
    return pos ? { x: pos.x, y: pos.y } : null;
  }

  applyGameState(state: {
    floor?: number;
    players: Record<string, { x: number; y: number; alive: boolean }>;
    cashFound: number;
    collectedLoot: number[];
    hasKey?: boolean;
    openedInteractables?: string[];
    escapedPlayers?: string[];
    cat: { x: number; y: number; mood: string };
    playerLives: Record<string, number>;
    timeLeftMs: number;
    matchEnded?: boolean;
    outcome?: MatchOutcome;
  }) {
    if (state.floor !== undefined && state.floor !== this.currentFloor) return;

    this.cashFound = Math.max(state.cashFound, this.cashFound);
    this.hasKey = !!state.hasKey;
    for (const [id, lives] of Object.entries(state.playerLives)) {
      this.playerLives.set(id, lives);
    }
    state.collectedLoot.forEach((idx) => {
      const m = this.money[idx];
      if (m && !m.collected) {
        m.collected = true;
        m.container.destroy();
      }
      this.pendingCoinPickups.delete(idx);
    });
    (state.openedInteractables ?? []).forEach((id) => {
      const item = this.interactables.find((i) => i.def.id === id);
      if (item && !item.opened) applyOpenedVisual(item);
    });
    this.catHostX = state.cat.x;
    this.catHostY = state.cat.y;
    this.catHostSynced = true;
    this.lastMood = state.cat.mood as PreviewMood;
    if (!this.isHost) {
      const dx = this.catHostX - this.cat.x;
      const dy = this.catHostY - this.cat.y;
      if (dx * dx + dy * dy > CAT_RECONCILE_SNAP_PX * CAT_RECONCILE_SNAP_PX) {
        this.cat.x = this.catHostX;
        this.cat.y = this.catHostY;
      }
    } else {
      this.cat.x = state.cat.x;
      this.cat.y = state.cat.y;
      this.catContainer.setPosition(state.cat.x, state.cat.y);
    }
    this.applyEscapedPlayers(state.escapedPlayers ?? []);
    for (const [id, p] of Object.entries(state.players)) {
      if (id === this.localId) continue;
      const existing = this.remotePositions.get(id);
      if (existing) {
        existing.alive = p.alive && !this.hasEscaped(id);
      } else {
        this.remotePositions.set(id, {
          x: p.x,
          y: p.y,
          tx: p.x,
          ty: p.y,
          alive: p.alive && !this.hasEscaped(id)
        });
        this.ensureRemotePlayer(id)?.setPosition(p.x, p.y);
      }
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
    this.cat = new CatAI(this.catSpawnPos, 800, 600, this.collisionMap);
    this.cat.reset();
    this.cat.setDifficulty(this.difficulty);
  }

  private movePlayer(dt: number) {
    if (!this.isPlayerActive(this.localId)) return;
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
    const states = [
      {
        id: this.localId,
        x: this.playerX,
        y: this.playerY,
        alive: this.isPlayerActive(this.localId)
      }
    ];
    for (const [id, pos] of this.remotePositions) {
      if (id === this.localId) continue;
      states.push({
        id,
        x: pos.x,
        y: pos.y,
        alive: this.isPlayerActive(id)
      });
    }
    return states;
  }

  private isPlayerAlive(id: string) {
    return (this.playerLives.get(id) ?? LIVES_TOTAL) > 0;
  }

  private hasEscaped(id: string) {
    return this.escapedPlayers.has(id);
  }

  /** Still in play on this floor (has lives and has not escaped yet). */
  private isPlayerActive(id: string) {
    return this.isPlayerAlive(id) && !this.hasEscaped(id);
  }

  private anyoneStillActive() {
    return this.playerIds.some((id) => this.isPlayerActive(id));
  }

  private applyEscapedPlayers(ids: string[]) {
    for (const id of ids) {
      if (this.escapedPlayers.has(id)) continue;
      this.markEscaped(id, true);
    }
  }

  private markEscaped(id: string, announce = true) {
    if (this.escapedPlayers.has(id) || this.matchEnded) return;
    this.escapedPlayers.add(id);

    if (id === this.localId) {
      this.playerContainer.setVisible(false);
    } else {
      const pos = this.remotePositions.get(id);
      if (pos) pos.alive = false;
      this.remotePlayers.get(id)?.setVisible(false);
    }

    if (announce) {
      this.game.events.emit("player:escaped", {
        playerId: id,
        floor: this.currentFloor
      });
    }

    // Only the host / single-player authority decides when the floor clears.
    if (!this.multiplayer || this.isHost) {
      this.pushHostSync();
      if (!this.anyoneStillActive() && this.cashFound >= CASH_TOTAL) {
        this.endMatch("escaped");
      }
    }
  }

  private tickInvuln(dt: number) {
    for (const [id, remaining] of this.playerInvuln) {
      this.playerInvuln.set(id, Math.max(0, remaining - dt));
    }
  }

  private syncPlayerLivesToContext() {
    const onUpdate = this.registry.get("onPlayerLivesUpdate") as
      | ((lives: Record<string, number>) => void)
      | undefined;
    onUpdate?.(Object.fromEntries(this.playerLives));
  }

  private syncRemoteSprites() {
    const blend = Math.min(1, (this.game.loop.delta / 100) * 2.5);
    for (const [id, container] of this.remotePlayers) {
      const pos = this.remotePositions.get(id);
      if (!pos) continue;
      pos.x = Phaser.Math.Linear(pos.x, pos.tx, blend);
      pos.y = Phaser.Math.Linear(pos.y, pos.ty, blend);
      container.setPosition(pos.x, pos.y);
      container.setVisible(this.isPlayerActive(id));
    }
  }

  private pushHostSync() {
    if (!this.multiplayer || !this.isHost) return;
    this.onHostSync?.(this.buildSyncState());
  }

  private overlapsPickup(px: number, py: number, cx: number, cy: number, extraRadius = 0) {
    const dx = px - cx;
    const dy = py - cy;
    const r = PLAYER_BODY_RADIUS + COIN_PICKUP_RADIUS + extraRadius;
    return dx * dx + dy * dy <= r * r;
  }

  private collectCoin(index: number, playerId: string, authoritative: boolean) {
    const coin = this.money[index];
    if (!coin || coin.collected) return false;
    coin.collected = true;
    coin.container.destroy();
    this.cashFound = Math.min(CASH_TOTAL, this.cashFound + 1);
    if (authoritative) {
      this.cat.onClueCollected(playerId, `cash_${this.cashFound}`);
      this.pushHostSync();
    }
    this.emitPreview();
    return true;
  }

  private checkLocalPickups() {
    for (let i = 0; i < this.money.length; i++) {
      const coin = this.money[i];
      if (coin.collected || this.pendingCoinPickups.has(i)) continue;
      if (!this.overlapsPickup(this.playerX, this.playerY, coin.x, coin.y)) continue;
      if (!this.collectCoin(i, this.localId, false)) continue;
      this.pendingCoinPickups.add(i);
      this.onCoinPickup?.(i);
      break;
    }
  }

  private updateClientCat(delta: number) {
    const uncollectedLoot = this.money
      .filter((m) => !m.collected)
      .map((m) => ({ x: m.x, y: m.y }));
    this.cat.setHuntContext(this.cashFound, uncollectedLoot);
    this.cat.update(delta, this.getAllPlayerStates());

    if (this.catHostSynced) {
      const dx = this.catHostX - this.cat.x;
      const dy = this.catHostY - this.cat.y;
      const distSq = dx * dx + dy * dy;
      if (distSq > CAT_RECONCILE_SNAP_PX * CAT_RECONCILE_SNAP_PX) {
        this.cat.x = this.catHostX;
        this.cat.y = this.catHostY;
      } else if (distSq > 16) {
        this.cat.x += dx * 0.18;
        this.cat.y += dy * 0.18;
      }
    }

    this.catContainer.setPosition(this.cat.x, this.cat.y);
  }

  private buildSyncState() {
    const players: Record<string, { x: number; y: number; alive: boolean }> = {};
    players[this.localId] = {
      x: this.playerX,
      y: this.playerY,
      alive: this.isPlayerActive(this.localId)
    };
    for (const [id, pos] of this.remotePositions) {
      players[id] = {
        x: pos.x,
        y: pos.y,
        alive: this.isPlayerActive(id)
      };
    }
    return {
      floor: this.currentFloor,
      players,
      cashFound: this.cashFound,
      collectedLoot: this.money.map((m, i) => (m.collected ? i : -1)).filter((i) => i >= 0),
      hasKey: this.hasKey,
      openedInteractables: this.interactables.filter((i) => i.opened).map((i) => i.def.id),
      escapedPlayers: [...this.escapedPlayers],
      cat: { x: this.cat.x, y: this.cat.y, mood: this.cat.mood },
      playerLives: Object.fromEntries(this.playerLives),
      timeLeftMs: this.getTimeLeftMs?.() ?? 60000,
      matchEnded: this.matchEnded
    };
  }

  private spawnRemotePlayers() {
    this.playerIds.forEach((id, i) => {
      if (id === this.localId) return;
      const spawn = PLAYER_SPAWNS[i] ?? PLAYER_SPAWN;
      this.remotePlayers.set(id, buildPlayer(this, spawn.x, spawn.y, PLAYER_COLORS[i] ?? PALETTE.player));
      this.remotePositions.set(id, {
        x: spawn.x,
        y: spawn.y,
        tx: spawn.x,
        ty: spawn.y,
        alive: this.isPlayerAlive(id)
      });
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
    if (!this.isPlayerActive(this.localId)) return;
    if (!Phaser.Input.Keyboard.JustDown(this.keys.e)) return;
    this.tryInteractAt(this.localId, this.playerX, this.playerY);
  }

  private checkInteractInputRemote() {
    if (!this.isPlayerActive(this.localId)) return;
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
      showInteractFeedback(this, this.feedbackText, "Locked. Find the key first");
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
      showInteractFeedback(this, this.feedbackText, "Chest opened! $2!");
    } else {
      showInteractFeedback(this, this.feedbackText, "Nothing inside");
    }

    this.emitPreview();
    if (this.multiplayer && this.isHost) this.pushHostSync();
  }

  private grantCash(amount: number, playerId: string, sourceId: string) {
    const added = Math.min(amount, CASH_TOTAL - this.cashFound);
    if (added <= 0) return;
    this.cashFound += added;
    this.cat.onClueCollected(playerId, `loot_${sourceId}`);
  }

  private updateInteractPrompt() {
    if (!this.isPlayerActive(this.localId)) {
      this.interactPrompt.setVisible(false);
      return;
    }
    const target = this.getNearestInteractable(this.playerX, this.playerY);
    if (!target || target.opened) {
      this.interactPrompt.setVisible(false);
      return;
    }
    const label =
      target.def.locked && !this.hasKey
        ? `Press E to open ${target.def.label} (locked)`
        : `Press E to search ${target.def.label.toLowerCase()}`;
    this.interactPrompt.setText(label);
    this.interactPrompt.setVisible(true);
  }

  private checkPickups() {
    for (let i = 0; i < this.money.length; i++) {
      const coin = this.money[i];
      if (coin.collected) continue;
      for (const p of this.getAllPlayerStates()) {
        if (!p.alive) continue;
        const buffer = p.id === this.localId ? 0 : REMOTE_PICKUP_BUFFER;
        if (!this.overlapsPickup(p.x, p.y, coin.x, coin.y, buffer)) continue;
        this.collectCoin(i, p.id, true);
        break;
      }
    }
  }

  private checkCatch() {
    for (const p of this.getAllPlayerStates()) {
      if (!p.alive) continue;
      if ((this.playerInvuln.get(p.id) ?? 0) > 0) continue;
      const dx = this.cat.x - p.x;
      const dy = this.cat.y - p.y;
      if (Math.sqrt(dx * dx + dy * dy) > CATCH_RADIUS) continue;

      playCatchSound(); // angry cat screech + victim's "oof"

      const remaining = Math.max(0, (this.playerLives.get(p.id) ?? LIVES_TOTAL) - 1);
      this.playerLives.set(p.id, remaining);
      this.syncPlayerLivesToContext();
      this.emitPreview();

      if (remaining > 0) {
        this.playerInvuln.set(p.id, INVULN_SECONDS);
        if (p.id === this.localId) {
          this.playerX = PLAYER_SPAWN.x;
          this.playerY = PLAYER_SPAWN.y;
          this.playerContainer.setPosition(this.playerX, this.playerY);
        } else {
          const idx = this.playerIds.indexOf(p.id);
          const spawn = PLAYER_SPAWNS[idx] ?? PLAYER_SPAWN;
          this.remotePositions.set(p.id, {
            x: spawn.x,
            y: spawn.y,
            tx: spawn.x,
            ty: spawn.y,
            alive: true
          });
          this.remotePlayers.get(p.id)?.setPosition(spawn.x, spawn.y);
        }
      } else if (p.id !== this.localId) {
        const pos = this.remotePositions.get(p.id);
        if (pos) this.remotePositions.set(p.id, { ...pos, alive: false });
      }

      this.cat.x = this.catSpawnPos.x;
      this.cat.y = this.catSpawnPos.y;
      this.catHostX = this.cat.x;
      this.catHostY = this.cat.y;
      this.catContainer.setPosition(this.cat.x, this.cat.y);
      this.cat.calm(25);

      // Floor only clears if at least one player escaped. If everyone dies
      // with no escapes (even after the loot goal), it's a full loss.
      if (!this.anyoneStillActive()) {
        if (this.escapedPlayers.size > 0) this.endMatch("escaped");
        else this.endMatch("caught");
      }
      this.pushHostSync();
      return;
    }
  }

  private checkEscape() {
    if (this.cashFound < CASH_TOTAL) return;
    for (const p of this.getAllPlayerStates()) {
      if (!p.alive || this.hasEscaped(p.id)) continue;
      const dx = p.x - this.backDoor.x;
      const dy = p.y - this.backDoor.y;
      if (Math.sqrt(dx * dx + dy * dy) <= ESCAPE_RADIUS) {
        this.markEscaped(p.id, true);
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
    if (this.hasEscaped(this.localId)) {
      this.playerContainer.setVisible(false);
    } else {
      this.playerContainer.setVisible(true);
      const alive = this.isPlayerAlive(this.localId);
      const invuln = (this.playerInvuln.get(this.localId) ?? 0) > 0;
      if (!alive) {
        this.playerContainer.setAlpha(0.35);
      } else {
        this.playerContainer.setAlpha(
          invuln ? 0.45 + 0.35 * Math.sin(this.time.now / 60) : 1
        );
      }
    }
    for (const [id, container] of this.remotePlayers) {
      if (this.hasEscaped(id) || !this.isPlayerAlive(id)) {
        container.setVisible(false);
        continue;
      }
      container.setVisible(true);
      const remoteInvuln = (this.playerInvuln.get(id) ?? 0) > 0;
      container.setAlpha(remoteInvuln ? 0.45 + 0.35 * Math.sin(this.time.now / 60) : 1);
    }
  }

  private endMatch(outcome: MatchOutcome) {
    if (this.matchEnded) return;
    this.matchEnded = true;
    this.emitPreview();

    const floorCleared = outcome === "escaped" && this.currentFloor < this.floorTotal;
    const runEnded = outcome === "caught" || (outcome === "escaped" && !floorCleared);

    if (this.multiplayer && this.isHost) {
      this.onHostSync?.({
        ...this.buildSyncState(),
        matchEnded: runEnded,
        outcome: runEnded ? outcome : undefined
      });

      if (floorCleared) {
        const onFloorAdvance = this.registry.get("onFloorAdvance") as
          | ((lives: Record<string, number>) => void)
          | undefined;
        onFloorAdvance?.(Object.fromEntries(this.playerLives));
      } else if (runEnded) {
        this.registry.get("onMatchOver")?.(outcome);
      }
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
      lives: this.playerLives.get(this.localId) ?? LIVES_TOTAL,
      livesTotal: LIVES_TOTAL,
      difficulty: this.difficulty
    };
    this.game.events.emit("preview:update", state);
  }
}
