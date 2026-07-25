/**
 * CollisionMap — thin wrapper around a 2-D walkability grid.
 *
 * @param {number}   tileW      tile width in pixels
 * @param {number}   tileH      tile height in pixels
 * @param {boolean[][]} grid    grid[row][col] — true = walkable
 */
export class CollisionMap {
  constructor(tileW, tileH, grid) {
    this.tileW = tileW;
    this.tileH = tileH;
    this.grid = grid;
    this.rows = grid.length;
    this.cols = grid[0] ? grid[0].length : 0;
  }

  /** Is the world-space point (wx, wy) inside a walkable tile? */
  isWalkable(wx, wy) {
    const { row, col } = this._toTile(wx, wy);
    return this._inBounds(row, col) && this.grid[row][col] === true;
  }

  /**
   * Slide a movement vector so it doesn't enter a wall.
   * Tries the full move; if blocked, tries X-only then Y-only.
   * Returns { x, y } — the resolved destination.
   */
  resolveMove(fromX, fromY, toX, toY) {
    if (this.isWalkable(toX, toY)) {
      return { x: toX, y: toY };
    }

    if (this.isWalkable(toX, fromY)) {
      return { x: toX, y: fromY };
    }

    if (this.isWalkable(fromX, toY)) {
      return { x: fromX, y: toY };
    }

    return { x: fromX, y: fromY };
  }

  /**
   * Return a list of world-space waypoints from start → goal
   * using a simple tile-grid A* search.
   * Returns [] if no path exists (cat stays put that tick).
   */
  findPath(fromX, fromY, goalX, goalY) {
    if (!this.isWalkable(fromX, fromY) || !this.isWalkable(goalX, goalY)) {
      return [];
    }

    const start = this._toTile(fromX, fromY);
    const goal = this._toTile(goalX, goalY);
    if (start.row === goal.row && start.col === goal.col) {
      return [];
    }

    const startKey = this._key(start.row, start.col);
    const goalKey = this._key(goal.row, goal.col);
    const openSet = new Set([startKey]);
    const cameFrom = new Map();
    const gScore = new Map([[startKey, 0]]);
    const fScore = new Map([[startKey, this._heuristic(start, goal)]]);

    while (openSet.size > 0) {
      let currentKey = null;
      let currentF = Infinity;
      for (const key of openSet) {
        const score = fScore.get(key) ?? Infinity;
        if (score < currentF) {
          currentF = score;
          currentKey = key;
        }
      }

      if (currentKey === goalKey) {
        return this._reconstructPath(cameFrom, currentKey);
      }

      openSet.delete(currentKey);
      const current = this._parseKey(currentKey);
      const neighbors = [
        { row: current.row - 1, col: current.col },
        { row: current.row + 1, col: current.col },
        { row: current.row, col: current.col - 1 },
        { row: current.row, col: current.col + 1 },
      ];

      for (const neighbor of neighbors) {
        if (!this._inBounds(neighbor.row, neighbor.col)) continue;
        if (!this.grid[neighbor.row][neighbor.col]) continue;

        const neighborKey = this._key(neighbor.row, neighbor.col);
        const tentativeG = (gScore.get(currentKey) ?? Infinity) + 1;
        if (tentativeG >= (gScore.get(neighborKey) ?? Infinity)) continue;

        cameFrom.set(neighborKey, currentKey);
        gScore.set(neighborKey, tentativeG);
        fScore.set(neighborKey, tentativeG + this._heuristic(neighbor, goal));
        openSet.add(neighborKey);
      }
    }

    return [];
  }

  _toTile(wx, wy) {
    return {
      row: Math.floor(wy / this.tileH),
      col: Math.floor(wx / this.tileW),
    };
  }

  _inBounds(row, col) {
    return row >= 0 && col >= 0 && row < this.rows && col < this.cols;
  }

  _key(row, col) {
    return `${row}:${col}`;
  }

  _parseKey(key) {
    const [row, col] = key.split(':').map(Number);
    return { row, col };
  }

  _heuristic(a, b) {
    return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
  }

  _reconstructPath(cameFrom, currentKey) {
    const path = [];
    while (cameFrom.has(currentKey)) {
      const { row, col } = this._parseKey(currentKey);
      path.unshift(this._toWorldCenter(row, col));
      currentKey = cameFrom.get(currentKey);
    }
    return path;
  }

  _toWorldCenter(row, col) {
    return {
      x: col * this.tileW + this.tileW / 2,
      y: row * this.tileH + this.tileH / 2,
    };
  }
}
