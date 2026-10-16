export interface Position {
  x: number;
  y: number;
}

export interface GridPosition {
  row: number;
  col: number;
}

export enum Direction {
  UP = "UP",
  DOWN = "DOWN",
  LEFT = "LEFT",
  RIGHT = "RIGHT",
}

/** Grid-cell delta for each movement direction. */
export const DIRECTION_DELTAS: Record<Direction, { row: number; col: number }> = {
  [Direction.UP]: { row: -1, col: 0 },
  [Direction.DOWN]: { row: 1, col: 0 },
  [Direction.LEFT]: { row: 0, col: -1 },
  [Direction.RIGHT]: { row: 0, col: 1 },
};

export enum GameState {
  START = "START",
  MAP_SELECT = "MAP_SELECT",
  LOBBY = "LOBBY",
  PLAYING = "PLAYING",
  PAUSED = "PAUSED",
  GAME_OVER = "GAME_OVER",
  WIN = "WIN",
}

/** "solo" is the local game against bots; "online" goes through the relay. */
export type GameMode = "solo" | "online";
