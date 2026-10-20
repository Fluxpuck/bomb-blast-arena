// Headless tests for the grid data model. Run with `yarn test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { TileKind } from "./assets/blocks";
import {
  computeBlast,
  findCells,
  getCellState,
  isBreakable,
  isSolid,
  resetCells,
} from "./state.ts";

// 5x5 arena: walls on the border, a crate at (1,3), a wall at (2,2).
const W: TileKind = "wall";
const F: TileKind = "floor";
const C: TileKind = "crate";
function arena(): void {
  resetCells(
    // prettier-ignore
    [
      W, W, W, W, W,
      W, F, F, C, W,
      W, F, W, F, W,
      W, F, F, F, W,
      W, W, W, W, W,
    ],
    5
  );
}

test("off-grid cells are null and solid", () => {
  arena();
  assert.equal(getCellState(-1, 0), null);
  assert.equal(getCellState(0, 5), null);
  assert.equal(isSolid(null), true);
});

test("solidity follows tile and bomb", () => {
  arena();
  const floor = getCellState(1, 1)!;
  assert.equal(isSolid(floor), false);
  floor.bomb = true;
  assert.equal(isSolid(floor), true);
  floor.bomb = false;
  floor.powerup = "shield";
  assert.equal(isSolid(floor), false);
  assert.equal(isBreakable(getCellState(1, 3)), true);
});

test("blast stops at walls and is absorbed by crates and bombs", () => {
  arena();
  getCellState(3, 3)!.bomb = true;
  const { affected, reach } = computeBlast({ row: 1, col: 1 }, 3);
  // Right: (1,2) then crate (1,3) absorbs. Down: (2,1),(3,1) then wall.
  assert.deepEqual(reach, { up: 0, down: 2, left: 0, right: 2 });
  assert.deepEqual(
    affected,
    [
      { row: 1, col: 1 },
      { row: 2, col: 1 },
      { row: 3, col: 1 },
      { row: 1, col: 2 },
      { row: 1, col: 3 },
    ]
  );
  const fromBomb = computeBlast({ row: 3, col: 1 }, 5);
  assert.equal(fromBomb.reach.right, 2, "bomb at (3,3) stops the blast");
});

test("findCells returns positions", () => {
  arena();
  assert.deepEqual(findCells(isBreakable), [{ row: 1, col: 3 }]);
});
