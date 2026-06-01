/**
 * GameLogic.js
 * ============
 * Ayman's Game Logic for "The Cat in the House"
 *
 * Manages:
 *  - Countdown timer
 *  - Clue collection
 *  - Task scheduling (when does the cat start needing things?)
 *  - Win / lose conditions
 *  - Integration point between CatAI and the rest of the game
 *
 * Designed to be constructed once per game session and ticked each frame.
 * Emits events that Vincent's multiplayer layer (Socket.io) can forward.
 */

import { CatAI, CAT_STATES } from './CatAI.js';

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
   * @param {object} options.catStartPos  - { x, y } world position for the cat
   * @param {number} options.mapWidth
   * @param {number} options.mapHeight
   * @param {object} [options.scene]      - Phaser.Scene (optional; null in tests)
   */
  constructor({ catStartPos, mapWidth, mapHeight, scene = null }) {
    this.mapWidth  = mapWidth;
    this.mapHeight = mapHeight;

    this.gameState  = GAME_STATE.WAITING;
    this.timeLeft   = GAME_DURATION_SECONDS;   // seconds
    this.cluesFound = 0;

    // Players map: id → { id, x, y, alive }
    this.players = new Map();

    // Cat
    this.cat = new CatAI(scene, catStartPos, mapWidth, mapHeight);
    this.cat
      .on('state_changed', d  => this._emit('cat_state_changed', d))
      .on('player_caught', d  => this._onPlayerCaught(d))
      .on('task_completed', d => this._emit('task_completed', d))
      .on('task_neglected', d => this._emit('task_neglected', d));

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

    this._emit('game_started', { clueLocations: this.clueLocations });
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

    // Tick cat AI
    const alivePlayers = [...this.players.values()].filter(p => p.alive);
    this.cat.update(delta, alivePlayers);

    // Broadcast periodic sync
    if (Math.floor(this._elapsed * 10) % 2 === 0) {
      this._emit('tick', {
        timeLeft:   Math.ceil(this.timeLeft),
        cluesFound: this.cluesFound,
        cat:        this.cat.serialize(),
      });
    }
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

    if (this.cluesFound >= CLUES_NEEDED_TO_ESCAPE) {
      this._emit('all_clues_found', {});
    }
  }

  /** Player completes a cat task (feeding, toy, comfort). */
  completeCatTask(playerId, task) {
    if (this.gameState !== GAME_STATE.PLAYING) return;
    this.cat.completeTask(task);
    this._emit('player_completed_task', { playerId, task });
  }

  /** Player reaches the attic exit with all clues collected. */
  attemptEscape(playerId) {
    if (this.gameState !== GAME_STATE.PLAYING) return;
    if (this.cluesFound < CLUES_NEEDED_TO_ESCAPE) {
      this._emit('escape_failed', { playerId, reason: 'missing_clues' });
      return;
    }
    if (this.cat.state === CAT_STATES.HUNT) {
      this._emit('escape_failed', { playerId, reason: 'cat_hunting' });
      return;
    }
    this._endGame(GAME_STATE.ESCAPED);
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

  _checkTaskSchedule() {
    while (
      this._taskSchedule.length > 0 &&
      this._elapsed >= this._taskSchedule[0].time
    ) {
      const { task, room } = this._taskSchedule.shift();
      this.cat.neglectTask(task);
      this._emit('task_started', { task, room });
    }
  }

  _onPlayerCaught({ playerId }) {
    const p = this.players.get(playerId);
    if (p) p.alive = false;

    this._emit('player_caught', { playerId });

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
