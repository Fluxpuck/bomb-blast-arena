import {
  Direction,
  DIRECTION_DELTAS,
  GridPosition,
  Position
} from "../types/game";
import {
  BOMB_CONFIG,
  CHARACTER_CONFIG,
  GRID_PATTERN,
  PLAYER_CONFIG,
  POWERUP_CONFIG
} from "./core/config";
import { playSound } from "./hooks/sound";

// =========================
// Helpers
// =========================

/**
 * Build a friendly display name from a character id.
 * "player-1" -> "Player 1", "computer-2" -> "Computer 2".
 */
function defaultNameForId(id: string): string {
  const dashIndex = id.indexOf("-");
  if (dashIndex === -1) return id;
  const kind = id.slice(0, dashIndex);
  const number = id.slice(dashIndex + 1);
  const label = kind.charAt(0).toUpperCase() + kind.slice(1);
  return `${label} ${number}`;
}

// =========================
// Base Character Class
// =========================
export abstract class Character {
  // Damage cooldown tracking
  private _damageCooldownEndTime: number = 0;
  private static readonly DAMAGE_COOLDOWN_MS: number = 800;
  // Damage animation tracking
  private _damageAnimationEndTime: number = 0;
  private static readonly DAMAGE_ANIMATION_MS: number = 250;
  // Walking animation tracking (true for the walk window after a move)
  private _walkingEndTime: number = 0;
  // Shield power-up: absorbs the next hit instead of losing a life, and
  // expires on its own after a fixed duration
  private _hasShield: boolean = false;
  private _shieldExpiryTime: number = 0;
  // Shield-block visual tracking (blue blink window after an absorbed hit)
  private _shieldBlockEndTime: number = 0;

  // Last direction moved, used to orient the character's sprite
  public facing: Direction = Direction.DOWN;
  // Set true when this character has won the round
  public winning: boolean = false;
  // Display name shown in HUDs / end screen. Defaults to a friendly label
  // derived from the id (e.g. "Player 1", "Computer 2").
  public name: string;
  // Host-measured round-trip latency for online players; null offline.
  public latencyMs: number | null = null;

  constructor(
    public id: string,
    public color: string,
    public darkColor: string,
    public lightColor: string,
    public position: Position,
    public gridPosition: GridPosition,
    public lives: number,
    public inventory: number = PLAYER_CONFIG.defaultInventory,
    public bombRange: number = BOMB_CONFIG.blastRadius,
    name?: string
  ) {
    this.name = name ?? defaultNameForId(id);
  }

  public move(direction: Direction): void {
    const movement = DIRECTION_DELTAS[direction];

    // Update grid position
    this.gridPosition.row += movement.row;
    this.gridPosition.col += movement.col;

    // Update pixel position based on grid position using cell size
    this.position.x = this.gridPosition.col * GRID_PATTERN.cellSize;
    this.position.y = this.gridPosition.row * GRID_PATTERN.cellSize;

    // Track facing and walking animation state
    this.facing = direction;
    this._walkingEndTime = Date.now() + CHARACTER_CONFIG.walkAnimMs;
  }

  public isWalking(): boolean {
    return Date.now() < this._walkingEndTime;
  }

  public takeDamage(): void {
    this.lives = Math.max(0, this.lives - 1);
    this.startDamageAnimation();

    // Play the grunt sound when hit
    playSound("soundFX", "grunt", 0.7);
  }

  private startDamageAnimation(): void {
    this._damageAnimationEndTime = Date.now() + Character.DAMAGE_ANIMATION_MS;
  }

  public isShowingDamageAnimation(): boolean {
    return Date.now() < this._damageAnimationEndTime;
  }

  public isAlive(): boolean {
    return this.lives > 0;
  }

  public setImmune(): void {
    this._damageCooldownEndTime = Date.now() + Character.DAMAGE_COOLDOWN_MS;
  }

  public isImmune(): boolean {
    return Date.now() < this._damageCooldownEndTime;
  }

  public grantShield(): void {
    this._hasShield = true;
    this._shieldExpiryTime = Date.now() + POWERUP_CONFIG.shieldDurationMs;
  }

  public hasShieldActive(): boolean {
    return this._hasShield && Date.now() < this._shieldExpiryTime;
  }

  /** True while the shield is active but close to expiring. */
  public isShieldExpiring(): boolean {
    if (!this.hasShieldActive()) return false;
    return (
      this._shieldExpiryTime - Date.now() <= POWERUP_CONFIG.shieldBlinkMs
    );
  }

  /**
   * Consume the shield if one is active. Returns true when the shield
   * absorbed the hit (no life should be lost), false otherwise.
   */
  public consumeShield(): boolean {
    if (!this.hasShieldActive()) return false;
    this._hasShield = false;
    this._shieldBlockEndTime = Date.now() + Character.DAMAGE_COOLDOWN_MS;
    return true;
  }

  public isShowingShieldBlock(): boolean {
    return Date.now() < this._shieldBlockEndTime;
  }

  public addBomb(): void {
    this.inventory = Math.min(this.inventory + 1, BOMB_CONFIG.maxBombs);
  }

  public increaseBombRange(): void {
    this.bombRange = Math.min(this.bombRange + 1, BOMB_CONFIG.maxBlastRadius);
  }

  /**
   * Force time-based visual flags to a snapshot value. Used by guests to
   * mirror the host's immunity / walking / hurt windows without running
   * their own timers (which would drift over the network).
   */
  public syncTimedFlags(flags: {
    isImmune: boolean;
    isWalking: boolean;
    isHurt: boolean;
    hasShield: boolean;
    isShieldBlock: boolean;
    isShieldExpiring: boolean;
  }): void {
    const now = Date.now();
    this._hasShield = flags.hasShield;
    // Guests don't know the real expiry — approximate with the blink window
    // so the expiring indicator matches the host.
    this._shieldExpiryTime = flags.hasShield
      ? now +
        (flags.isShieldExpiring
          ? POWERUP_CONFIG.shieldBlinkMs
          : POWERUP_CONFIG.shieldDurationMs)
      : 0;
    this._shieldBlockEndTime = flags.isShieldBlock
      ? now + Character.DAMAGE_COOLDOWN_MS
      : 0;
    this._damageCooldownEndTime = flags.isImmune
      ? now + Character.DAMAGE_COOLDOWN_MS
      : 0;
    this._walkingEndTime = flags.isWalking ? now + CHARACTER_CONFIG.walkAnimMs : 0;
    this._damageAnimationEndTime = flags.isHurt
      ? now + Character.DAMAGE_ANIMATION_MS
      : 0;
  }
}

// =========================
// Player Class
// =========================
export class Player extends Character {
  // Identity flag distinguishing human-controlled characters from AI.
  public readonly isPlayer: boolean = true;

  constructor(
    id: string,
    color: string,
    darkColor: string,
    lightColor: string,
    position: Position,
    gridPosition: GridPosition,
    lives: number,
    inventory?: number,
    bombRange?: number,
    name?: string
  ) {
    super(
      id,
      color,
      darkColor,
      lightColor,
      position,
      gridPosition,
      lives,
      inventory,
      bombRange,
      name
    );
  }
}

// =========================
// Computer Class
// =========================
// AI decision-making lives entirely in ai.ts, working against the grid data
// model in state.ts — this class only carries identity/stats,
// same as Player.
export class Computer extends Character {
  // Identity flag distinguishing AI-controlled characters from humans.
  public readonly isComputer: boolean = true;

  constructor(
    id: string,
    color: string,
    darkColor: string,
    lightColor: string,
    position: Position,
    gridPosition: GridPosition,
    lives: number,
    inventory?: number,
    bombRange?: number,
    name?: string
  ) {
    super(
      id,
      color,
      darkColor,
      lightColor,
      position,
      gridPosition,
      lives,
      inventory,
      bombRange,
      name
    );
  }
}

// =========================
// Character Manager (Singleton)
// =========================
class CharacterManager {
  private static instance: CharacterManager;
  private characters: Map<string, Character> = new Map();

  private constructor() {}

  public static getInstance(): CharacterManager {
    if (!CharacterManager.instance) {
      CharacterManager.instance = new CharacterManager();
    }
    return CharacterManager.instance;
  }

  public register(character: Character): void {
    this.characters.set(character.id, character);
  }

  public get(id: string): Character | undefined {
    return this.characters.get(id);
  }

  public getAll(): ReadonlyArray<Character> {
    return Array.from(this.characters.values());
  }

  public getPlayers(): Player[] {
    return Array.from(this.characters.values()).filter(
      (char): char is Player => char instanceof Player
    );
  }

  public getComputers(): Computer[] {
    return Array.from(this.characters.values()).filter(
      (char): char is Computer => char instanceof Computer
    );
  }

  public clear(): void {
    this.characters.clear();
  }
}

// =========================
// Exported Manager Instance
// =========================
export const characterManager = CharacterManager.getInstance();
