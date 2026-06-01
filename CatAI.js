/**
 * CatAI.js
 * =========
 * Ayman's Cat Behavior System for "The Cat in the House"
 *
 * State Machine:
 *   IDLE ──► ROAM ──► ALERT ──► HUNT
 *     ▲        │         │        │
 *     └────────┴─────────┴────────┘  (calm-down / task-completed paths)
 *
 * The cat tracks a global "aggression" score (0–100).
 * Neglecting tasks raises aggression; completing tasks lowers it.
 * State transitions fire automatically based on thresholds.
 */

export const CAT_STATES = {
  IDLE:  'IDLE',   // sitting still, calm
  ROAM:  'ROAM',   // wandering the house on its own path
  ALERT: 'ALERT',  // triggered – hackles up, watching players
  HUNT:  'HUNT',   // aggressive – chasing nearest player
};

// How much aggression each neglected task adds per second
const TASK_NEGLECT_RATE = {
  FEED:    0.8,
  TOY:     0.5,
  COMFORT: 1.2,   // calming the cat is the most urgent
};

// Thresholds for state transitions
const THRESHOLD = {
  ROAM_START:  10,  // aggression >= 10  → leave IDLE
  ALERT_START: 40,  // aggression >= 40  → enter ALERT
  HUNT_START:  70,  // aggression >= 70  → enter HUNT
  ALERT_END:   30,  // aggression <= 30  → leave ALERT back to ROAM
  HUNT_END:    50,  // aggression <= 50  → leave HUNT back to ALERT
};

const SPEED = {
  IDLE:  0,
  ROAM:  60,   // px/s  (Phaser units)
  ALERT: 90,
  HUNT:  160,
};

export class CatAI {
  /**
   * @param {object} scene  - Phaser.Scene reference (passed in at game start)
   * @param {object} startPos - { x, y } tile or world position
   * @param {number} mapWidth  - world width in pixels
   * @param {number} mapHeight - world height in pixels
   */
  constructor(scene, startPos, mapWidth, mapHeight) {
    this.scene     = scene;       // may be null in unit-test / demo mode
    this.x         = startPos.x;
    this.y         = startPos.y;
    this.mapWidth  = mapWidth;
    this.mapHeight = mapHeight;

    this.state      = CAT_STATES.IDLE;
    this.aggression = 0;           // 0 – 100
    this.speed      = SPEED.IDLE;

    // Tasks currently pending (neglected) – keys from TASK_NEGLECT_RATE
    this.pendingTasks = new Set();

    // Roaming target
    this._roamTarget  = null;
    this._roamTimer   = 0;   // seconds until we pick a new roam waypoint

    // Emit events so Vincent's multiplayer layer can broadcast cat state
    this._listeners = {};

    // Internal tick accumulator (seconds)
    this._elapsed = 0;
  }

  // ─────────────────────────────────────────────────────────────────
  // Public API  (called by Game Logic / Phaser scene)
  // ─────────────────────────────────────────────────────────────────

  /** Call this every Phaser update loop. delta is ms. */
  update(delta, players) {
    const dt = delta / 1000;   // convert to seconds
    this._elapsed += dt;

    this._tickAggression(dt);
    this._updateState();
    this._move(dt, players);
  }

  /**
   * Mark a task as neglected (starts draining calm).
   * @param {'FEED'|'TOY'|'COMFORT'} task
   */
  neglectTask(task) {
    if (TASK_NEGLECT_RATE[task] === undefined) return;
    this.pendingTasks.add(task);
    this._emit('task_neglected', { task, aggression: this.aggression });
  }

  /**
   * Player completed a task – removes it and lowers aggression.
   * @param {'FEED'|'TOY'|'COMFORT'} task
   */
  completeTask(task) {
    if (!this.pendingTasks.has(task)) return;
    this.pendingTasks.delete(task);

    const reduction = { FEED: 20, TOY: 15, COMFORT: 30 }[task] ?? 10;
    this.aggression = Math.max(0, this.aggression - reduction);

    this._emit('task_completed', { task, aggression: this.aggression });
  }

  /** Manually calm the cat (e.g. player uses catnip item). */
  calm(amount = 15) {
    this.aggression = Math.max(0, this.aggression - amount);
    this._emit('calmed', { aggression: this.aggression });
  }

  /** Register an event listener. */
  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
    return this;
  }

  /** Returns a plain snapshot – useful for Socket.io broadcast. */
  serialize() {
    return {
      x: Math.round(this.x),
      y: Math.round(this.y),
      state: this.state,
      aggression: Math.round(this.aggression),
      pendingTasks: [...this.pendingTasks],
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────

  _tickAggression(dt) {
    // Each neglected task raises aggression over time
    for (const task of this.pendingTasks) {
      this.aggression = Math.min(100, this.aggression + TASK_NEGLECT_RATE[task] * dt);
    }

    // Natural slow decay when no tasks are pending and not hunting
    if (this.pendingTasks.size === 0 && this.state !== CAT_STATES.HUNT) {
      this.aggression = Math.max(0, this.aggression - 1.5 * dt);
    }
  }

  _updateState() {
    const prev = this.state;

    switch (this.state) {
      case CAT_STATES.IDLE:
        if (this.aggression >= THRESHOLD.ROAM_START) this.state = CAT_STATES.ROAM;
        break;

      case CAT_STATES.ROAM:
        if (this.aggression >= THRESHOLD.ALERT_START) this.state = CAT_STATES.ALERT;
        else if (this.aggression < THRESHOLD.ROAM_START)  this.state = CAT_STATES.IDLE;
        break;

      case CAT_STATES.ALERT:
        if (this.aggression >= THRESHOLD.HUNT_START)  this.state = CAT_STATES.HUNT;
        else if (this.aggression <= THRESHOLD.ALERT_END) this.state = CAT_STATES.ROAM;
        break;

      case CAT_STATES.HUNT:
        if (this.aggression <= THRESHOLD.HUNT_END) this.state = CAT_STATES.ALERT;
        break;
    }

    if (this.state !== prev) {
      this.speed = SPEED[this.state];
      this._roamTarget = null;   // reset movement target on state change
      this._emit('state_changed', { from: prev, to: this.state, aggression: this.aggression });
    }
  }

  _move(dt, players) {
    switch (this.state) {
      case CAT_STATES.IDLE:
        // Stay still – slight swaying handled by Phaser animation in scene
        break;

      case CAT_STATES.ROAM:
        this._roamTimer -= dt;
        if (!this._roamTarget || this._roamTimer <= 0 || this._reachedTarget(this._roamTarget)) {
          this._pickRoamTarget();
        }
        this._stepToward(this._roamTarget, dt);
        break;

      case CAT_STATES.ALERT:
        // Strut slowly toward nearest player but stop when within 120px
        {
          const nearest = this._nearestPlayer(players);
          if (nearest) {
            const dist = this._dist(nearest);
            if (dist > 120) this._stepToward(nearest, dt);
          }
        }
        break;

      case CAT_STATES.HUNT:
        // Chase nearest player relentlessly
        {
          const nearest = this._nearestPlayer(players);
          if (nearest) {
            this._stepToward(nearest, dt);
            // Check catch
            if (this._dist(nearest) < 24) {
              this._emit('player_caught', { playerId: nearest.id });
            }
          }
        }
        break;
    }
  }

  _stepToward(target, dt) {
    if (!target) return;
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const move = this.speed * dt;
    this.x += (dx / len) * Math.min(move, len);
    this.y += (dy / len) * Math.min(move, len);
  }

  _pickRoamTarget() {
    this._roamTarget = {
      x: 40 + Math.random() * (this.mapWidth  - 80),
      y: 40 + Math.random() * (this.mapHeight - 80),
    };
    this._roamTimer = 3 + Math.random() * 4;  // stay at target 3–7 s
  }

  _reachedTarget(t) {
    return t && this._dist(t) < 10;
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

  _emit(event, data) {
    (this._listeners[event] || []).forEach(fn => fn(data));
  }
}
