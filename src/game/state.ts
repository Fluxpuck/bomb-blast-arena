// Plain data model of the arena: the single source of truth for what is on
// each cell. The DOM grid in grid.ts only renders it. Type-only imports keep
// this module free of DOM and config so it runs headless (see state.test.ts).
import type { GridPosition } from "../types/game";
import type { TileKind } from "./assets/blocks";
import type { BlastReach } from "./assets/dynamite";
import type { PowerupType } from "./assets/powerups";

// =========================
// Types
// =========================
export interface CellState {
  tile: TileKind;
  bomb: boolean;
  powerup: PowerupType | null;
}

// =========================
// Store
// =========================
let cols = 0;
let rows = 0;
let cells: CellState[] = [];

/** Replace the whole arena with fresh cells built from row-major tile kinds. */
export function resetCells(tiles: TileKind[], gridCols: number): void {
  cols = gridCols;
  rows = Math.ceil(tiles.length / gridCols);
  cells = tiles.map((tile) => ({ tile, bomb: false, powerup: null }));
}

/** Every cell in row-major order (index = row * cols + col). */
export function getCells(): readonly CellState[] {
  return cells;
}

/** The cell at a position, or null when off-grid. Mutate it in place. */
export function getCellState(row: number, col: number): CellState | null {
  if (row < 0 || row >= rows || col < 0 || col >= cols) return null;
  return cells[row * cols + col] ?? null;
}

/** Crates and barrels: solid, but destroyed by a blast. */
export function isBreakable(cell: CellState | null): boolean {
  return !!cell && (cell.tile === "crate" || cell.tile === "barrel");
}

/** Blocks movement. Off-grid (null) counts as solid. */
export function isSolid(cell: CellState | null): boolean {
  return !cell || cell.tile === "wall" || isBreakable(cell) || cell.bomb;
}

/** Positions of every cell matching `predicate`. */
export function findCells(
  predicate: (cell: CellState) => boolean
): GridPosition[] {
  const found: GridPosition[] = [];
  cells.forEach((cell, i) => {
    if (predicate(cell)) found.push({ row: Math.floor(i / cols), col: i % cols });
  });
  return found;
}

// =========================
// Blast
// =========================

/**
 * Walks outward from `at` in all 4 directions up to `range` tiles, stopping
 * at grid edges and walls exactly like a real explosion does. The center
 * cell is always included. Shared by the real explosion (armDynamite) and the
 * AI's danger prediction so the two can never disagree about what a bomb
 * will hit.
 */
export function computeBlast(
  at: GridPosition,
  range: number
): { affected: GridPosition[]; reach: BlastReach } {
  const affected: GridPosition[] = [{ row: at.row, col: at.col }];
  const outward = Math.max(0, range);
  const dirs: Array<[name: keyof BlastReach, dr: number, dc: number]> = [
    ["up", -1, 0],
    ["down", 1, 0],
    ["left", 0, -1],
    ["right", 0, 1],
  ];
  const reach: BlastReach = { up: 0, down: 0, left: 0, right: 0 };

  for (const [name, dr, dc] of dirs) {
    for (let step = 1; step <= outward; step++) {
      const r = at.row + dr * step;
      const c = at.col + dc * step;
      const cell = getCellState(r, c);

      // Edges and indestructible walls stop the blast and take no damage.
      if (!cell || cell.tile === "wall") break;

      // Open cells are traversable. Barrels and bombs are affected, then stop
      // propagation so the blast cannot pass through an occupied cell.
      affected.push({ row: r, col: c });
      reach[name] = step;
      if (isBreakable(cell) || cell.bomb) break;
    }
  }

  return { affected, reach };
}

/** Cells a pending bomb will hit; used for AI danger-avoidance. */
export function predictBlastCells(
  at: GridPosition,
  range: number
): GridPosition[] {
  return computeBlast(at, range).affected;
}
