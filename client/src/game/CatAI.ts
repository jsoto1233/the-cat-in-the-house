// TypeScript port of repo-root CatAI.js for the client build, extended with a
// difficulty-aware hunt timer and an intelligent behavior layer.
//
// Mood/aggression remain governed by the original FSM (ASLEEP/ROAM/ALERT/HUNT);
// on top of that sits a behavior selector (HUNT / INTERCEPT / STALK / PATROL)
// that is re-evaluated on a cooldown using only in-game state — no async, no
// external calls. The root CatAI.js stays canonical for server/multiplayer.

import type { CollisionMap, Waypoint } from "./CollisionMap";
import { ROOMS, roomAt, type RoomBounds } from "./CollisionMap";

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

export interface AiPlayer {
  id: string;
  x: number;
  y: number;
  alive: boolean;
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

const MAX_STEP_PX = 8;

// Behavior-layer tuning.
const HUNT_DELAY_NORMAL = 0; // no opening grace — cat hunts immediately on normal too
const HUNT_DELAY_LUDICROUS = 0;
const REEVAL_COOLDOWN_NORMAL = 2.5; // seconds between behavior decisions
const REEVAL_COOLDOWN_LUDICROUS = 0.8;
const SAME_ROOM_CASH = 3; // cashFound >= this forces direct HUNT
const STALK_RANGE_TILES = 6;
const STALK_STOP_TILES = 3.5; // hang ~3-4 tiles short while stalking
const LOST_SIGHT_SECONDS = 5;
/**
 * How long the cat patrols after losing the player before it starts converging
 * on the loot instead. Keeps the "it lost me" beat without letting the cat give
 * up on the match entirely.
 */
const GIVE_UP_PATROL_SECONDS = 9;
const DEFAULT_TILE = 20;

type Listener = (data: Record<string, unknown>) => void;

export class CatAI {
  x: number;
  y: number;
  state: CatStateKey = CAT_STATES.ASLEEP;
  aggression = 0;
  speed: number = SPEED.ASLEEP;
  awake = false;

  // Difficulty + hunt timer (PART 1).
  difficulty: CatDifficulty = "normal";
  huntTimer = 0;
  isHunting = false;

  // Behavior layer (PART 2-4).
  currentBehavior: CatBehavior = "PATROL";
  targetPosition: Waypoint | null = null;

  private readonly mapWidth: number;
  private readonly mapHeight: number;

  private graceDuration = 10;
  private sleepElapsed = 0;
  private graceRemaining = this.graceDuration;

  private pendingTasks = new Set<string>();
  private collisionMap: CollisionMap | null;
  private path: Waypoint[] = [];

  /** Read-only copy of the current A* path (debug visualisation only). */
  get debugPath(): Waypoint[] {
    return this.path;
  }
  private pathGoal: Waypoint | null = null;

  private preferredPlayerId: string | null = null;

  // Live context fed by the scene each frame.
  private cashFound = 0;
  private uncollectedLoot: Waypoint[] = [];

  // Behavior bookkeeping.
  private reevalTimer = 0;
  private forceReeval = false;
  private lastSeenElapsed = 0;
  private stalkWaitTimer = 0;
  private chaseTargetId: string | null = null;
  private patrolWaypoints: Waypoint[] = [];
  private patrolIndex = 0;
  private patrolRoomKey: string | null = null;

  private listeners: Record<string, Listener[]> = {};
  private elapsed = 0;

  constructor(
    startPos: Waypoint,
    mapWidth: number,
    mapHeight: number,
    collisionMap: CollisionMap | null = null
  ) {
    this.x = startPos.x;
    this.y = startPos.y;
    this.mapWidth = mapWidth;
    this.mapHeight = mapHeight;
    this.collisionMap = collisionMap;
    this.graceRemaining = this.graceDuration;
  }

  // ---------- public configuration / context ----------

  /** Set the active difficulty (persists across reset). */
  setDifficulty(difficulty: string): void {
    this.difficulty = difficulty === "ludicrous" ? "ludicrous" : "normal";
  }

  /** Feed live game state used by the behavior selector (call before update). */
  setHuntContext(cashFound: number, uncollectedLoot: Waypoint[]): void {
    // A grabbed piece of loot is a NOISE EVENT. Without this the cat has no
    // sense at all beyond proximity, so on the larger levels a player could
    // strip the whole floor without ever being noticed. Hearing the grab
    // refreshes its awareness and makes it re-decide immediately.
    if (cashFound > this.cashFound) {
      this.lastSeenElapsed = this.elapsed;
      this.forceReeval = true;
      this.increaseAggression(18);
    }
    this.cashFound = cashFound;
    this.uncollectedLoot = uncollectedLoot;
  }

  // ---------- main loop ----------

  update(delta: number, players: AiPlayer[]): void {
    delta = Math.min(delta, 50);
    const dt = delta / 1000;
    this.elapsed += dt;

    // PART 1 — hunt timer: once the threshold passes, isHunting stays true.
    this.huntTimer += dt;
    if (!this.isHunting && this.huntTimer >= this.huntDelay()) {
      this.isHunting = true;
      // Commit to the hunt: ensure the cat is awake and at least agitated so
      // the FSM yields a pursuing mood (input nudge, not a mood rewrite).
      if (!this.awake) this.wake("hunt");
      this.aggression = Math.max(this.aggression, THRESHOLD.ALERT_START);
      this.forceReeval = true;
    }

    if (!this.awake) {
      this.sleepElapsed += dt;
      this.graceRemaining = Math.max(0, this.graceDuration - this.sleepElapsed);
      if (this.sleepElapsed >= this.graceDuration) this.wake("timer");
    }

    this.tickAggression(dt);
    // Keep mood >= warning while committed to the hunt (decay would otherwise
    // let it drift back to calm with no loot activity).
    if (this.isHunting) this.aggression = Math.max(this.aggression, THRESHOLD.ALERT_START);
    this.updateState();
    this.move(dt, players);
  }

  reset(): void {
    this.awake = true; // start active so it can idle/patrol immediately
    this.sleepElapsed = 0;
    this.graceRemaining = 0;
    this.state = CAT_STATES.ROAM;
    this.speed = SPEED.ROAM;
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
    this.chaseTargetId = null;
    this.patrolWaypoints = [];
    this.patrolIndex = 0;
    this.patrolRoomKey = null;
    this.elapsed = 0;
  }

  onClueCollected(playerId: string, clueId: string): void {
    this.preferredPlayerId = playerId;
    this.increaseAggression(12);
    this.wake("clue");
    // PART 2 note: a pickup is a strong signal — re-evaluate immediately.
    this.forceReeval = true;
    this.emit("clue_collected", { playerId, clueId, aggression: this.aggression });
  }

  neglectTask(task: string): void {
    if (TASK_NEGLECT_RATE[task] === undefined) return;
    this.pendingTasks.add(task);
    this.emit("task_neglected", { task, aggression: this.aggression });
  }

  completeTask(task: string): void {
    if (!this.pendingTasks.has(task)) return;
    this.pendingTasks.delete(task);
    const reduction = ({ FEED: 20, TOY: 15, COMFORT: 30 } as Record<string, number>)[task] ?? 10;
    this.aggression = Math.max(0, this.aggression - reduction);
    this.emit("task_completed", { task, aggression: this.aggression });
  }

  calm(amount = 15): void {
    this.aggression = Math.max(0, this.aggression - amount);
    this.emit("calmed", { aggression: this.aggression });
  }

  wake(reason = "timer"): void {
    if (this.awake) return;
    this.awake = true;
    this.graceRemaining = 0;
    this.state = this.aggression >= THRESHOLD.ALERT_START ? CAT_STATES.ALERT : CAT_STATES.ROAM;
    this.speed = SPEED[this.state];
    this.emit("cat_awoke", {
      reason,
      graceRemainingMs: 0,
      aggression: this.aggression,
      state: this.state,
      mood: this.mood
    });
    this.emit("state_changed", {
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

  // ---------- mood / aggression FSM (unchanged behavior) ----------

  private tickAggression(dt: number): void {
    for (const task of this.pendingTasks) {
      this.increaseAggression(TASK_NEGLECT_RATE[task] * dt);
    }
    if (this.pendingTasks.size === 0 && this.state !== CAT_STATES.HUNT) {
      this.aggression = Math.max(0, this.aggression - 1.5 * dt);
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
        if (this.aggression >= THRESHOLD.ALERT_START) this.state = CAT_STATES.ALERT;
        break;
      case CAT_STATES.ALERT:
        if (this.aggression >= THRESHOLD.HUNT_START) this.state = CAT_STATES.HUNT;
        else if (this.aggression <= THRESHOLD.ALERT_END) this.state = CAT_STATES.ROAM;
        break;
      case CAT_STATES.HUNT:
        if (this.aggression <= THRESHOLD.HUNT_END) this.state = CAT_STATES.ALERT;
        break;
    }
    if (this.state !== prev) {
      this.speed = SPEED[this.state];
      this.emit("state_changed", {
        from: prev,
        to: this.state,
        aggression: this.aggression,
        mood: this.mood
      });
    }
  }

  // ---------- behavior layer (PART 2-4) ----------

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
    const player = this.preferredPlayer(players) || this.nearestPlayer(players);
    if (!player) {
      this.chaseTargetId = null;
      this.clampPosition();
      return;
    }

    // Someone left play (escaped/died) or focus swapped — drop old pathing and
    // commit to chasing the remaining player immediately (avoids door-room patrol loops).
    if (this.chaseTargetId !== player.id) {
      this.chaseTargetId = player.id;
      this.path = [];
      this.pathGoal = null;
      this.targetPosition = null;
      this.stalkWaitTimer = 0;
      this.lastSeenElapsed = this.elapsed;
      this.forceReeval = true;
      if (this.isHunting) this.currentBehavior = "HUNT";
    }

    const tile = this.tile();
    const sameRoom = this.sameRoomAs(player);
    const tilesAway = this.dist(player) / tile;

    // Track when the player was last "seen" (same room or within stalk range).
    if (sameRoom || tilesAway <= STALK_RANGE_TILES) this.lastSeenElapsed = this.elapsed;

    // Re-evaluate behavior on a cooldown (or immediately when forced).
    this.reevalTimer -= dt;
    if (this.forceReeval || this.reevalTimer <= 0) {
      this.selectBehavior(player, sameRoom, tilesAway);
      this.reevalTimer = this.reevalCooldown();
      this.forceReeval = false;
    }

    this.executeBehavior(dt, player, tile);
    this.clampPosition();

    if (this.dist(player) < 24) this.emit("player_caught", { playerId: player.id });
  }

  private selectBehavior(player: AiPlayer, sameRoom: boolean, tilesAway: number): void {
    const lostSight = this.elapsed - this.lastSeenElapsed > LOST_SIGHT_SECONDS;
    const ludicrous = this.difficulty === "ludicrous";
    let next: CatBehavior;

    if (!this.isHunting) {
      // Idle phase: drift around the current room.
      next = "PATROL";
    } else if (lostSight) {
      // Losing sight used to drop the cat to PATROL on normal difficulty, and
      // it never climbed back out. A cat that spawns more than STALK_RANGE
      // tiles away in another room is "lost" from the very first second, so on
      // four of the ten levels it patrolled its spawn room for the entire match
      // and never once came after the player.
      //
      // Now the search escalates: a short spell of patrolling (which reads as
      // the cat having genuinely lost you), and after that it converges on the
      // loot, because that is where the player has to go.
      const lostFor = this.elapsed - this.lastSeenElapsed;
      next = ludicrous || lostFor > GIVE_UP_PATROL_SECONDS ? "INTERCEPT" : "PATROL";
    } else if (ludicrous) {
      // PART 4 — ludicrous only ever HUNTs or INTERCEPTs.
      next = sameRoom || this.cashFound >= SAME_ROOM_CASH ? "HUNT" : "INTERCEPT";
    } else {
      // PART 3 — mood drives behavior (mood itself is owned by the FSM).
      const mood = this.mood;
      if (mood === "aggressive") {
        next = "HUNT";
      } else if (mood === "calm") {
        next = "PATROL";
      } else {
        // warning: PART 2 conditions.
        if (sameRoom || this.cashFound >= SAME_ROOM_CASH) next = "HUNT";
        else if (tilesAway <= STALK_RANGE_TILES) next = "STALK";
        else next = "INTERCEPT";
      }
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
      case "HUNT": {
        this.targetPosition = { x: player.x, y: player.y };
        this.followPathOrTarget(this.targetPosition, dt, 0.1);
        break;
      }
      case "INTERCEPT": {
        // Camp the loot the player is heading for. Once the floor is stripped
        // there is nothing left to camp, so it closes on the player directly —
        // otherwise the endgame would have the cat wandering while the player
        // strolls to the exit.
        const loot = this.nearestLootToPlayer(player);
        this.targetPosition = loot ?? { x: player.x, y: player.y };
        this.followPathOrTarget(this.targetPosition, dt, loot ? undefined : 0.1);
        break;
      }
      case "STALK": {
        if (this.stalkWaitTimer > 0) {
          this.stalkWaitTimer -= dt;
          if (this.stalkWaitTimer <= 0) this.forceReeval = true; // watch, then re-decide
          break;
        }
        const stopDist = tile * STALK_STOP_TILES;
        if (this.dist(player) <= stopDist) {
          this.stalkWaitTimer = 1; // hang back and watch for ~1s
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
        break;
      }
      case "PATROL": {
        const room = roomAt(this.x, this.y);
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
    const room: RoomBounds =
      roomAt(this.x, this.y) ?? ROOMS[2] ?? { key: "world", x: 30, y: 30, w: 740, h: 540 };
    this.patrolWaypoints = [
      this.safePoint(room.x + room.w * 0.3, room.y + room.h / 2),
      this.safePoint(room.x + room.w * 0.7, room.y + room.h / 2)
    ];
    this.patrolIndex = 0;
    this.patrolRoomKey = room.key;
  }

  /** Nudge a point onto a walkable tile if possible, else return room center. */
  private safePoint(x: number, y: number): Waypoint {
    if (!this.collisionMap || this.collisionMap.isWalkable(x, y)) return { x, y };
    const offsets = [0, -20, 20, -40, 40];
    for (const oy of offsets) {
      if (this.collisionMap.isWalkable(x, y + oy)) return { x, y: y + oy };
    }
    return { x, y };
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
    const catRoom = roomAt(this.x, this.y);
    const playerRoom = roomAt(player.x, player.y);
    return !!catRoom && !!playerRoom && catRoom.key === playerRoom.key;
  }

  // ---------- movement primitives ----------

  private followPathOrTarget(target: Waypoint, dt: number, slowdown = 0): void {
    if (!this.collisionMap) {
      this.stepToward(target, dt, slowdown);
      return;
    }
    const goalChanged =
      !this.pathGoal || this.distXY(target.x, target.y, this.pathGoal.x, this.pathGoal.y) > 64;
    if (goalChanged || this.path.length === 0) {
      this.path = this.collisionMap.findPath(this.x, this.y, target.x, target.y);
      this.pathGoal = { x: target.x, y: target.y };
    }
    if (this.path.length > 0) {
      const waypoint = this.path[0];
      this.stepToward(waypoint, dt, slowdown);
      if (this.distXY(this.x, this.y, waypoint.x, waypoint.y) < 10) this.path.shift();
      return;
    }
    this.stepToward(target, dt, slowdown);
  }

  private distXY(x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private stepToward(target: Waypoint | null, dt: number, slowdown = 0): void {
    if (!target) return;
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;

    const moodMult = MOOD_SPEED_MULT[this.mood] ?? 1;
    const factor = 1 - slowdown;
    const move = Math.min(this.speed * dt * moodMult * factor, MAX_STEP_PX, len);
    const toX = this.x + (dx / len) * move;
    const toY = this.y + (dy / len) * move;

    if (this.collisionMap) {
      const resolved = this.collisionMap.resolveMove(this.x, this.y, toX, toY);
      this.x = resolved.x;
      this.y = resolved.y;
    } else {
      this.x = toX;
      this.y = toY;
    }
    this.clampPosition();
  }

  private preferredPlayer(players: AiPlayer[]): AiPlayer | null {
    if (!this.preferredPlayerId) return null;
    const preferred =
      players.find((p) => p.id === this.preferredPlayerId && p.alive) || null;
    if (!preferred) this.preferredPlayerId = null;
    return preferred;
  }

  private nearestPlayer(players: AiPlayer[]): AiPlayer | null {
    if (!players || players.length === 0) return null;
    return players.reduce<AiPlayer | null>((best, p) => {
      if (!p.alive) return best;
      return best === null || this.dist(p) < this.dist(best) ? p : best;
    }, null);
  }

  private dist(pos: Waypoint): number {
    const dx = pos.x - this.x;
    const dy = pos.y - this.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private clampPosition(): void {
    this.x = Math.max(0, Math.min(this.mapWidth, this.x));
    this.y = Math.max(0, Math.min(this.mapHeight, this.y));
  }

  private emit(event: string, data: Record<string, unknown>): void {
    (this.listeners[event] || []).forEach((fn) => fn(data));
  }
}
