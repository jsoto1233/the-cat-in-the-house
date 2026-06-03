/**
 * CatAI.js
 * =========
 * Ayman's Cat Behavior System for "The Cat in the House"
 *
 * State Machine:
 *   ASLEEP ──► ROAM ──► ALERT ──► HUNT
 * This machine is driven by mood, clues, tasks, and grace behavior.
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
  ROAM:   60,
  ALERT:  90,
  HUNT:   160,
};

export class CatAI {
  constructor(scene, startPos, mapWidth, mapHeight) {
    this.scene     = scene;
    this.x         = startPos.x;
    this.y         = startPos.y;
    this.mapWidth  = mapWidth;
    this.mapHeight = mapHeight;

    this.state      = CAT_STATES.ASLEEP;
    this.aggression = 0;
    this.speed      = SPEED.ASLEEP;

    this.awake = false;
    this._graceDuration = 10;
    this._sleepElapsed = 0;
    this._graceRemaining = this._graceDuration;

    this.pendingTasks = new Set();

    this._roamTarget = null;
    this._roamTimer = 0;
    this._pauseTimer = 0;

    this._preferredPlayerId = null;
    this._detourTarget = null;
    this._detourTimer = 0;

    this._listeners = {};
    this._elapsed = 0;
  }

  update(delta, players) {
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
    this._updateState();
    this._move(dt, players);
  }

  reset() {
    this.awake = false;
    this._sleepElapsed = 0;
    this._graceRemaining = this._graceDuration;
    this.state = CAT_STATES.ASLEEP;
    this.speed = SPEED.ASLEEP;
    this._roamTarget = null;
    this._roamTimer = 0;
    this._pauseTimer = 0;
    this._preferredPlayerId = null;
    this._detourTarget = null;
    this._detourTimer = 0;
    this.aggression = 0;
    this.pendingTasks.clear();
  }

  onClueCollected(playerId, clueId) {
    this._preferredPlayerId = playerId;
    this._increaseAggression(12);
    this.wake('clue');
    this._emit('clue_collected', { playerId, clueId, aggression: this.aggression });
  }

  neglectTask(task) {
    if (TASK_NEGLECT_RATE[task] === undefined) return;
    this.pendingTasks.add(task);
    this._emit('task_neglected', { task, aggression: this.aggression });
  }

  completeTask(task) {
    if (!this.pendingTasks.has(task)) return;
    this.pendingTasks.delete(task);

    const reduction = { FEED: 20, TOY: 15, COMFORT: 30 }[task] ?? 10;
    this.aggression = Math.max(0, this.aggression - reduction);
    this._emit('task_completed', { task, aggression: this.aggression });
  }

  calm(amount = 15) {
    this.aggression = Math.max(0, this.aggression - amount);
    this._emit('calmed', { aggression: this.aggression });
  }

  wake(reason = 'timer') {
    if (this.awake) return;
    this.awake = true;
    this._graceRemaining = 0;
    this.state = this.aggression >= THRESHOLD.ALERT_START ? CAT_STATES.ALERT : CAT_STATES.ROAM;
    this.speed = SPEED[this.state];
    this._roamTarget = null;
    this._pauseTimer = 0;
    this._emit('cat_awoke', {
      reason,
      graceRemainingMs: 0,
      aggression: this.aggression,
      state: this.state,
      mood: this.mood,
    });
    this._emit('state_changed', {
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

  _tickAggression(dt) {
    for (const task of this.pendingTasks) {
      this._increaseAggression(TASK_NEGLECT_RATE[task] * dt);
    }
    if (this.pendingTasks.size === 0 && this.state !== CAT_STATES.HUNT) {
      this.aggression = Math.max(0, this.aggression - 1.5 * dt);
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
      this._roamTarget = null;
      this._detourTarget = null;
      this._pauseTimer = 0;
      this._detourTimer = 0;
      this._emit('state_changed', { from: prev, to: this.state, aggression: this.aggression, mood: this.mood });
    }
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
    this._stepToward(destination, dt);
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
    this._stepToward(destination, dt, 0.1);
    if (this._dist(targetPlayer) < 24) {
      this._emit('player_caught', { playerId: targetPlayer.id });
    }
  }

  _stepToward(target, dt, slowdown = 0) {
    if (!target) return;
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const move = this.speed * dt * (1 - slowdown);
    this.x += (dx / len) * Math.min(move, len);
    this.y += (dy / len) * Math.min(move, len);
  }

  _pickRoamTarget() {
    this._roamTarget = {
      x: 40 + Math.random() * (this.mapWidth - 80),
      y: 40 + Math.random() * (this.mapHeight - 80),
    };
    this._roamTimer = 3 + Math.random() * 4;
  }

  _alertOffset() {
    const angle = (this._elapsed * 2) % (Math.PI * 2);
    const radius = 90 + Math.sin(this._elapsed * 1.3) * 18;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  }

  _randomDetourNear(player) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 30 + Math.random() * 30;
    return {
      x: player.x + Math.cos(angle) * radius,
      y: player.y + Math.sin(angle) * radius,
    };
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

  _emit(event, data) {
    (this._listeners[event] || []).forEach(fn => fn(data));
  }
}
