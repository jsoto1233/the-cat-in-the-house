/**
 * CatAI.js
 * =========
 Cat Behavior System for "The Cat in the House"
 *
 * State Machine:
 *   ASLEEP ──► ROAM ──► ALERT ──► HUNT
 * This machine is driven by mood, clues, tasks, and grace behavior.
 *
 * Multi-cat (Levels 3–4): instantiate two CatAI instances with distinct
 * behaviorProfile values. Serialize output is keyed by catId for Vincent's
 * multiplayer layer — e.g. { cat_a: catA.serialize(), cat_b: catB.serialize() }.
 */

export const CAT_STATES = {
  ASLEEP: 'ASLEEP',
  IDLE:   'IDLE',
  ROAM:   'ROAM',
  ALERT:  'ALERT',
  HUNT:   'HUNT',
};

const TASK_NEGLECT_RATE = {
  FEED:    0.8,
  TOY:     0.5,
  COMFORT: 1.2,
};

const THRESHOLD = {
  ROAM_START:  10,
  ALERT_START: 40,
  HUNT_START:  70,
  ALERT_END:   30,
  HUNT_END:    50,
};

const SPEED = {
  ASLEEP: 0,
  IDLE:   0,
  ROAM:   45,
  ALERT:  65,
  HUNT:   110,
};

const MOOD_SPEED_MULT = {
  calm:       0.80,
  warning:    0.95,
  aggressive: 1.10,
};

const ALERT_ORBIT = {
  BASE_RADIUS: 90,
  SWING:       18,
};

const TELEPORT = {
  INTERVAL_MIN:       5,
  INTERVAL_MAX:       10,
  CATCH_BLOCK_DIST:   24,
  ROOM_INSET:         8,
  PICK_ATTEMPTS:      32,
  NEAR_PLAYER_MIN:    48,
  NEAR_PLAYER_MAX:    88,
  MIN_RELOC_DIST:     100,
  SLOWDOWN_DURATION:  0.45,
  SLOWDOWN_FACTOR:    0.35,
};

const AGGRESSION_DECAY_RATE = 1.5;

/** Data-driven presets — pass into constructor via behaviorProfile. */
export const CAT_PROFILES = {
  /** Cat A: baseline thresholds/speed; slower aggression decay. */
  HUNTER: {
    id: 'hunter',
    thresholdMods: {},
    speedMods: {},
    orbitRadiusMod: 1.0,
    aggressionDecayMod: 0.55,
    enableTeleport: false,
  },
  /** Cat B: hunts sooner, slightly slower chase, wider alert orbit. */
  STALKER: {
    id: 'stalker',
    thresholdMods: { HUNT_START: -15 },
    speedMods: { HUNT: 0.88 },
    orbitRadiusMod: 1.45,
    aggressionDecayMod: 1.0,
    enableTeleport: false,
  },
};

/** Levels that spawn multiple cats with teleport enabled. */
export const MULTI_CAT_LEVELS = new Set([3, 4]);

/** How many cats to spawn per level (1 on 1–2, 2 on 3, 3 on 4). */
export function catCountForLevel(level) {
  if (level >= 4) return 3;
  if (MULTI_CAT_LEVELS.has(level)) return 2;
  return 1;
}

/**
 * Build a behaviorProfile for a given level + role.
 * Levels 1–2: single cat, no teleport. Level 3: multi-cat teleport enabled.
 * Level 4: only the designated teleporter can teleport.
 */
export function profileForLevel(level, role = 'hunter', enableTeleport = true) {
  const base = role === 'stalker' ? CAT_PROFILES.STALKER : CAT_PROFILES.HUNTER;
  if (!MULTI_CAT_LEVELS.has(level)) {
    return { ...base, enableTeleport: false };
  }
  return { ...base, enableTeleport };
}

const MAX_STEP_PX = 8;

export class CatAI {
  /**
   * @param {object} scene
   * @param {{ x: number, y: number }} startPos
   * @param {number} mapWidth
   * @param {number} mapHeight
   * @param {object|null} collisionMap
   * @param {object} [options]
   * @param {string} [options.catId]              - stable id for serialize/broadcast
   * @param {object} [options.behaviorProfile]    - thresholdMods, speedMods, orbitRadiusMod, etc.
   * @param {string|null} [options.preferredPlayerId]
   * @param {{ key: string, x: number, y: number, w: number, h: number }[]} [options.rooms]
   */
  constructor(scene, startPos, mapWidth, mapHeight, collisionMap = null, options = {}) {
    this.scene     = scene;
    this.x         = startPos.x;
    this.y         = startPos.y;
    this.mapWidth  = mapWidth;
    this.mapHeight = mapHeight;

    this.catId = options.catId ?? 'cat';
    this._profile = { ...CAT_PROFILES.HUNTER, ...(options.behaviorProfile ?? {}) };
    this._rooms = options.rooms ?? null;

    this.state      = CAT_STATES.ASLEEP;
    this.aggression = 0;
    this.speed      = SPEED.ASLEEP;

    this.awake = false;
    this._graceDuration = 10;
    this._sleepElapsed = 0;
    this._graceRemaining = this._graceDuration;

    this.pendingTasks = new Set();
    this._collisionMap = collisionMap;
    this._path = [];
    this._pathGoal = null;

    this._roamTarget = null;
    this._roamTimer = 0;
    this._pauseTimer = 0;

    this._preferredPlayerId = options.preferredPlayerId ?? null;
    this._detourTarget = null;
    this._detourTimer = 0;

    this._teleportTimer = this._rollTeleportInterval();
    this._teleportEnabled = !!this._profile.enableTeleport;
    this._teleportSlowdownTimer = 0;

    this._listeners = {};
    this._elapsed = 0;
    this._snapToWalkable();
  }

  update(delta, players) {
    delta = Math.min(delta, 50); // cap to 50ms per cat tick to prevent teleporting
    const dt = delta / 1000;
    this._elapsed += dt;

    if (!this.awake) {
      this._sleepElapsed += dt;
      this._graceRemaining = Math.max(0, this._graceDuration - this._sleepElapsed);
      if (this._sleepElapsed >= this._graceDuration) {
        this.wake('timer');
      }
    }

    this._tickAggression(dt);
    this._tickTeleportSlowdown(dt);
    this._updateState();
    if (this.awake) this._maybeTeleport(dt, players);
    this._move(dt, players);
  }

  reset() {
    this.awake = false;
    this._sleepElapsed = 0;
    this._graceRemaining = this._graceDuration;
    this.state = CAT_STATES.ASLEEP;
    this.speed = SPEED.ASLEEP;
    this._path = [];
    this._pathGoal = null;
    this._roamTarget = null;
    this._roamTimer = 0;
    this._pauseTimer = 0;
    this._preferredPlayerId = null;
    this._detourTarget = null;
    this._detourTimer = 0;
    this._teleportTimer = this._rollTeleportInterval();
    this._teleportSlowdownTimer = 0;
    this.aggression = 0;
    this.pendingTasks.clear();
  }

  /** Assign a preferred player target (used by game layer for multi-cat setup). */
  setPreferredPlayerId(playerId) {
    this._preferredPlayerId = playerId ?? null;
  }

  onClueCollected(playerId, clueId) {
    this._preferredPlayerId = playerId;
    this._increaseAggression(12);
    this.wake('clue');
    this._emit('clue_collected', { catId: this.catId, playerId, clueId, aggression: this.aggression });
  }

  neglectTask(task) {
    if (TASK_NEGLECT_RATE[task] === undefined) return;
    this.pendingTasks.add(task);
    this._emit('task_neglected', { catId: this.catId, task, aggression: this.aggression });
  }

  completeTask(task) {
    if (!this.pendingTasks.has(task)) return;
    this.pendingTasks.delete(task);

    const reduction = { FEED: 20, TOY: 15, COMFORT: 30 }[task] ?? 10;
    this.aggression = Math.max(0, this.aggression - reduction);
    this._emit('task_completed', { catId: this.catId, task, aggression: this.aggression });
  }

  calm(amount = 15) {
    this.aggression = Math.max(0, this.aggression - amount);
    this._emit('calmed', { catId: this.catId, aggression: this.aggression });
  }

  wake(reason = 'timer') {
    if (this.awake) return;
    this.awake = true;
    this._graceRemaining = 0;
    this.state = this.aggression >= this._threshold('ALERT_START') ? CAT_STATES.ALERT : CAT_STATES.ROAM;
    this.speed = this._speedForState(this.state);
    this._roamTarget = null;
    this._pauseTimer = 0;
    this._emit('cat_awoke', {
      catId: this.catId,
      reason,
      graceRemainingMs: 0,
      aggression: this.aggression,
      state: this.state,
      mood: this.mood,
    });
    this._emit('state_changed', {
      catId: this.catId,
      from: CAT_STATES.ASLEEP,
      to: this.state,
      aggression: this.aggression,
      reason,
      mood: this.mood,
    });
  }

  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
    return this;
  }

  serialize() {
    return {
      catId: this.catId,
      profileId: this._profile.id ?? this.catId,
      x: Math.round(this.x),
      y: Math.round(this.y),
      state: this.state,
      mood: this.mood,
      aggression: Math.round(this.aggression),
      ignoredTasks: [...this.pendingTasks],
      graceRemainingMs: Math.round(this._graceRemaining * 1000),
    };
  }

  get mood() {
    if (!this.awake) return 'calm';
    if (this.state === CAT_STATES.HUNT) return 'aggressive';
    if (this.state === CAT_STATES.ALERT) return 'warning';
    return 'calm';
  }

  /**
   * Pick walkable spawn positions in distinct rooms when possible.
   * @param {{ key: string, x: number, y: number, w: number, h: number }[]} rooms
   * @param {object|null} collisionMap
   * @param {number} count
   * @returns {{ x: number, y: number }[]}
   */
  static pickDistinctRoomSpawns(rooms, collisionMap, count = 2) {
    if (!rooms || rooms.length === 0) return [];
    const shuffled = [...rooms].sort(() => Math.random() - 0.5);
    const picks = [];
    const usedKeys = new Set();

    for (const room of shuffled) {
      if (picks.length >= count) break;
      if (usedKeys.has(room.key)) continue;
      const pos = CatAI._randomWalkableInRoom(room, collisionMap);
      if (pos) {
        picks.push(pos);
        usedKeys.add(room.key);
      }
    }

    while (picks.length < count) {
      const room = shuffled[picks.length % shuffled.length];
      const pos = CatAI._randomWalkableInRoom(room, collisionMap);
      if (pos) picks.push(pos);
      else break;
    }

    return picks;
  }

  /**
   * Spread preferred player targets across cats so they don't all chase one player.
   * @param {CatAI[]} cats
   * @param {string[]} playerIds
   */
  static assignPreferredTargets(cats, playerIds) {
    if (!playerIds || playerIds.length === 0) return;
    const shuffled = [...playerIds].sort(() => Math.random() - 0.5);
    cats.forEach((cat, i) => {
      if (!cat._preferredPlayerId) {
        cat._preferredPlayerId = shuffled[i % shuffled.length];
      }
    });
  }

  _threshold(key) {
    const base = THRESHOLD[key];
    const mod = this._profile.thresholdMods?.[key] ?? 0;
    return base + mod;
  }

  _speedForState(state) {
    const base = SPEED[state];
    const mod = this._profile.speedMods?.[state] ?? 1;
    return base * mod;
  }

  _tickAggression(dt) {
    for (const task of this.pendingTasks) {
      this._increaseAggression(TASK_NEGLECT_RATE[task] * dt);
    }
    if (this.pendingTasks.size === 0 && this.state !== CAT_STATES.HUNT) {
      const decayMod = this._profile.aggressionDecayMod ?? 1;
      this.aggression = Math.max(0, this.aggression - AGGRESSION_DECAY_RATE * decayMod * dt);
    }
  }

  _increaseAggression(amount) {
    this.aggression = Math.min(100, this.aggression + amount);
  }

  _updateState() {
    if (!this.awake) return;
    const prev = this.state;
    switch (this.state) {
      case CAT_STATES.IDLE:
        this.state = CAT_STATES.ROAM;
        break;
      case CAT_STATES.ROAM:
        if (this.aggression >= this._threshold('ALERT_START')) this.state = CAT_STATES.ALERT;
        break;
      case CAT_STATES.ALERT:
        if (this.aggression >= this._threshold('HUNT_START')) this.state = CAT_STATES.HUNT;
        else if (this.aggression <= this._threshold('ALERT_END')) this.state = CAT_STATES.ROAM;
        break;
      case CAT_STATES.HUNT:
        if (this.aggression <= this._threshold('HUNT_END')) this.state = CAT_STATES.ALERT;
        break;
    }
    if (this.state !== prev) {
      this.speed = this._speedForState(this.state);
      this._roamTarget = null;
      this._detourTarget = null;
      this._pauseTimer = 0;
      this._detourTimer = 0;
      this._emit('state_changed', {
        catId: this.catId,
        from: prev,
        to: this.state,
        aggression: this.aggression,
        mood: this.mood,
      });
    }
  }

  _maybeTeleport(dt, players) {
    if (!this._teleportEnabled || !this.awake) return;
    if (this._pauseTimer > 0) return;

    this._teleportTimer -= dt;
    if (this._teleportTimer > 0) return;

    const targetPlayer = this._preferredPlayer(players) || this._nearestPlayer(players);
    if (
      this.state === CAT_STATES.HUNT &&
      targetPlayer &&
      this._dist(targetPlayer) < TELEPORT.CATCH_BLOCK_DIST
    ) {
      this._teleportTimer = 0.5;
      return;
    }

    const destination = this._pickTeleportDestination(players);
    this._teleportTimer = this._rollTeleportInterval();
    if (!destination) return;

    const from = { x: this.x, y: this.y };
    this.x = destination.x;
    this.y = destination.y;
    this._snapToWalkable();
    this._path = [];
    this._pathGoal = null;
    this._roamTarget = null;
    this._detourTarget = null;
    this._pauseTimer = 0.35;
    this._triggerTeleportSlowdown();

    this._emit('cat_teleported', {
      catId: this.catId,
      from,
      to: { x: this.x, y: this.y },
      state: this.state,
      aggression: this.aggression,
    });
  }

  _rollTeleportInterval() {
    return TELEPORT.INTERVAL_MIN + Math.random() * (TELEPORT.INTERVAL_MAX - TELEPORT.INTERVAL_MIN);
  }

  _triggerTeleportSlowdown(duration = TELEPORT.SLOWDOWN_DURATION) {
    this._teleportSlowdownTimer = Math.max(this._teleportSlowdownTimer, duration);
  }

  _tickTeleportSlowdown(dt) {
    if (this._teleportSlowdownTimer > 0) {
      this._teleportSlowdownTimer = Math.max(0, this._teleportSlowdownTimer - dt);
    }
  }

  _effectiveSpeed() {
    if (this._teleportSlowdownTimer > 0) {
      return this.speed * TELEPORT.SLOWDOWN_FACTOR;
    }
    return this.speed;
  }

  _currentRoomKey() {
    if (!this._rooms) return null;
    for (const room of this._rooms) {
      if (
        this.x >= room.x && this.x <= room.x + room.w &&
        this.y >= room.y && this.y <= room.y + room.h
      ) {
        return room.key;
      }
    }
    return null;
  }

  _pickTeleportDestination(players) {
    const targetPlayer = this._preferredPlayer(players) || this._nearestPlayer(players);
    if (!targetPlayer) return null;

    for (let attempt = 0; attempt < TELEPORT.PICK_ATTEMPTS; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const offset = TELEPORT.NEAR_PLAYER_MIN +
        Math.random() * (TELEPORT.NEAR_PLAYER_MAX - TELEPORT.NEAR_PLAYER_MIN);
      const x = targetPlayer.x + Math.cos(angle) * offset;
      const y = targetPlayer.y + Math.sin(angle) * offset;

      if (this._collisionMap && !this._collisionMap.isWalkable(x, y)) continue;
      if (this._distXY(this.x, this.y, x, y) < TELEPORT.MIN_RELOC_DIST) continue;
      if (this._distXY(x, y, targetPlayer.x, targetPlayer.y) < TELEPORT.CATCH_BLOCK_DIST) continue;

      return { x, y };
    }

    return null;
  }

  static _randomWalkableInRoom(room, collisionMap) {
    const inset = TELEPORT.ROOM_INSET;
    for (let i = 0; i < TELEPORT.PICK_ATTEMPTS; i++) {
      const x = room.x + inset + Math.random() * Math.max(1, room.w - inset * 2);
      const y = room.y + inset + Math.random() * Math.max(1, room.h - inset * 2);
      if (!collisionMap || collisionMap.isWalkable(x, y)) return { x, y };
    }
    return {
      x: room.x + room.w / 2,
      y: room.y + room.h / 2,
    };
  }

  static _randomWalkableOnMap(collisionMap, mapWidth, mapHeight) {
    for (let i = 0; i < TELEPORT.PICK_ATTEMPTS; i++) {
      const x = 20 + Math.random() * (mapWidth - 40);
      const y = 20 + Math.random() * (mapHeight - 40);
      if (collisionMap.isWalkable(x, y)) return { x, y };
    }
    return null;
  }

  _move(dt, players) {
    switch (this.state) {
      case CAT_STATES.ASLEEP:
      case CAT_STATES.IDLE:
        break;
      case CAT_STATES.ROAM:
        this._updateRoam(dt);
        break;
      case CAT_STATES.ALERT:
        this._updateAlert(dt, players);
        break;
      case CAT_STATES.HUNT:
        this._updateHunt(dt, players);
        break;
    }
    this._clampPosition();
  }

  _updateRoam(dt) {
    if (this._pauseTimer > 0) {
      this._pauseTimer -= dt;
      return;
    }
    this._roamTimer -= dt;
    if (!this._roamTarget || this._roamTimer <= 0 || this._reachedTarget(this._roamTarget)) {
      if (this._roamTarget && this._reachedTarget(this._roamTarget)) {
        this._pauseTimer = 1.5 + Math.random() * 2.5;
      }
      this._pickRoamTarget();
    }
    this._stepToward(this._roamTarget, dt, 0.15);
  }

  _updateAlert(dt, players) {
    if (this._pauseTimer > 0) {
      this._pauseTimer -= dt;
      return;
    }

    const targetPlayer = this._preferredPlayer(players) || this._nearestPlayer(players);
    if (!targetPlayer) return;
    const dist = this._dist(targetPlayer);
    if (dist < 120) {
      this._pauseTimer = 0.2;
      return;
    }

    const offset = this._alertOffset();
    const destination = { x: targetPlayer.x + offset.x, y: targetPlayer.y + offset.y };
    if (this._collisionMap) {
      this._followPathOrTarget(destination, dt);
    } else {
      this._stepToward(destination, dt);
    }
  }

  _updateHunt(dt, players) {
    if (this._pauseTimer > 0) {
      this._pauseTimer -= dt;
      return;
    }

    const targetPlayer = this._preferredPlayer(players) || this._nearestPlayer(players);
    if (!targetPlayer) return;
    this._detourTimer -= dt;
    if (this._detourTimer <= 0 || !this._detourTarget || this._reachedTarget(this._detourTarget)) {
      if (Math.random() < 0.35) {
        this._detourTarget = this._randomDetourNear(targetPlayer);
      } else {
        this._detourTarget = null;
      }
      this._detourTimer = 0.6 + Math.random() * 0.8;
    }
    const destination = this._detourTarget || targetPlayer;
    if (this._collisionMap) {
      this._followPathOrTarget(destination, dt, 0.1);
    } else {
      this._stepToward(destination, dt, 0.1);
    }
    if (this._dist(targetPlayer) < TELEPORT.CATCH_BLOCK_DIST) {
      this._emit('player_caught', { catId: this.catId, playerId: targetPlayer.id });
    }
  }

  _followPathOrTarget(target, dt, slowdown = 0) {
    if (!target) return;
    if (!this._collisionMap) {
      this._stepToward(target, dt, slowdown);
      return;
    }

    const goal = this._nearestWalkable(target.x, target.y);
    if (!goal) return;

    const goalChanged = !this._pathGoal ||
      this._distXY(goal.x, goal.y, this._pathGoal.x, this._pathGoal.y) > 64;
    if (goalChanged || this._path.length === 0) {
      this._path = this._collisionMap.findPath(this.x, this.y, goal.x, goal.y);
      this._pathGoal = { x: goal.x, y: goal.y };
    }

    if (this._path.length > 0) {
      const waypoint = this._path[0];
      this._stepToward(waypoint, dt, slowdown);
      if (this._distXY(this.x, this.y, waypoint.x, waypoint.y) < 10) {
        this._path.shift();
      }
    }
  }

  _distXY(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }

  _stepToward(target, dt, slowdown = 0) {
    if (!target) return;
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;

    const moodMult = MOOD_SPEED_MULT[this.mood] ?? 1;
    const move = Math.min(this._effectiveSpeed() * dt * moodMult, MAX_STEP_PX, len);
    const toX = this.x + (dx / len) * move;
    const toY = this.y + (dy / len) * move;

    if (this._collisionMap) {
      const resolved = this._collisionMap.resolveMove(this.x, this.y, toX, toY);
      this.x = resolved.x;
      this.y = resolved.y;
    } else {
      this.x = toX;
      this.y = toY;
    }

    this._clampPosition();
  }

  _pickRoamTarget() {
    if (this._rooms?.length) {
      const room = this._rooms[Math.floor(Math.random() * this._rooms.length)];
      const pos = CatAI._randomWalkableInRoom(room, this._collisionMap);
      if (pos) {
        this._roamTarget = pos;
        this._roamTimer = 3 + Math.random() * 4;
        return;
      }
    }
    if (this._collisionMap) {
      const pos = CatAI._randomWalkableOnMap(this._collisionMap, this.mapWidth, this.mapHeight);
      if (pos) {
        this._roamTarget = pos;
        this._roamTimer = 3 + Math.random() * 4;
        return;
      }
    }
    this._roamTarget = {
      x: 40 + Math.random() * (this.mapWidth - 80),
      y: 40 + Math.random() * (this.mapHeight - 80),
    };
    this._roamTimer = 3 + Math.random() * 4;
  }

  _nearestWalkable(x, y) {
    if (!this._collisionMap) return { x, y };
    if (this._collisionMap.isWalkable(x, y)) return { x, y };
    const tileW = this._collisionMap.tileW;
    const tileH = this._collisionMap.tileH;
    for (let ring = 1; ring <= 6; ring++) {
      for (let dx = -ring; dx <= ring; dx++) {
        for (let dy = -ring; dy <= ring; dy++) {
          const px = x + dx * tileW;
          const py = y + dy * tileH;
          if (this._collisionMap.isWalkable(px, py)) return { x: px, y: py };
        }
      }
    }
    return null;
  }

  _snapToWalkable() {
    const snapped = this._nearestWalkable(this.x, this.y);
    if (snapped) {
      this.x = snapped.x;
      this.y = snapped.y;
    }
  }

  _alertOffset() {
    const orbitMod = this._profile.orbitRadiusMod ?? 1;
    const angle = (this._elapsed * 2) % (Math.PI * 2);
    const radius = (ALERT_ORBIT.BASE_RADIUS + Math.sin(this._elapsed * 1.3) * ALERT_ORBIT.SWING) * orbitMod;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  }

  _randomDetourNear(player) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 30 + Math.random() * 30;
    const raw = {
      x: player.x + Math.cos(angle) * radius,
      y: player.y + Math.sin(angle) * radius,
    };
    return this._nearestWalkable(raw.x, raw.y) ?? raw;
  }

  _reachedTarget(t) {
    return t && this._dist(t) < 10;
  }

  _preferredPlayer(players) {
    if (!this._preferredPlayerId) return null;
    return players.find(p => p.id === this._preferredPlayerId) || null;
  }

  _nearestPlayer(players) {
    if (!players || players.length === 0) return null;
    return players.reduce((best, p) =>
      best === null || this._dist(p) < this._dist(best) ? p : best, null);
  }

  _dist(pos) {
    const dx = pos.x - this.x;
    const dy = pos.y - this.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  _clampPosition() {
    this.x = Math.max(0, Math.min(this.mapWidth, this.x));
    this.y = Math.max(0, Math.min(this.mapHeight, this.y));
  }

  _emit(event, data) {
    (this._listeners[event] || []).forEach(fn => fn(data));
  }
}
