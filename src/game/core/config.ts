export const GAME_CONFIG = {
  timeLimit: 180, // in seconds - 3 minutes
};

export const GRID_PATTERN = {
  gridRows: 13,
  gridCols: 15,
  cellSize: 50,
  coverage: 0.8,
  cornerSafeSize: 2,
  rowOffset: 1,
  colOffset: 1,
};

export const GENERATED_MAP = {
  // Chance each interior cell becomes an indestructible pillar.
  pillarChance: 0.18,
  // Breakable coverage is rolled inside this range per generation.
  coverageMin: 0.6,
  coverageMax: 0.9,
  // Regeneration attempts to find a layout where all spawn zones connect.
  maxAttempts: 50,
};

export const LAYOUT_CONFIG = {
  // Vertical space reserved when sizing the grid in portrait orientation:
  // the player HUD strip on top, and the touch controls + bottom bar below.
  portraitTopChrome: 112,
  portraitBottomChrome: 264,
};

export const PLAYER_CONFIG = {
  defaultLives: 3,
  defaultInventory: 1,
  // Prevent delayed network bursts from creating an unbounded movement queue.
  maxQueuedMoves: 8,
};

// Color triplets (accent / dark / light) for the four corner slots, in
// spawn order: top-left, top-right, bottom-left, bottom-right.
export const PLAYER_PALETTE = [
  { accent: "#4aa3ff", dark: "#12457f", light: "#cfe8ff" }, // Azure
  { accent: "#ff5f5f", dark: "#a62a2a", light: "#ffd3cf" }, // Ember
  { accent: "#f5a623", dark: "#a96a06", light: "#ffe6b8" }, // Amber
  { accent: "#b45ddb", dark: "#6f2f96", light: "#ecd4ff" }, // Violet
];

// =========================
// Network (online multiplayer)
// =========================
// The relay server URL clients connect to. Override for production hosting
// via the NEXT_PUBLIC_WS_URL env var (Next.js only exposes NEXT_PUBLIC_* to
// the browser bundle).
export const NET_CONFIG = {
  defaultServerUrl: "ws://localhost:3001",
  // How many spectators (watch-only, no slot) a room accepts on top of the
  // 4 player slots. Mirrored by MAX_SPECTATORS_PER_ROOM in ws-server.js.
  maxSpectators: 8,
  // How often the host broadcasts a full state snapshot to guests.
  snapshotIntervalMs: 50,
  // Repeat guest input while keys are held. This recovers from missed
  // keyup/keydown events and keeps input state fresh across the socket.
  inputIntervalMs: 50,
  // How often the host measures guest round-trip latency.
  latencyPingIntervalMs: 1000,
  // Online host simulation cadence. setInterval is less aggressively paused
  // than requestAnimationFrame when a host window is backgrounded.
  simulationIntervalMs: 16,
};

export function getServerUrl(): string {
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_WS_URL) {
    return process.env.NEXT_PUBLIC_WS_URL;
  }
  return NET_CONFIG.defaultServerUrl;
}

// =========================
// Discord Activity (rich presence)
// =========================
// Only active when the game runs inside Discord's Activity iframe — see
// src/discord/. The client ID is public (NEXT_PUBLIC_*); the client secret
// stays server-side in the /api/token route.
export const DISCORD_CONFIG = {
  // OAuth scopes requested from the Discord client. rpc.activities.write
  // unlocks setActivity(); identify is required for authenticate();
  // guilds.members.read exposes the user's server nickname.
  oauthScopes: ["identify", "rpc.activities.write", "guilds.members.read"],
  // URL-mapping prefix configured in the dev portal that proxies to
  // https://discord.com — the sandbox CSP blocks direct calls to the
  // Discord REST API, same as any other external host.
  apiProxyPrefix: "/discord",
  // URL-mapping prefix configured in the dev portal that proxies to the
  // relay server. Inside the Discord sandbox the client dials
  // wss://<activity-host><wsProxyPrefix> directly — see relayWsUrl in
  // net/roomClient.ts.
  wsProxyPrefix: "/ws",
  // Presence art served from public/ as an external URL (portal-uploaded
  // asset keys would also work, but external URLs need no portal setup).
  largeImagePath: "/image/background.jpg",
  largeImageText: "lo-fi bomb blast arena",
  // Prefix for the shareLink custom_id used to deep-link invites to a room.
  roomCodePrefix: "room:",
  shareMessage: "Come play Bomb Blast Arena with me!",
  maxPartySize: 4,
};

export function getDiscordClientId(): string {
  if (
    typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID
  ) {
    return process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
  }
  return "";
}

export const CHARACTER_CONFIG = {
  // How long a character keeps playing the "walk" sprite animation after a
  // move (isWalking window). There is no position transition — sprites snap
  // to their tile instantly.
  walkAnimMs: 300,
};

export const BOMB_CONFIG = {
  fuseDuration: 1400,
  explodeDuration: 400,
  blastRadius: 1,
  maxBlastRadius: 6,
  maxBombs: 5,
  // Minimum delay between a player's consecutive bomb placements.
  cooldownMs: 250,
};

export const SCORE_CONFIG = {
  pointsPerBarrel: 100,
  eliminationPoints: 1000,
};

export const POWERUP_CONFIG = {
  dropChance: 0.2,
  // Shield expires after this long if it hasn't absorbed a hit.
  shieldDurationMs: 15000,
  // Ring starts blinking this long before the shield expires.
  shieldBlinkMs: 3000,
};
