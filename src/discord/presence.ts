// =========================
// Discord Rich Presence
// =========================
// Builds and pushes activity presence payloads via the Embedded App SDK.
// Called on game-state transitions from page.tsx. Every call is a no-op when
// the game isn't running inside Discord or auth hasn't completed — and
// failures are swallowed since presence is strictly cosmetic.

import { DISCORD_CONFIG } from "../game/core/config";
import { GameMode, GameState } from "../types/game";
import { getDiscordSdk } from "./client";

export interface PresenceContext {
  gameMode: GameMode;
  /** Room code while in a lobby / online match; null otherwise. */
  roomCode: string | null;
  /** Human players in the room (bots don't count toward party size). */
  playerCount: number;
  /** Match start time in ms epoch for the elapsed timer; 0 = not in a match. */
  matchStartMs: number;
  /** Winner's display name, shown on the end screens. */
  winnerName?: string;
  /** True when watching an online match without a player slot. */
  spectating?: boolean;
  /** True in the local solo lobby (bot picker, no room). */
  soloLobby?: boolean;
}

/** Subset of the setActivity activity partial we populate. */
interface ActivityPresence {
  type?: number;
  details?: string | null;
  state?: string | null;
  timestamps?: { start?: number } | null;
  assets?: { large_image?: string | null; large_text?: string | null } | null;
  party?: { id?: string | null; size?: number[] | null } | null;
  instance?: boolean | null;
  secrets?: { join?: string } | null;
}

function modeLabel(gameMode: GameMode): string {
  switch (gameMode) {
    case "online":
      return "Online match";
    default:
      return "Solo match";
  }
}

function buildActivity(
  state: GameState,
  ctx: PresenceContext
): ActivityPresence {
  const assets = {
    large_image: `${window.location.origin}${DISCORD_CONFIG.largeImagePath}`,
    large_text: DISCORD_CONFIG.largeImageText,
  };
  const timestamps =
    ctx.matchStartMs > 0 ? { start: Math.floor(ctx.matchStartMs / 1000) } : null;
  // A room code only exists while in a multiplayer room — that alone implies
  // online play, so party size tracks human players in the room.
  const party = ctx.roomCode
    ? {
        id: ctx.roomCode,
        size: [Math.max(ctx.playerCount, 1), DISCORD_CONFIG.maxPartySize],
      }
    : null;
  // instance + secrets.join let Discord render a "Join" button on the
  // presence; joiners get the room code via ACTIVITY_JOIN. In a locked
  // (in-progress) room the join falls back to spectating — see page.tsx.
  const joinable = ctx.roomCode
    ? {
        instance: true,
        secrets: { join: `${DISCORD_CONFIG.roomCodePrefix}${ctx.roomCode}` },
      }
    : {};

  switch (state) {
    case GameState.LOBBY:
      return ctx.roomCode
        ? {
            type: 0,
            details: "In a lobby",
            state: `Room ${ctx.roomCode}`,
            assets,
            party,
            ...joinable,
          }
        : { type: 0, details: "In the menu", state: ctx.soloLobby ? "Solo lobby" : "Multiplayer lobby", assets };
    case GameState.PLAYING:
      return {
        type: 0,
        details: modeLabel(ctx.gameMode),
        state: ctx.spectating ? "Spectating" : "In a match",
        assets,
        party,
        ...joinable,
        timestamps,
      };
    case GameState.PAUSED:
      return {
        type: 0,
        details: modeLabel(ctx.gameMode),
        state: "Paused",
        assets,
        party,
        timestamps,
      };
    case GameState.WIN:
    case GameState.GAME_OVER:
      return {
        type: 0,
        details: "Match finished",
        state: ctx.winnerName ? `${ctx.winnerName} won` : "Game over",
        assets,
      };
    default:
      return { type: 0, details: "In the menu", assets };
  }
}

/**
 * Push the current game state to Discord rich presence. No-op outside
 * Discord or before the SDK has authenticated.
 */
export function updatePresence(
  state: GameState,
  ctx: PresenceContext
): void {
  const sdk = getDiscordSdk();
  if (!sdk || typeof window === "undefined") return;
  sdk.commands
    .setActivity({ activity: buildActivity(state, ctx) })
    .catch(() => {
      // Best-effort only — ignore rate limits and dropped auth.
    });
}
