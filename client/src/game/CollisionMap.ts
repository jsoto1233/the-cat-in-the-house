// TypeScript port of repo-root CollisionMap.js for the client build.
// Thin wrapper around a 2-D walkability grid with slide-resolution + A*.
// The root CollisionMap.js stays canonical for server/multiplayer.

export interface Waypoint {
  x: number;
  y: number;
}

interface Tile {
  row: number;
  col: number;
}

export interface RoomBounds {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

// Canonical room bounds (matches HousePreviewScene layout). Used by the cat's
// behavior layer to reason about "which room is this entity in".
export const ROOMS: RoomBounds[] = [
  { key: "living", x: 30, y: 30, w: 330, h: 230 },
  { key: "kitchen", x: 380, y: 30, w: 390, h: 230 },
  { key: "hallway", x: 30, y: 270, w: 740, h: 60 },
  { key: "bedroom", x: 30, y: 340, w: 290, h: 230 },
  { key: "bathroom", x: 340, y: 340, w: 200, h: 230 },
  { key: "attic", x: 560, y: 340, w: 210, h: 230 }
];

/** Which room contains world point (x, y), or null if outside every room. */
export function roomAt(x: number, y: number): RoomBounds | null {
  for (const r of ROOMS) {
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r;
  }
  return null;
}

export class CollisionMap {
  readonly tileW: number;
  readonly tileH: number;
  readonly grid: boolean[][];
  readonly rows: number;
  readonly cols: number;

  constructor(tileW: number, tileH: number, grid: boolean[][]) {
    this.tileW = tileW;
    this.tileH = tileH;
    this.grid = grid;
    this.rows = grid.length;
    this.cols = grid[0] ? grid[0].length : 0;
  }

  /** Is the world-space point (wx, wy) inside a walkable tile? */
  isWalkable(wx: number, wy: number): boolean {
    const { row, col } = this.toTile(wx, wy);
    return this.inBounds(row, col) && this.grid[row][col] === true;
  }

  /**
   * Slide a movement vector so it doesn't enter a wall.
   * Tries the full move; if blocked, tries X-only then Y-only.
   */
  resolveMove(fromX: number, fromY: number, toX: number, toY: number): Waypoint {
    if (this.isWalkable(toX, toY)) return { x: toX, y: toY };
    if (this.isWalkable(toX, fromY)) return { x: toX, y: fromY };
    if (this.isWalkable(fromX, toY)) return { x: fromX, y: toY };
    return { x: fromX, y: fromY };
  }

  /** World-space waypoints from start → goal via tile-grid A* ([] if none). */
  findPath(fromX: number, fromY: number, goalX: number, goalY: number): Waypoint[] {
    if (!this.isWalkable(fromX, fromY) || !this.isWalkable(goalX, goalY)) return [];

    const start = this.toTile(fromX, fromY);
    const goal = this.toTile(goalX, goalY);
    if (start.row === goal.row && start.col === goal.col) return [];

    const startKey = this.key(start.row, start.col);
    const goalKey = this.key(goal.row, goal.col);
    const openSet = new Set<string>([startKey]);
    const cameFrom = new Map<string, string>();
    const gScore = new Map<string, number>([[startKey, 0]]);
    const fScore = new Map<string, number>([[startKey, this.heuristic(start, goal)]]);

    while (openSet.size > 0) {
      let currentKey: string | null = null;
      let currentF = Infinity;
      for (const k of openSet) {
        const score = fScore.get(k) ?? Infinity;
        if (score < currentF) {
          currentF = score;
          currentKey = k;
        }
      }
      if (currentKey === null) break;

      if (currentKey === goalKey) return this.reconstructPath(cameFrom, currentKey);

      openSet.delete(currentKey);
      const current = this.parseKey(currentKey);
      const neighbors: Tile[] = [
        { row: current.row - 1, col: current.col },
        { row: current.row + 1, col: current.col },
        { row: current.row, col: current.col - 1 },
        { row: current.row, col: current.col + 1 }
      ];

      for (const neighbor of neighbors) {
        if (!this.inBounds(neighbor.row, neighbor.col)) continue;
        if (!this.grid[neighbor.row][neighbor.col]) continue;

        const neighborKey = this.key(neighbor.row, neighbor.col);
        const tentativeG = (gScore.get(currentKey) ?? Infinity) + 1;
        if (tentativeG >= (gScore.get(neighborKey) ?? Infinity)) continue;

        cameFrom.set(neighborKey, currentKey);
        gScore.set(neighborKey, tentativeG);
        fScore.set(neighborKey, tentativeG + this.heuristic(neighbor, goal));
        openSet.add(neighborKey);
      }
    }

    return [];
  }

  private toTile(wx: number, wy: number): Tile {
    return { row: Math.floor(wy / this.tileH), col: Math.floor(wx / this.tileW) };
  }

  private inBounds(row: number, col: number): boolean {
    return row >= 0 && col >= 0 && row < this.rows && col < this.cols;
  }

  private key(row: number, col: number): string {
    return `${row}:${col}`;
  }

  private parseKey(key: string): Tile {
    const [row, col] = key.split(":").map(Number);
    return { row, col };
  }

  private heuristic(a: Tile, b: Tile): number {
    return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
  }

  private reconstructPath(cameFrom: Map<string, string>, currentKey: string): Waypoint[] {
    const path: Waypoint[] = [];
    let key: string | undefined = currentKey;
    while (key !== undefined && cameFrom.has(key)) {
      const { row, col } = this.parseKey(key);
      path.unshift(this.toWorldCenter(row, col));
      key = cameFrom.get(key);
    }
    return path;
  }

  private toWorldCenter(row: number, col: number): Waypoint {
    return { x: col * this.tileW + this.tileW / 2, y: row * this.tileH + this.tileH / 2 };
  }
}
