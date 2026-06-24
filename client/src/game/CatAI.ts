// TypeScript port of repo-root CatAI.js for the client build, extended with a
// difficulty-aware hunt timer and an intelligent behavior layer.
//
// Synced with root CatAI.js: behavior profiles, multi-cat helpers, teleport,
// and collision-map-only movement (no wall clipping).

import type { CollisionMap, Waypoint } from "./CollisionMap";
import { roomAt, type RoomBounds } from "./CollisionMap";

export const CAT_STATES = {
  ASLEEP: "ASLEEP",
  IDLE: "IDLE",
  ROAM: "ROAM",
  ALERT: "ALERT",
  HUNT: "HUNT"
} as const;

export type CatStateKey = (typeof CAT_STATES)[keyof typeof CAT_STATES];
export type CatMood = "calm" | "warning" | "aggressive";
export type CatDifficulty = "normal" | "ludicrous";
export type CatBehavior = "HUNT" | "INTERCEPT" | "STALK" | "PATROL";
export type CatRole = "hunter" | "stalker";

export interface AiPlayer {
  id: string;
  x: number;
  y: number;
  alive: boolean;
}

export interface BehaviorProfile {
  id: string;
  thresholdMods?: Partial<Record<keyof typeof THRESHOLD, number>>;
  speedMods?: Partial<Record<CatStateKey, number>>;
  orbitRadiusMod?: number;
  aggressionDecayMod?: number;
  enableTeleport?: boolean;
}

export interface CatAIOptions {
  catId?: string;
  behaviorProfile?: BehaviorProfile;
  preferredPlayerId?: string | null;
  rooms?: RoomBounds[];
}

const TASK_NEGLECT_RATE: Record<string, number> = {
  FEED: 0.8,
  TOY: 0.5,
  COMFORT: 1.2
};

const THRESHOLD = {
  ROAM_START: 10,
  ALERT_START: 40,
  HUNT_START: 70,
  ALERT_END: 30,
  HUNT_END: 50
};

const SPEED: Record<CatStateKey, number> = {
  ASLEEP: 0,
  IDLE: 0,
  ROAM: 45,
  ALERT: 65,
  HUNT: 110
};

const MOOD_SPEED_MULT: Record<CatMood, number> = {
  calm: 0.8,
  warning: 0.95,
  aggressive: 1.1
};

const TELEPORT = {
  INTERVAL_MIN: 5,
  INTERVAL_MAX: 10,
  CATCH_BLOCK_DIST: 24,
  ROOM_INSET: 8,
  PICK_ATTEMPTS: 32,
  NEAR_PLAYER_MIN: 48,
  NEAR_PLAYER_MAX: 88,
  MIN_RELOC_DIST: 100
};

const AGGRESSION_DECAY_RATE = 1.5;
const MAX_STEP_PX = 8;

const HUNT_DELAY_NORMAL = 0;
const HUNT_DELAY_LUDICROUS = 0;
const REEVAL_COOLDOWN_NORMAL = 2.5;
const REEVAL_COOLDOWN_LUDICROUS = 0.8;
const SAME_ROOM_CASH = 3;
const STALK_RANGE_TILES = 6;
const STALK_STOP_TILES = 3.5;
const LOST_SIGHT_SECONDS = 5;
const DEFAULT_TILE = 20;

/** Data-driven presets — pass into constructor via behaviorProfile. */
export const CAT_PROFILES = {
  HUNTER: {
    id: "hunter",
    thresholdMods: {},
    speedMods: {},
    orbitRadiusMod: 1.0,
    aggressionDecayMod: 0.55,
    enableTeleport: false
  },
  STALKER: {
    id: "stalker",
    thresholdMods: { HUNT_START: -15 },
    speedMods: { HUNT: 0.88 },
    orbitRadiusMod: 1.45,
    aggressionDecayMod: 1.0,
    enableTeleport: false
  }
} satisfies Record<string, BehaviorProfile>;

export const MULTI_CAT_LEVELS = new Set([3, 4]);

export function catCountForLevel(level: number): number {
  if (level >= 4) return 4;
  if (MULTI_CAT_LEVELS.has(level)) return 2;
  return 1;
}

export function profileForLevel(level: number, role: CatRole = "hunter"): BehaviorProfile {
  const base = role === "stalker" ? CAT_PROFILES.STALKER : CAT_PROFILES.HUNTER;
  if (!MULTI_CAT_LEVELS.has(level)) return { ...base, enableTeleport: false };
  return { ...base, enableTeleport: true };
}

type Listener = (data: Record<string, unknown>) => void;

export class CatAI {
  x: number;
  y: number;
  readonly catId: string;
  state: CatStateKey = CAT_STATES.ASLEEP;
  aggression = 0;
  speed: number = SPEED.ASLEEP;
  awake = false;

  difficulty: CatDifficulty = "normal";
  huntTimer = 0;
  isHunting = false;
  currentBehavior: CatBehavior = "PATROL";
  targetPosition: Waypoint | null = null;

  private readonly mapWidth: number;
  private readonly mapHeight: number;
  private readonly profile: BehaviorProfile;
  private rooms: RoomBounds[];

  private graceDuration = 10;
  private sleepElapsed = 0;
  private graceRemaining = this.graceDuration;

  private pendingTasks = new Set<string>();
  private collisionMap: CollisionMap | null;
  private path: Waypoint[] = [];
  private pathGoal: Waypoint | null = null;

  private preferredPlayerId: string | null = null;
  private cashFound = 0;
  private uncollectedLoot: Waypoint[] = [];

  private reevalTimer = 0;
  private forceReeval = false;
  private lastSeenElapsed = 0;
  private stalkWaitTimer = 0;
  private patrolWaypoints: Waypoint[] = [];
  private patrolIndex = 0;
  private patrolRoomKey: string | null = null;

  private pauseTimer = 0;
  private teleportTimer = this.rollTeleportInterval();
  private teleportEnabled: boolean;

  private listeners: Record<string, Listener[]> = {};
  private elapsed = 0;

  constructor(
    startPos: Waypoint,
    mapWidth: number,
    mapHeight: number,
    collisionMap: CollisionMap | null = null,
    options: CatAIOptions = {}
  ) {
    this.x = startPos.x;
    this.y = startPos.y;
    this.mapWidth = mapWidth;
    this.mapHeight = mapHeight;
    this.collisionMap = collisionMap;
    this.catId = options.catId ?? "cat";
    this.profile = { ...CAT_PROFILES.HUNTER, ...(options.behaviorProfile ?? {}) };
    this.rooms = options.rooms ?? [];
    this.preferredPlayerId = options.preferredPlayerId ?? null;
    this.teleportEnabled = !!this.profile.enableTeleport;
    this.graceRemaining = this.graceDuration;
    this.snapToWalkable();
  }

  setDifficulty(difficulty: string): void {
    this.difficulty = difficulty === "ludicrous" ? "ludicrous" : "normal";
  }

  setRooms(rooms: RoomBounds[]): void {
    this.rooms = rooms;
  }

  setPreferredPlayerId(playerId: string | null): void {
    this.preferredPlayerId = playerId;
  }

  setHuntContext(cashFound: number, uncollectedLoot: Waypoint[]): void {
    this.cashFound = cashFound;
    this.uncollectedLoot = uncollectedLoot;
  }

  update(delta: number, players: AiPlayer[]): void {
    delta = Math.min(delta, 50);
    const dt = delta / 1000;
    this.elapsed += dt;

    this.huntTimer += dt;
    if (!this.isHunting && this.huntTimer >= this.huntDelay()) {
      this.isHunting = true;
      if (!this.awake) this.wake("hunt");
      this.aggression = Math.max(this.aggression, this.threshold("ALERT_START"));
      this.forceReeval = true;
    }

    if (!this.awake) {
      this.sleepElapsed += dt;
      this.graceRemaining = Math.max(0, this.graceDuration - this.sleepElapsed);
      if (this.sleepElapsed >= this.graceDuration) this.wake("timer");
    }

    this.tickAggression(dt);
    if (this.isHunting) this.aggression = Math.max(this.aggression, this.threshold("ALERT_START"));
    this.updateState();
    if (this.awake) this.maybeTeleport(dt, players);
    this.move(dt, players);
  }

  reset(): void {
    this.awake = true;
    this.sleepElapsed = 0;
    this.graceRemaining = 0;
    this.state = CAT_STATES.ROAM;
    this.speed = this.speedForState(CAT_STATES.ROAM);
    this.path = [];
    this.pathGoal = null;
    this.aggression = 0;
    this.pendingTasks.clear();
    this.preferredPlayerId = null;
    this.huntTimer = 0;
    this.isHunting = false;
    this.currentBehavior = "PATROL";
    this.targetPosition = null;
    this.reevalTimer = 0;
    this.forceReeval = false;
    this.lastSeenElapsed = 0;
    this.stalkWaitTimer = 0;
    this.patrolWaypoints = [];
    this.patrolIndex = 0;
    this.patrolRoomKey = null;
    this.pauseTimer = 0;
    this.teleportTimer = this.rollTeleportInterval();
    this.elapsed = 0;
    this.snapToWalkable();
  }

  onClueCollected(playerId: string, clueId: string): void {
    this.preferredPlayerId = playerId;
    this.increaseAggression(12);
    this.wake("clue");
    this.forceReeval = true;
    this.emit("clue_collected", { catId: this.catId, playerId, clueId, aggression: this.aggression });
  }

  neglectTask(task: string): void {
    if (TASK_NEGLECT_RATE[task] === undefined) return;
    this.pendingTasks.add(task);
    this.emit("task_neglected", { catId: this.catId, task, aggression: this.aggression });
  }

  completeTask(task: string): void {
    if (!this.pendingTasks.has(task)) return;
    this.pendingTasks.delete(task);
    const reduction = ({ FEED: 20, TOY: 15, COMFORT: 30 } as Record<string, number>)[task] ?? 10;
    this.aggression = Math.max(0, this.aggression - reduction);
    this.emit("task_completed", { catId: this.catId, task, aggression: this.aggression });
  }

  calm(amount = 15): void {
    this.aggression = Math.max(0, this.aggression - amount);
    this.emit("calmed", { catId: this.catId, aggression: this.aggression });
  }

  wake(reason = "timer"): void {
    if (this.awake) return;
    this.awake = true;
    this.graceRemaining = 0;
    this.state = this.aggression >= this.threshold("ALERT_START") ? CAT_STATES.ALERT : CAT_STATES.ROAM;
    this.speed = this.speedForState(this.state);
    this.emit("cat_awoke", {
      catId: this.catId,
      reason,
      graceRemainingMs: 0,
      aggression: this.aggression,
      state: this.state,
      mood: this.mood
    });
    this.emit("state_changed", {
      catId: this.catId,
      from: CAT_STATES.ASLEEP,
      to: this.state,
      aggression: this.aggression,
      reason,
      mood: this.mood
    });
  }

  on(event: string, fn: Listener): this {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
    return this;
  }

  get mood(): CatMood {
    if (!this.awake) return "calm";
    if (this.state === CAT_STATES.HUNT) return "aggressive";
    if (this.state === CAT_STATES.ALERT) return "warning";
    return "calm";
  }

  static pickDistinctRoomSpawns(
    rooms: RoomBounds[] | null | undefined,
    collisionMap: CollisionMap | null,
    count = 2
  ): Waypoint[] {
    if (!rooms || rooms.length === 0) return [];
    const shuffled = [...rooms].sort(() => Math.random() - 0.5);
    const picks: Waypoint[] = [];
    const usedKeys = new Set<string>();

    for (const room of shuffled) {
      if (picks.length >= count) break;
      if (usedKeys.has(room.key)) continue;
      const pos = CatAI.randomWalkableInRoom(room, collisionMap);
      if (pos) {
        picks.push(pos);
        usedKeys.add(room.key);
      }
    }

    while (picks.length < count) {
      const room = shuffled[picks.length % shuffled.length];
      const pos = CatAI.randomWalkableInRoom(room, collisionMap);
      if (pos) picks.push(pos);
      else break;
    }

    return picks;
  }

  static assignPreferredTargets(cats: CatAI[], playerIds: string[]): void {
    if (!playerIds.length) return;
    const shuffled = [...playerIds].sort(() => Math.random() - 0.5);
    cats.forEach((cat, i) => {
      if (!cat.preferredPlayerId) cat.preferredPlayerId = shuffled[i % shuffled.length];
    });
  }

  private static randomWalkableInRoom(room: RoomBounds, collisionMap: CollisionMap | null): Waypoint | null {
    const inset = TELEPORT.ROOM_INSET;
    for (let i = 0; i < TELEPORT.PICK_ATTEMPTS; i++) {
      const x = room.x + inset + Math.random() * Math.max(1, room.w - inset * 2);
      const y = room.y + inset + Math.random() * Math.max(1, room.h - inset * 2);
      if (!collisionMap || collisionMap.isWalkable(x, y)) return { x, y };
    }
    return collisionMap?.findNearestWalkable(room.x + room.w / 2, room.y + room.h / 2) ?? null;
  }

  private threshold(key: keyof typeof THRESHOLD): number {
    return THRESHOLD[key] + (this.profile.thresholdMods?.[key] ?? 0);
  }

  private speedForState(state: CatStateKey): number {
    return SPEED[state] * (this.profile.speedMods?.[state] ?? 1);
  }

  private tickAggression(dt: number): void {
    for (const task of this.pendingTasks) {
      this.increaseAggression(TASK_NEGLECT_RATE[task] * dt);
    }
    if (this.pendingTasks.size === 0 && this.state !== CAT_STATES.HUNT) {
      const decayMod = this.profile.aggressionDecayMod ?? 1;
      this.aggression = Math.max(0, this.aggression - AGGRESSION_DECAY_RATE * decayMod * dt);
    }
  }

  private increaseAggression(amount: number): void {
    this.aggression = Math.min(100, this.aggression + amount);
  }

  private updateState(): void {
    if (!this.awake) return;
    const prev = this.state;
    switch (this.state) {
      case CAT_STATES.IDLE:
        this.state = CAT_STATES.ROAM;
        break;
      case CAT_STATES.ROAM:
        if (this.aggression >= this.threshold("ALERT_START")) this.state = CAT_STATES.ALERT;
        break;
      case CAT_STATES.ALERT:
        if (this.aggression >= this.threshold("HUNT_START")) this.state = CAT_STATES.HUNT;
        else if (this.aggression <= this.threshold("ALERT_END")) this.state = CAT_STATES.ROAM;
        break;
      case CAT_STATES.HUNT:
        if (this.aggression <= this.threshold("HUNT_END")) this.state = CAT_STATES.ALERT;
        break;
    }
    if (this.state !== prev) {
      this.speed = this.speedForState(this.state);
      this.emit("state_changed", {
        catId: this.catId,
        from: prev,
        to: this.state,
        aggression: this.aggression,
        mood: this.mood
      });
    }
  }

  private maybeTeleport(dt: number, players: AiPlayer[]): void {
    if (!this.teleportEnabled || !this.awake || this.pauseTimer > 0) return;

    this.teleportTimer -= dt;
    if (this.teleportTimer > 0) return;

    const targetPlayer = this.preferredPlayer(players) || this.nearestPlayer(players);
    if (
      this.state === CAT_STATES.HUNT &&
      targetPlayer &&
      this.dist(targetPlayer) < TELEPORT.CATCH_BLOCK_DIST
    ) {
      this.teleportTimer = 0.5;
      return;
    }

    const destination = this.pickTeleportDestination(players);
    this.teleportTimer = this.rollTeleportInterval();
    if (!destination || !targetPlayer) return;

    const from = { x: this.x, y: this.y };
    this.x = destination.x;
    this.y = destination.y;
    this.snapToWalkable();
    this.path = [];
    this.pathGoal = null;
    this.pauseTimer = 0.35;
    this.emit("cat_teleported", {
      catId: this.catId,
      from,
      to: { x: this.x, y: this.y },
      state: this.state,
      aggression: this.aggression
    });
  }

  private pickTeleportDestination(players: AiPlayer[]): Waypoint | null {
    const targetPlayer = this.preferredPlayer(players) || this.nearestPlayer(players);
    if (!targetPlayer) return null;

    for (let attempt = 0; attempt < TELEPORT.PICK_ATTEMPTS; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const offset =
        TELEPORT.NEAR_PLAYER_MIN +
        Math.random() * (TELEPORT.NEAR_PLAYER_MAX - TELEPORT.NEAR_PLAYER_MIN);
      const x = targetPlayer.x + Math.cos(angle) * offset;
      const y = targetPlayer.y + Math.sin(angle) * offset;

      if (this.collisionMap && !this.collisionMap.isWalkable(x, y)) continue;
      if (this.distXY(this.x, this.y, x, y) < TELEPORT.MIN_RELOC_DIST) continue;
      if (this.distXY(x, y, targetPlayer.x, targetPlayer.y) < TELEPORT.CATCH_BLOCK_DIST) continue;
      return { x, y };
    }

    return null;
  }

  private rollTeleportInterval(): number {
    return TELEPORT.INTERVAL_MIN + Math.random() * (TELEPORT.INTERVAL_MAX - TELEPORT.INTERVAL_MIN);
  }

  private huntDelay(): number {
    return this.difficulty === "ludicrous" ? HUNT_DELAY_LUDICROUS : HUNT_DELAY_NORMAL;
  }

  private reevalCooldown(): number {
    return this.difficulty === "ludicrous" ? REEVAL_COOLDOWN_LUDICROUS : REEVAL_COOLDOWN_NORMAL;
  }

  private tile(): number {
    return this.collisionMap?.tileW ?? DEFAULT_TILE;
  }

  private move(dt: number, players: AiPlayer[]): void {
    if (this.pauseTimer > 0) {
      this.pauseTimer -= dt;
      return;
    }

    const player = this.preferredPlayer(players) || this.nearestPlayer(players);
    if (!player) return;

    const tile = this.tile();
    const sameRoom = this.sameRoomAs(player);
    const tilesAway = this.dist(player) / tile;

    if (sameRoom || tilesAway <= STALK_RANGE_TILES) this.lastSeenElapsed = this.elapsed;

    this.reevalTimer -= dt;
    if (this.forceReeval || this.reevalTimer <= 0) {
      this.selectBehavior(player, sameRoom, tilesAway);
      this.reevalTimer = this.reevalCooldown();
      this.forceReeval = false;
    }

    this.executeBehavior(dt, player, tile);
  }

  private selectBehavior(player: AiPlayer, sameRoom: boolean, tilesAway: number): void {
    const lostSight = this.elapsed - this.lastSeenElapsed > LOST_SIGHT_SECONDS;
    const ludicrous = this.difficulty === "ludicrous";
    let next: CatBehavior;

    if (!this.isHunting) {
      next = "PATROL";
    } else if (lostSight) {
      next = ludicrous ? "INTERCEPT" : "PATROL";
    } else if (ludicrous) {
      next = sameRoom || this.cashFound >= SAME_ROOM_CASH ? "HUNT" : "INTERCEPT";
    } else {
      const mood = this.mood;
      if (mood === "aggressive") next = "HUNT";
      else if (mood === "calm") next = "PATROL";
      else if (sameRoom || this.cashFound >= SAME_ROOM_CASH) next = "HUNT";
      else if (tilesAway <= STALK_RANGE_TILES) next = "STALK";
      else next = "INTERCEPT";
    }

    if (next !== this.currentBehavior) {
      this.currentBehavior = next;
      this.stalkWaitTimer = 0;
      this.path = [];
      this.pathGoal = null;
      this.targetPosition = null;
      if (next === "PATROL") this.setupPatrol();
    }
  }

  private executeBehavior(dt: number, player: AiPlayer, tile: number): void {
    switch (this.currentBehavior) {
      case "HUNT":
        this.targetPosition = { x: player.x, y: player.y };
        this.followPathOrTarget(this.targetPosition, dt, 0.1);
        break;
      case "INTERCEPT": {
        const loot = this.nearestLootToPlayer(player);
        this.targetPosition = loot ?? { x: player.x, y: player.y };
        this.followPathOrTarget(this.targetPosition, dt);
        break;
      }
      case "STALK":
        if (this.stalkWaitTimer > 0) {
          this.stalkWaitTimer -= dt;
          if (this.stalkWaitTimer <= 0) this.forceReeval = true;
          break;
        }
        {
          const stopDist = tile * STALK_STOP_TILES;
          if (this.dist(player) <= stopDist) {
            this.stalkWaitTimer = 1;
            break;
          }
          const dx = player.x - this.x;
          const dy = player.y - this.y;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          this.targetPosition = {
            x: player.x - (dx / len) * stopDist,
            y: player.y - (dy / len) * stopDist
          };
          this.followPathOrTarget(this.targetPosition, dt, 0.4);
        }
        break;
      case "PATROL": {
        const room = roomAt(this.x, this.y, this.rooms);
        if (this.patrolWaypoints.length < 2 || (room && room.key !== this.patrolRoomKey)) {
          this.setupPatrol();
        }
        const wp = this.patrolWaypoints[this.patrolIndex];
        if (wp) {
          this.targetPosition = wp;
          this.followPathOrTarget(wp, dt, 0.2);
          if (this.distXY(this.x, this.y, wp.x, wp.y) < 14) {
            this.patrolIndex = (this.patrolIndex + 1) % this.patrolWaypoints.length;
          }
        }
        break;
      }
    }
  }

  private setupPatrol(): void {
    const room =
      roomAt(this.x, this.y, this.rooms) ??
      this.rooms[0] ??
      ({ key: "world", x: 30, y: 30, w: 740, h: 540 } as RoomBounds);
    this.patrolWaypoints = [
      this.safePoint(room.x + room.w * 0.3, room.y + room.h / 2),
      this.safePoint(room.x + room.w * 0.7, room.y + room.h / 2)
    ];
    this.patrolIndex = 0;
    this.patrolRoomKey = room.key;
  }

  private safePoint(x: number, y: number): Waypoint {
    if (!this.collisionMap) return { x, y };
    const found = this.collisionMap.findNearestWalkable(x, y);
    return found ?? { x, y };
  }

  private nearestLootToPlayer(player: AiPlayer): Waypoint | null {
    let best: Waypoint | null = null;
    let bestDist = Infinity;
    for (const loot of this.uncollectedLoot) {
      const d = this.distXY(loot.x, loot.y, player.x, player.y);
      if (d < bestDist) {
        bestDist = d;
        best = loot;
      }
    }
    return best;
  }

  private sameRoomAs(player: AiPlayer): boolean {
    const catRoom = roomAt(this.x, this.y, this.rooms);
    const playerRoom = roomAt(player.x, player.y, this.rooms);
    return !!catRoom && !!playerRoom && catRoom.key === playerRoom.key;
  }

  private followPathOrTarget(target: Waypoint, dt: number, slowdown = 0): void {
    if (!this.collisionMap) {
      this.stepToward(target, dt, slowdown);
      return;
    }

    const goal = this.collisionMap.findNearestWalkable(target.x, target.y);
    if (!goal) return;

    const goalChanged =
      !this.pathGoal || this.distXY(goal.x, goal.y, this.pathGoal.x, this.pathGoal.y) > 64;
    if (goalChanged || this.path.length === 0) {
      this.path = this.collisionMap.findPath(this.x, this.y, goal.x, goal.y);
      this.pathGoal = { x: goal.x, y: goal.y };
    }

    if (this.path.length > 0) {
      const waypoint = this.path[0];
      this.stepToward(waypoint, dt, slowdown);
      if (this.distXY(this.x, this.y, waypoint.x, waypoint.y) < 10) this.path.shift();
    }
  }

  private distXY(x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private stepToward(target: Waypoint | null, dt: number, slowdown = 0): void {
    if (!target || !this.collisionMap) return;
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;

    const moodMult = MOOD_SPEED_MULT[this.mood] ?? 1;
    const factor = 1 - slowdown;
    const move = Math.min(this.speed * dt * moodMult * factor, MAX_STEP_PX, len);
    const toX = this.x + (dx / len) * move;
    const toY = this.y + (dy / len) * move;

    const resolved = this.collisionMap.resolveMove(this.x, this.y, toX, toY);
    this.x = resolved.x;
    this.y = resolved.y;
  }

  private snapToWalkable(): void {
    if (!this.collisionMap) return;
    const snapped = this.collisionMap.findNearestWalkable(this.x, this.y);
    if (snapped) {
      this.x = snapped.x;
      this.y = snapped.y;
    }
  }

  private preferredPlayer(players: AiPlayer[]): AiPlayer | null {
    if (!this.preferredPlayerId) return null;
    return players.find((p) => p.id === this.preferredPlayerId) || null;
  }

  private nearestPlayer(players: AiPlayer[]): AiPlayer | null {
    if (!players.length) return null;
    return players.reduce<AiPlayer | null>(
      (best, p) => (best === null || this.dist(p) < this.dist(best) ? p : best),
      null
    );
  }

  private dist(pos: Waypoint): number {
    return this.distXY(pos.x, pos.y, this.x, this.y);
  }

  private emit(event: string, data: Record<string, unknown>): void {
    (this.listeners[event] || []).forEach((fn) => fn(data));
  }
}
