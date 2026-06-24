/**
 * GameLogic.js
 * ============
 Game Logic for "The Cat in the House"
 *
 * Manages:
 *  - Countdown timer
 *  - Clue collection
 *  - Win / lose conditions
 *  - Integration point between CatAI and the rest of the game
 *
 * Designed to be constructed once per game session and ticked each frame.
 * Emits events that Vincent's multiplayer layer (Socket.io) can forward.
 *
 * Levels 1–2: one cat, no teleport.
 * Levels 3–4: two cats (Hunter + Stalker), teleport enabled — tick/serialize via `cats`.
 */

import {
  CatAI,
  CAT_STATES,
  MULTI_CAT_LEVELS,
  profileForLevel,
} from './CatAI.js';

export const GAME_STATE = {
  WAITING:  'WAITING',   // lobby – not yet started
  PLAYING:  'PLAYING',
  ESCAPED:  'ESCAPED',   // players win
  CAUGHT:   'CAUGHT',    // cat caught a player → game over
  TIMEOUT:  'TIMEOUT',   // timer hit zero
};

// Rooms in the haunted house – used for clue placement logic
export const ROOMS = ['hallway', 'bedroom', 'basement', 'attic'];

// Task schedule: each entry fires (in seconds) after game start
const TASK_SCHEDULE = [
  { time: 30,  task: 'FEED',    room: 'hallway' },
  { time: 70,  task: 'TOY',     room: 'bedroom' },
  { time: 110, task: 'COMFORT', room: 'basement' },
  { time: 150, task: 'FEED',    room: 'attic' },
  { time: 200, task: 'COMFORT', room: 'hallway' },
];

const CLUES_NEEDED_TO_ESCAPE = 4;
const GAME_DURATION_SECONDS  = 300;  // 5 minutes

export class GameLogic {
  /**
   * @param {object} options
   * @param {object} options.catStartPos  - { x, y } fallback spawn for single-cat levels
   * @param {number} options.mapWidth
   * @param {number} options.mapHeight
   * @param {number} [options.level=1]    - floor/level (1–4); 3–4 spawn two cats
   * @param {object} [options.scene]        - Phaser.Scene (optional; null in tests)
   * @param {object} [options.collisionMap] - optional collision map for the cats
   * @param {{ key: string, x: number, y: number, w: number, h: number }[]} [options.rooms]
   *   - room bounds for multi-cat spawn + teleport (pass floor layout rooms on 3–4)
   */
  constructor({
    catStartPos,
    mapWidth,
    mapHeight,
    level = 1,
    scene = null,
    collisionMap = null,
    rooms = null,
  }) {
    this.mapWidth  = mapWidth;
    this.mapHeight = mapHeight;
    this.level     = level;
    this.rooms     = rooms;

    this.gameState  = GAME_STATE.WAITING;
    this.timeLeft   = GAME_DURATION_SECONDS;   // seconds
    this.cluesFound = 0;

    // Players map: id → { id, x, y, alive }
    this.players = new Map();

    this.cats = this._spawnCats(scene, catStartPos, collisionMap);
    /** @deprecated Use `cats` — kept for single-cat call sites (levels 1–2). */
    this.cat = this.cats[0];

    // Pending task schedule (shallow copy so we can splice)
    this._taskSchedule = [...TASK_SCHEDULE];
    this._elapsed      = 0;   // seconds since game start

    // Listeners
    this._listeners = {};

    // Clue placement (randomised at start)
    this.clueLocations = [];
  }

  // ─────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────

  /** Call when all players have joined and the lobby starts. */
  startGame() {
    if (this.gameState !== GAME_STATE.WAITING) return;
    this.gameState     = GAME_STATE.PLAYING;
    this._elapsed      = 0;
    this.timeLeft      = GAME_DURATION_SECONDS;
    this.cluesFound    = 0;
    this.clueLocations = this._placeClues();

    for (const cat of this.cats) cat.reset();
    CatAI.assignPreferredTargets(this.cats, [...this.players.keys()]);

    this._emit('game_started', {
      level: this.level,
      clueLocations: this.clueLocations,
      cats: this._serializeCats(),
      cat:  this.cat.serialize(),
    });
  }

  /** Main update – call from Phaser scene update() or a setInterval. */
  update(delta) {
    if (this.gameState !== GAME_STATE.PLAYING) return;

    const dt = delta / 1000;
    this._elapsed += dt;

    // Countdown timer
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    if (this.timeLeft <= 0) {
      this._endGame(GAME_STATE.TIMEOUT);
      return;
    }

    // Fire scheduled tasks
    this._checkTaskSchedule();

    // Tick all cat AI instances
    const alivePlayers = [...this.players.values()].filter(p => p.alive);
    const safeDelta = Math.min(delta, 50);
    for (const cat of this.cats) {
      cat.update(safeDelta, alivePlayers);
    }

    // Broadcast frame sync for clients and server sync layers
    this._emit('tick', {
      level:      this.level,
      timeLeftMs: Math.max(0, Math.round(this.timeLeft * 1000)),
      cluesFound: this.cluesFound,
      cats:       this._serializeCats(),
      cat:        this.cat.serialize(),
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // Player actions  (called by Jose's frontend or Vincent's socket handler)
  // ─────────────────────────────────────────────────────────────────

  /** Register a player (called when they connect). */
  addPlayer(id, startPos) {
    this.players.set(id, { id, x: startPos.x, y: startPos.y, alive: true });
  }

  /** Sync a player position (received from client). */
  updatePlayerPosition(id, x, y) {
    const p = this.players.get(id);
    if (p) { p.x = x; p.y = y; }
  }

  /** Player picks up a clue. */
  collectClue(playerId, clueId) {
    if (this.gameState !== GAME_STATE.PLAYING) return;

    const idx = this.clueLocations.findIndex(c => c.id === clueId && !c.collected);
    if (idx === -1) return;

    this.clueLocations[idx].collected = true;
    this.cluesFound++;

    this._emit('clue_collected', {
      playerId,
      clueId,
      cluesFound: this.cluesFound,
      cluesNeeded: CLUES_NEEDED_TO_ESCAPE,
    });

    for (const cat of this.cats) {
      cat.onClueCollected(playerId, clueId);
    }

    if (this.cluesFound >= CLUES_NEEDED_TO_ESCAPE) {
      this._emit('all_clues_found', {});
    }
  }

  /** Player completes a cat task (feeding, toy, comfort). */
  completeCatTask(playerId, task) {
    if (this.gameState !== GAME_STATE.PLAYING) return;
    for (const cat of this.cats) cat.completeTask(task);
    this._emit('player_completed_task', { playerId, task });
  }

  /** Player reaches the attic exit with all clues collected. */
  attemptEscape(playerId) {
    if (this.gameState !== GAME_STATE.PLAYING) return;
    if (this.cluesFound < CLUES_NEEDED_TO_ESCAPE) {
      this._emit('escape_failed', { playerId, reason: 'missing_clues' });
      return;
    }
    if (this.cats.some(c => c.state === CAT_STATES.HUNT)) {
      this._emit('escape_failed', { playerId, reason: 'cat_hunting' });
      return;
    }
    this._endGame(GAME_STATE.ESCAPED);
  }

  setCollisionMap(collisionMap) {
    for (const cat of this.cats) {
      cat._collisionMap = collisionMap;
      cat._path = [];
      cat._pathGoal = null;
    }
  }

  /** Update room bounds used for multi-cat spawn/teleport (e.g. after floor layout loads). */
  setRooms(rooms) {
    this.rooms = rooms;
    for (const cat of this.cats) cat._rooms = rooms;
  }

  /** Event subscription (mirrors CatAI.on pattern). */
  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
    return this;
  }

  // ─────────────────────────────────────────────────────────────────
  // Private
  // ─────────────────────────────────────────────────────────────────

  _spawnCats(scene, catStartPos, collisionMap) {
    const cats = [];

    if (MULTI_CAT_LEVELS.has(this.level)) {
      const spawns = CatAI.pickDistinctRoomSpawns(this.rooms, collisionMap, 2);
      const spawnA = spawns[0] ?? catStartPos;
      const spawnB = spawns[1] ?? { x: catStartPos.x + 48, y: catStartPos.y };

      cats.push(this._createCat(scene, spawnA, collisionMap, {
        catId: 'cat_a',
        behaviorProfile: profileForLevel(this.level, 'hunter'),
      }));
      cats.push(this._createCat(scene, spawnB, collisionMap, {
        catId: 'cat_b',
        behaviorProfile: profileForLevel(this.level, 'stalker'),
      }));
    } else {
      cats.push(this._createCat(scene, catStartPos, collisionMap, {
        catId: 'cat',
        behaviorProfile: profileForLevel(this.level, 'hunter'),
      }));
    }

    return cats;
  }

  _createCat(scene, startPos, collisionMap, options) {
    const cat = new CatAI(
      scene,
      startPos,
      this.mapWidth,
      this.mapHeight,
      collisionMap,
      { ...options, rooms: this.rooms },
    );
    this._wireCatEvents(cat);
    return cat;
  }

  _wireCatEvents(cat) {
    cat
      .on('state_changed', d  => this._emit('cat_state_changed', d))
      .on('cat_awoke', d      => this._emit('cat_awoke', d))
      .on('cat_teleported', d => this._emit('cat_teleported', d))
      .on('player_caught', d  => this._onPlayerCaught(d))
      .on('task_completed', d => this._emit('task_completed', d))
      .on('task_neglected', d => this._emit('task_neglected', d));
  }

  _serializeCats() {
    const out = {};
    for (const cat of this.cats) {
      out[cat.catId] = cat.serialize();
    }
    return out;
  }

  _checkTaskSchedule() {
    while (
      this._taskSchedule.length > 0 &&
      this._elapsed >= this._taskSchedule[0].time
    ) {
      const { task, room } = this._taskSchedule.shift();
      for (const cat of this.cats) cat.neglectTask(task);
      this._emit('task_started', { task, room });
    }
  }

  _onPlayerCaught({ playerId, catId }) {
    const p = this.players.get(playerId);
    if (p) p.alive = false;

    this._emit('player_caught', { playerId, catId });

    // Game over if all players are caught
    const anyAlive = [...this.players.values()].some(p => p.alive);
    if (!anyAlive) this._endGame(GAME_STATE.CAUGHT);
  }

  _endGame(reason) {
    this.gameState = reason;
    this._emit('game_over', {
      reason,
      timeLeft:   Math.ceil(this.timeLeft),
      cluesFound: this.cluesFound,
    });
  }

  _placeClues() {
    return ROOMS.map((room, i) => ({
      id:        `clue_${i}`,
      room,
      collected: false,
      // Rough world positions per room – scene can override with real tile coords
      x: 80 + i * Math.floor(this.mapWidth  / 4),
      y: 80 + i * Math.floor(this.mapHeight / 4),
    }));
  }

  _emit(event, data) {
    (this._listeners[event] || []).forEach(fn => fn(data));
  }
}
