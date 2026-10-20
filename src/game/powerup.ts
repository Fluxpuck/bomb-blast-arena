import { GRID_PATTERN } from "./core/config";
import { getCellAt, gridCols, gridRows, isWalkable } from "./grid";
import { playSound } from "./hooks/sound";
import { tracker } from "./hooks/tracker";
import { Character, characterManager } from "./player";
import { getCellState } from "./state";
import { GridPosition } from "../types/game";

/**
 * Check if a character is on a cell with a powerup and collect it
 * @param character The character to check for powerup collection
 */
export function checkPowerupPickup(character: Character): void {
  // Skip if character is not alive
  if (!character.isAlive()) return;

  // Check if there's a powerup at the character's position
  const { row, col } = character.gridPosition;
  const state = getCellState(row, col);
  const powerupType = state?.powerup;
  if (!state || !powerupType) return;

  // Get the player tracker
  const playerTracker = tracker.getPlayer(character.id);
  if (!playerTracker) return;

  // Handle extra bomb powerup
  if (powerupType === "extraBomb") {
    playerTracker.addBomb();
    playSound("soundFX", "powerup-extraBomb", 0.6);
  }

  // Handle increase range powerup
  else if (powerupType === "increaseRange") {
    playerTracker.increaseBombRange();
    playSound("soundFX", "powerup-increaseRange", 0.6);
  }

  // Handle shield powerup
  else if (powerupType === "shield") {
    playerTracker.grantShield();
    playSound("soundFX", "powerup-shield", 0.6);
  }

  // Handle teleport powerup
  else if (powerupType === "teleport") {
    const destination = findRandomTeleportDestination(character);
    if (destination) {
      character.gridPosition.row = destination.row;
      character.gridPosition.col = destination.col;
      character.position.x = destination.col * GRID_PATTERN.cellSize;
      character.position.y = destination.row * GRID_PATTERN.cellSize;
    }
    playSound("soundFX", "powerup-shield", 0.6);
  }

  // Remove the powerup from the cell
  state.powerup = null;
  getCellAt(row, col)?.querySelector("[data-powerup]")?.remove();
}

/**
 * Choose a random walkable cell that is not occupied, bombed, or already
 * carrying a powerup.
 */
function findRandomTeleportDestination(character: Character): GridPosition | null {
  const openCells: GridPosition[] = [];
  const characters = characterManager
    .getAll()
    .filter((candidate) => candidate.id !== character.id && candidate.isAlive());

  for (let row = 0; row < gridRows; row++) {
    for (let col = 0; col < gridCols; col++) {
      if (row === character.gridPosition.row && col === character.gridPosition.col) {
        continue;
      }

      const cell = getCellState(row, col);
      const isOccupied = characters.some(
        (candidate) =>
          candidate.gridPosition.row === row && candidate.gridPosition.col === col
      );
      const isAvailable =
        isWalkable(row, col) &&
        !cell?.bomb &&
        !cell?.powerup &&
        !isOccupied;

      if (isAvailable) openCells.push({ row, col });
    }
  }

  if (openCells.length === 0) return null;
  return openCells[Math.floor(Math.random() * openCells.length)];
}
