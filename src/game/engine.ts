import {
  Direction,
  DIRECTION_DELTAS,
  GameState,
  GridPosition,
  Position
} from "../types/game";
import { InputPayload, RosterEntry } from "../types/multiplayer";
import { resetAIState, updateComputerPlayers } from "./ai";
import {
  armDynamite,
  clearActiveBombTimers,
  getPendingBombs,
  pauseBombTimers,
  resumeBombTimers
} from "./animations";
import {
  BOMB_CONFIG,
  GAME_CONFIG,
  GRID_PATTERN,
  NET_CONFIG,
  PLAYER_CONFIG,
  PLAYER_PALETTE
} from "./core/config";
import {
  CORNER_ORDER,
  getCornerSpawn,
  grid,
  gridCols,
  gridRows,
  isWalkable
} from "./grid";
import { playSound } from "./hooks/sound";
import { tracker } from "./hooks/tracker";
import { directionByKey, GAME_KEYS } from "./input";
import { Character, characterManager, Computer, Player } from "./player";
import { checkPowerupPickup } from "./powerup";
import { predictBlastCells } from "./state";

// =========================
// Engine State
// =========================
let gameState: GameState = GameState.START;
let desiredPlayersCount = 1;
let lastUpdateTime = 0;
let animationFrameId: number | null = null;
let simulationIntervalId: number | null = null;
let inputListenersCleanup: (() => void) | null = null;

// Roster: which slots are local / remote / computer. Drives player creation
// and whether pause is allowed (online games can't pause).
let currentRoster: RosterEntry[] = [];
let localPlayerId: string | null = null;
let hasRemotePlayers = false;

// Track active blast cells
interface BlastCell {
  position: GridPosition;
  endTime: number;
  ownerId: string;
  hitCharacterIds: Set<string>;
}
const activeBlastCells: BlastCell[] = [];

// Game event callbacks
let onPlayerDead: ((winnerId?: string) => void) | null = null;
let onTimeOver: (() => void) | null = null;
let onWin: ((winnerId: string) => void) | null = null;
let onBombExplode: ((cells: GridPosition[], playerId: string) => void) | null =
  null;

// =========================
// Input State (per-player)
// =========================
// Each human player (local or remote) has its own input entry. The keyboard
// listener writes to the local player's entry; guests send InputPayload
// messages that the host applies via setRemoteInput.
interface PlayerInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  bomb: boolean;
  bombProcessed: boolean;
  // Discrete movement actions. One physical key press adds one direction.
  moveQueue: Direction[];
}
const inputByPlayer: Map<string, PlayerInput> = new Map();

function ensureInput(playerId: string): PlayerInput {
  let entry = inputByPlayer.get(playerId);
  if (!entry) {
    entry = {
      up: false,
      down: false,
      left: false,
      right: false,
      bomb: false,
      bombProcessed: false,
      moveQueue: [],
    };
    inputByPlayer.set(playerId, entry);
  }
  return entry;
}

/** Queue one movement action without allowing network bursts to grow forever. */
export function queuePlayerMove(playerId: string, direction: Direction): void {
  const input = ensureInput(playerId);
  if (input.moveQueue.length >= PLAYER_CONFIG.maxQueuedMoves) return;
  input.moveQueue.push(direction);
}

/** The id of the locally controlled player (null before the roster is set). */
export function getLocalPlayerId(): string | null {
  return localPlayerId;
}

/**
 * Place a bomb for the local player immediately. Used by touch controls;
 * the cooldown and bomb-limit checks inside placeBomb still apply.
 */
export function pressLocalBomb(): void {
  if (!localPlayerId) return;
  const character = characterManager.get(localPlayerId);
  if (character) placeBomb(character);
}

const lastBombTimeByPlayer: Record<string, number> = {};

// =========================
// Helper Functions
// =========================

/**
 * Convert a grid position to pixel position
 */
export function gridToPixel(gridPos: GridPosition): Position {
  return {
    x: gridPos.col * GRID_PATTERN.cellSize,
    y: gridPos.row * GRID_PATTERN.cellSize,
  };
}

/**
 * Check if a position is inside the grid boundaries
 */
function isInsideGrid(row: number, col: number): boolean {
  return row >= 0 && row < gridRows && col >= 0 && col < gridCols;
}

/**
 * Check if a player can move in a direction
 */
export function canMove(character: Character, direction: Direction): boolean {
  const { row, col } = character.gridPosition;

  const movement = DIRECTION_DELTAS[direction];
  const targetRow = row + movement.row;
  const targetCol = col + movement.col;

  // Check grid boundaries and walkable cells
  if (
    !isInsideGrid(targetRow, targetCol) ||
    !isWalkable(targetRow, targetCol)
  ) {
    return false;
  }

  return true;
}
// Player Movement
// =========================

/**
 * Move a character in a direction
 */
export function moveCharacter(
  character: Character,
  direction: Direction
): boolean {
  // Don't allow movement if game is paused
  if (gameState === GameState.PAUSED) {
    return false;
  }

  if (!canMove(character, direction)) {
    return false;
  }

  // Use the character's own move method to update positions
  character.move(direction);

  // Check if the character moved into a blast cell
  checkBlastCellDamage(character);

  // Check if the character moved onto a powerup
  checkPowerupPickup(character);

  return true;
}

/**
 * Place a bomb at a character's position
 */
export function placeBomb(character: Character): boolean {
  // Don't place bombs if game is paused
  if (gameState === GameState.PAUSED) {
    return false;
  }

  const now = Date.now();
  const lastTime = lastBombTimeByPlayer[character.id] || 0;

  // Check if enough time has passed since this player's last bomb placement
  if (now - lastTime < BOMB_CONFIG.cooldownMs) {
    return false;
  }

  const playerTracker = tracker.getPlayer(character.id);
  if (!playerTracker) {
    return false;
  }

  // Check if player has reached their bomb limit
  // The limit is determined by the character's inventory (bombsAvailable)
  if (playerTracker.activeBombs >= playerTracker.bombsAvailable) {
    return false;
  }

  // Create a copy of the grid position to ensure the bomb stays where it was placed
  const bombPosition = { ...character.gridPosition };

  // Place the bomb on the grid. armDynamite rejects cells that already hold
  // a bomb (e.g. the character is still standing on one they just placed);
  // counting those here would leak an active-bomb slot that no explosion
  // ever releases.
  const armed = armDynamite(grid, bombPosition, {
    bombRange: playerTracker.bombRange,
    ownerId: character.id,
    onDetonate: (cells, duration, ownerId) => {
      // For chain reactions the detonating bomb's owner differs from the
      // character whose placeBomb created this callback.
      const blastOwnerId = ownerId ?? character.id;

      // Add cells to active blast cells list before checking damage so the
      // detonation and movement paths use the same hit rules.
      const blastEndTime = Date.now() + duration;
      cells.forEach((cell) => {
        activeBlastCells.push({
          position: { row: cell.row, col: cell.col },
          endTime: blastEndTime,
          ownerId: blastOwnerId,
          hitCharacterIds: new Set<string>(),
        });
      });

      // Apply the initial hit through the same path used when entering a blast.
      for (const target of characterManager.getAll()) {
        checkBlastCellDamage(target);
      }

      // Trigger bomb explode callback
      if (onBombExplode) {
        onBombExplode(cells, blastOwnerId);
      }

      // Check win conditions
      checkWinConditions();
    },
    onExplode: () => {
      // Release the bomb from active count when explosion finishes
      if (playerTracker) {
        playerTracker.decrementActiveBombs();
      }
    },
  });

  if (!armed) {
    return false;
  }

  // Increment active bombs counter only once the bomb is actually armed
  playerTracker.incrementActiveBombs();
  lastBombTimeByPlayer[character.id] = now;

  // Play bomb placement sound
  playSound("soundFX", "dropping-bomb", 0.5);

  return true;
}

// =========================
// Input Handling
// =========================

/**
 * Apply one human player's input entry. Movement is discrete: each physical
 * key press contributes one queued move, with no 300ms held-key gate. One
 * queued action is consumed per simulation tick for every player equally.
 */
function applyPlayerInput(player: Player) {
  if (!player.isAlive()) return;

  const input = ensureInput(player.id);
  const direction = input.moveQueue.shift();
  if (direction !== undefined) {
    moveCharacter(player, direction);
  }

  // Bomb placement remains edge-triggered, so the heartbeat cannot place
  // repeated bombs while Space is held.
  if (input.bomb && !input.bombProcessed) {
    placeBomb(player);
    input.bombProcessed = true;
  } else if (!input.bomb) {
    input.bombProcessed = false;
  }
}

/**
 * Handle input for all human players (local + remote). Bots are driven by
 * updateComputerPlayers separately.
 */
function handlePlayerInput() {
  const humanPlayers = characterManager.getPlayers();
  for (const player of humanPlayers) {
    applyPlayerInput(player);
  }
}

/**
 * Apply a remote player's input state. Called by the host net layer when a
 * guest sends an InputPayload message.
 */
export function setRemoteInput(playerId: string, payload: InputPayload) {
  const input = ensureInput(playerId);
  input.up = payload.up;
  input.down = payload.down;
  input.left = payload.left;
  input.right = payload.right;
  input.bomb = payload.bomb;

  // `move` exists only on discrete key-press messages. Heartbeat messages
  // omit it, so held keys never create accidental movement repeats.
  if (payload.move !== undefined) {
    queuePlayerMove(playerId, payload.move);
  }
}

/**
 * Set up keyboard event listeners for the local player.
 */
function setupInputListeners() {
  if (typeof window === "undefined") return;
  if (!localPlayerId) return;

  const playerId = localPlayerId;

  const handleKeyDown = (e: KeyboardEvent) => {
    // Prevent default behavior for arrow keys and space to avoid page scrolling
    if (GAME_KEYS.includes(e.key)) {
      e.preventDefault();
    }

    // Escape is handled by the page layer, which owns the React game state.

    const input = ensureInput(playerId);
    const direction = directionByKey[e.key];
    if (direction !== undefined) {
      if (direction === Direction.UP) input.up = true;
      else if (direction === Direction.DOWN) input.down = true;
      else if (direction === Direction.LEFT) input.left = true;
      else if (direction === Direction.RIGHT) input.right = true;

      // Ignore browser key-repeat. One physical key press = one move.
      if (!e.repeat && gameState === GameState.PLAYING) {
        queuePlayerMove(playerId, direction);
      }
    }
    if (e.key === " ") {
      input.bomb = true;
    }
  };

  const handleKeyUp = (e: KeyboardEvent) => {
    const input = ensureInput(playerId);
    const direction = directionByKey[e.key];
    if (direction !== undefined) {
      if (direction === Direction.UP) input.up = false;
      else if (direction === Direction.DOWN) input.down = false;
      else if (direction === Direction.LEFT) input.left = false;
      else if (direction === Direction.RIGHT) input.right = false;
    }
    if (e.key === " ") {
      input.bomb = false;
    }
  };

  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);

  return () => {
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("keyup", handleKeyUp);
  };
}

// =========================
// Computer AI
// =========================

// AI logic moved to ai.ts

// =========================
// Game Loop
// =========================

/**
 * Check if a character is in a blast cell and apply damage if needed
 */
function checkBlastCellDamage(character: Character): void {
  // Skip if character is not alive
  if (!character.isAlive()) return;

  // Skip if character is immune
  if (character.isImmune()) return;

  // Check if character is in any active blast cell
  const currentTime = Date.now();
  const characterPos = character.gridPosition;

  for (let i = 0; i < activeBlastCells.length; i++) {
    const blastCell = activeBlastCells[i];

    // Skip expired blast cells
    if (currentTime > blastCell.endTime) continue;
    if (blastCell.hitCharacterIds.has(character.id)) continue;

    // Check if character is in this blast cell
    if (
      characterPos.row === blastCell.position.row &&
      characterPos.col === blastCell.position.col
    ) {
      // Get player tracker
      const playerTracker = tracker.getPlayer(character.id);
      if (playerTracker) {
        blastCell.hitCharacterIds.add(character.id);

        // Apply one hit and start the immunity window. An active shield
        // absorbs the hit, so no life is lost.
        const absorbedByShield = character.consumeShield();
        if (absorbedByShield) {
          playSound("soundFX", "shield-break", 0.6);
        } else {
          playerTracker.decrementLife();
        }
        character.setImmune();

        // If this killed the player and it wasn't self-damage, credit the kill
        if (!character.isAlive() && character.id !== blastCell.ownerId) {
          const sourcePlayer = tracker.getPlayer(blastCell.ownerId);
          if (sourcePlayer) {
            sourcePlayer.incrementKills();
          }
        }

        // Check win conditions
        checkWinConditions();
      }

      // Only take damage once per update, even if in multiple blast cells
      break;
    }
  }
}

/**
 * Cells that are actively exploding right now (non-expired blast cells).
 * Keyed "row,col" for O(1) lookup. Used by the AI to know which cells are
 * truly impassable — cells a still-ticking bomb would hit remain walkable.
 */
export function getActiveBlastCells(): Set<string> {
  const active = new Set<string>();

  const currentTime = Date.now();
  for (const blastCell of activeBlastCells) {
    if (currentTime > blastCell.endTime) continue;
    active.add(`${blastCell.position.row},${blastCell.position.col}`);
  }

  return active;
}

/**
 * Cells that are either actively exploding right now, or about to be hit by
 * a bomb that's still ticking. Keyed "row,col" for O(1) lookup. Used by the
 * AI for danger-avoidance.
 */
export function getDangerCells(): Set<string> {
  const danger = getActiveBlastCells();

  for (const pending of getPendingBombs()) {
    const cells = predictBlastCells(
      { row: pending.row, col: pending.col },
      pending.range
    );
    for (const cell of cells) {
      danger.add(`${cell.row},${cell.col}`);
    }
  }

  return danger;
}

/**
 * Clean up expired blast cells
 */
function cleanupBlastCells(): void {
  const currentTime = Date.now();
  let i = 0;

  // Remove expired blast cells
  while (i < activeBlastCells.length) {
    if (currentTime > activeBlastCells[i].endTime) {
      // Remove this blast cell
      activeBlastCells.splice(i, 1);
    } else {
      i++;
    }
  }
}

/**
 * Main game update function
 */
function update() {
  // Don't update if not in playing state. No rescheduling while paused:
  // resumeGame restarts the loop, and a paused frame that kept rescheduling
  // would leave a second loop running after resume.
  if (gameState !== GameState.PLAYING) {
    return;
  }

  const currentTime = Date.now();
  const deltaTime = currentTime - lastUpdateTime;
  lastUpdateTime = currentTime;

  // Clean up expired blast cells
  cleanupBlastCells();

  // Handle player input
  handlePlayerInput();

  // Update computer players - only if game is not paused
  updateComputerPlayers(deltaTime);

  // Check time limit
  if (GAME_CONFIG.timeLimit > 0) {
    const elapsedSeconds = tracker.timeElapsedMs / 1000;
    if (elapsedSeconds >= GAME_CONFIG.timeLimit) {
      handleTimeOver();
    }
  }

  // Online hosts use a timer-driven simulation loop. Local games retain the
  // animation-frame loop; unlike requestAnimationFrame, a timer can continue
  // making progress when host tab is backgrounded (subject to browser limits).
  if (simulationIntervalId === null) {
    animationFrameId = requestAnimationFrame(update);
  }
}

// =========================
// Win Conditions
// =========================

/**
 * Check if the game has been won
 */
function checkWinConditions() {
  const alivePlayers = characterManager
    .getAll()
    .filter((char) => char.isAlive());

  // In online multiplayer, end the game when no human players are alive.
  // Bots don't count — the round is over once all real players are dead.
  if (hasRemotePlayers) {
    const aliveHumans = alivePlayers.filter((char) => char instanceof Player);
    if (aliveHumans.length === 0) {
      handlePlayerDeath();
      return;
    }
  }

  // In multiplayer, last player standing wins
  if (desiredPlayersCount > 1 && alivePlayers.length === 1) {
    handleWin(alivePlayers[0].id);
    return;
  }

  // In singleplayer, player death is game over
  const humanPlayers = characterManager.getPlayers();
  if (
    desiredPlayersCount === 1 &&
    humanPlayers.length > 0 &&
    !humanPlayers[0].isAlive()
  ) {
    handlePlayerDeath();
  }
}

/**
 * Handle player death
 */
function handlePlayerDeath() {
  if (gameState !== GameState.PLAYING) return;

  gameState = GameState.GAME_OVER;

  // A lone survivor still counts as the winner when the game ends through
  // the death path (e.g. online: all humans dead but one bot remains).
  const alivePlayers = characterManager
    .getAll()
    .filter((char) => char.isAlive());
  const winnerId = alivePlayers.length === 1 ? alivePlayers[0].id : undefined;

  if (onPlayerDead) {
    onPlayerDead(winnerId);
  }
}

/**
 * Handle time over
 */
function handleTimeOver() {
  if (gameState !== GameState.PLAYING) return;

  gameState = GameState.GAME_OVER;
  if (onTimeOver) {
    onTimeOver();
  }
}

/**
 * Handle win condition
 */
function handleWin(winnerId: string) {
  if (gameState !== GameState.PLAYING) return;

  gameState = GameState.WIN;
  const winner = characterManager.get(winnerId);
  if (winner) {
    winner.winning = true;
  }
  if (onWin) {
    onWin(winnerId);
  }
}

// =========================
// Game Lifecycle
// =========================

/**
 * Start the game engine
 */
export function startEngine() {
  // Reset game state
  gameState = GameState.PLAYING;
  lastUpdateTime = Date.now();

  // Start tracking game time
  tracker.startGame();

  // Set up input handlers. Clean up a stale listener first so restarting a
  // round cannot make one physical key press queue multiple moves.
  if (inputListenersCleanup) {
    inputListenersCleanup();
    inputListenersCleanup = null;
  }
  inputListenersCleanup = setupInputListeners() ?? null;

  // Start game loop. Online hosts use a timer instead of rAF because browser
  // throttling can pause rAF when host switches to another tab/window.
  if (hasRemotePlayers) {
    simulationIntervalId = window.setInterval(
      update,
      NET_CONFIG.simulationIntervalMs
    );
  } else {
    animationFrameId = requestAnimationFrame(update);
  }

  return () => {
    stopEngine();
  };
}

/**
 * Pause the game engine. Disabled in online games (host + guests can't
 * pause a shared game).
 */
export function pauseGame() {
  if (gameState !== GameState.PLAYING) return;
  if (hasRemotePlayers) return;

  // Stop game loop
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  // Pause tracking game time
  tracker.pauseGame();

  // Freeze bomb fuses so nothing explodes while paused
  pauseBombTimers();

  // Set game state to paused
  gameState = GameState.PAUSED;
}

/**
 * Resume the game engine
 */
export function resumeGame() {
  if (gameState !== GameState.PAUSED) return;

  // Resume tracking game time
  tracker.resumeGame();

  // Re-arm bomb fuses with their remaining fuse time
  resumeBombTimers();

  // Reset last update time
  lastUpdateTime = Date.now();

  // Restart game loop
  animationFrameId = requestAnimationFrame(update);

  // Set game state to playing
  gameState = GameState.PLAYING;
}

/**
 * Stop the game engine
 */
export function stopEngine() {
  // Stop game loop
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  if (simulationIntervalId !== null) {
    window.clearInterval(simulationIntervalId);
    simulationIntervalId = null;
  }

  // Stop tracking game time
  tracker.stopGame();

  // Cancel ticking bombs so stale fuses can't detonate into the next game
  clearActiveBombTimers();

  // Clear all active blast cells
  activeBlastCells.length = 0;

  // Remove keyboard listeners so restarting a round cannot duplicate input.
  if (inputListenersCleanup) {
    inputListenersCleanup();
    inputListenersCleanup = null;
  }

  // Reset per-player input state
  inputByPlayer.clear();

  // Clear per-player bomb placement cooldowns
  for (const key of Object.keys(lastBombTimeByPlayer)) {
    delete lastBombTimeByPlayer[key];
  }

  gameState = GameState.START;
}

/**
 * Reset the game engine
 */
export function resetEngine() {
  // Stop the engine first
  stopEngine();

  // Clear all characters
  characterManager.clear();

  // Reset tracker
  tracker.reset();

  // Reset input state
  inputByPlayer.clear();

  // Reset AI state
  resetAIState();

  // Clear all active blast cells
  activeBlastCells.length = 0;

  // Reset game state
  gameState = GameState.START;
}

/**
 * Set the desired number of players (solo/local modes). Builds a default
 * roster: one local human + the rest as computers.
 */
export function setDesiredPlayersCount(count: number) {
  desiredPlayersCount = Math.max(1, Math.min(4, count));

  // Build the default roster for local play.
  currentRoster = [];
  currentRoster.push({
    id: "player-1",
    name: "Player 1",
    control: "local",
    slot: 0,
  });
  for (let i = 1; i < desiredPlayersCount; i++) {
    currentRoster.push({
      id: `computer-${i}`,
      name: `Computer ${i}`,
      control: "computer",
      slot: i,
    });
  }
  localPlayerId = "player-1";
  hasRemotePlayers = false;
}

/**
 * Set an explicit roster (online host). Each entry declares whether the
 * slot is controlled locally, by a remote guest, or by a computer bot.
 */
export function setRoster(roster: RosterEntry[]) {
  currentRoster = roster;
  desiredPlayersCount = roster.length;
  localPlayerId = roster.find((e) => e.control === "local")?.id ?? null;
  hasRemotePlayers = roster.some((e) => e.control === "remote");
}

/**
 * Eliminate a player mid-game (e.g. a guest disconnected). Sets their lives
 * to zero and re-checks win conditions.
 */
export function eliminatePlayer(playerId: string) {
  const character = characterManager.get(playerId);
  if (!character) return;
  if (!character.isAlive()) return;

  character.lives = 0;
  checkWinConditions();
}

/**
 * Set callback for player death. Receives the winner's id when a single
 * survivor remains, or undefined when nobody won.
 */
export function setOnPlayerDead(callback: ((winnerId?: string) => void) | null) {
  onPlayerDead = callback;
}

/**
 * Set callback for time over
 */
export function setOnTimeOver(callback: (() => void) | null) {
  onTimeOver = callback;
}

/**
 * Set callback for win condition
 */
export function setOnWin(callback: ((winnerId: string) => void) | null) {
  onWin = callback;
}

/**
 * Set callback for bomb explosion
 */
export function setOnBombExplode(
  callback: ((cells: GridPosition[], playerId: string) => void) | null
) {
  onBombExplode = callback;
}

/**
 * Initialize players for the game from the current roster. Each roster entry
 * becomes a Character at its corner slot (tl, tr, bl, br) with the palette
 * color for that slot. Local + remote entries become Player instances;
 * computer entries become Computer instances (driven by the AI loop).
 */
export function initializePlayers() {
  // Clear existing characters
  characterManager.clear();

  currentRoster.forEach((entry, index) => {
    const spawn = getCornerSpawn(CORNER_ORDER[index] ?? "tl");
    const palette = PLAYER_PALETTE[index] ?? PLAYER_PALETTE[0];
    const pixelPos = gridToPixel(spawn);

    if (entry.control === "computer") {
      const computer = new Computer(
        entry.id,
        palette.accent,
        palette.dark,
        palette.light,
        pixelPos,
        spawn,
        PLAYER_CONFIG.defaultLives,
        undefined,
        undefined,
        entry.name
      );
      characterManager.register(computer);
      tracker.registerPlayer(computer);
      computer.latencyMs = null;
    } else {
      // local + remote are both Player instances; remote input arrives via
      // setRemoteInput instead of the keyboard listener.
      const player = new Player(
        entry.id,
        palette.accent,
        palette.dark,
        palette.light,
        pixelPos,
        spawn,
        PLAYER_CONFIG.defaultLives,
        undefined,
        undefined,
        entry.name
      );
      characterManager.register(player);
      tracker.registerPlayer(player);
      player.latencyMs = entry.control === "local" ? 0 : null;
    }

    // Ensure an input entry exists for human players.
    if (entry.control !== "computer") {
      ensureInput(entry.id);
    }
  });
}

// =========================
// Public API
// =========================

/**
 * Get the current game state
 */
export function getGameState(): GameState {
  return gameState;
}

/**
 * Get the desired number of players
 */
export function getDesiredPlayersCount(): number {
  return desiredPlayersCount;
}


