// =========================
// Discord Embedded App SDK client
// =========================
// Lazily initializes the SDK only when the game is running inside Discord's
// Activity iframe (detected via the `frame_id` query param Discord injects
// into the iframe URL). Handles OAuth authorization. The multiplayer relay
// is not routed through here — roomClient dials the proxied /ws path on the
// activity origin directly (see relayWsUrl in net/roomClient.ts).
//
// The SDK is imported dynamically so it never loads — and the handshake never
// runs — in a plain browser tab. Every export is safe to call anywhere.

import type { DiscordSDK } from "@discord/embedded-app-sdk";
import { DISCORD_CONFIG, getDiscordClientId } from "../game/core/config";

let sdk: DiscordSDK | null = null;
let initPromise: Promise<DiscordSDK | null> | null = null;
// Room code delivered by an ACTIVITY_JOIN dispatch (Discord's "Join" button
// on a friend's presence) — consumed the same way as a shareLink custom_id.
let activityJoinRoomCode: string | null = null;
// The authenticated user's Discord display name (server nickname, else
// global name, else username) — pre-fills the lobby nickname and enables
// one-click room joins.
let discordUserName: string | null = null;
let onActivityJoinRoom: ((code: string) => void) | null = null;
// The Activity instance id, known as soon as the SDK handshake completes —
// before, and independent of, OAuth — so lobby discovery and room tagging
// keep working for a participant whose login fails or is declined.
let instanceId: string | null = null;
let instanceIdSettled = false;
const instanceIdWaiters = new Set<(id: string | null) => void>();

function settleInstanceId(id: string | null): void {
  if (instanceIdSettled) return;
  instanceIdSettled = true;
  instanceId = id;
  for (const resolve of instanceIdWaiters) resolve(id);
  instanceIdWaiters.clear();
}

/** True when the page is loaded inside Discord's Activity iframe. */
export function isDiscordActivity(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("frame_id");
}

/** The initialized SDK instance, or null outside Discord / before init. */
export function getDiscordSdk(): DiscordSDK | null {
  return sdk;
}

/**
 * The Activity instance id — shared by everyone in the same Activity
 * session — or null outside Discord / before the SDK handshake. Does not
 * require OAuth.
 */
export function getDiscordInstanceId(): string | null {
  return instanceId;
}

/**
 * Resolves with the Activity instance id once the SDK handshake completes
 * (no OAuth needed), or null outside Discord / when the handshake fails.
 */
export function whenDiscordInstanceReady(): Promise<string | null> {
  if (instanceIdSettled || !isDiscordActivity()) {
    return Promise.resolve(instanceId);
  }
  return new Promise((resolve) => instanceIdWaiters.add(resolve));
}

/** Extract the room code from a `room:<CODE>` value, or null. */
function parseRoomCode(value: string | null): string | null {
  if (!value) return null;
  const prefix = DISCORD_CONFIG.roomCodePrefix;
  return value.startsWith(prefix) ? value.slice(prefix.length) : null;
}

/**
 * The room code Discord launched us into, if any — from a shareLink
 * invite's `custom_id` or an ACTIVITY_JOIN join secret (both `room:<CODE>`).
 */
export function getLaunchRoomCode(): string | null {
  return parseRoomCode(sdk?.customId ?? null) ?? activityJoinRoomCode;
}

/** The authenticated user's Discord display name, or null before auth. */
export function getDiscordUserName(): string | null {
  return discordUserName;
}

/**
 * Readable text for an error. SDK RPC errors are plain `{ code, message }`
 * objects, which Discord's log relay would otherwise print as
 * "[object Object]".
 */
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * Base URL for Discord REST calls. Inside the sandbox (*.discordsays.com)
 * the CSP only allows the activity's own origin, so requests go through the
 * /discord URL mapping. Under a dev "Application URL Override" the origin
 * isn't discordsays.com; call the API directly.
 */
function discordApiBase(): string {
  if (window.location.host.endsWith(".discordsays.com")) {
    return `${DISCORD_CONFIG.apiProxyPrefix}/api`;
  }
  return "https://discord.com/api";
}

/**
 * The user's server nickname in the guild the Activity was launched in, or
 * null — outside a guild (DMs), without a nickname, or on any failure
 * (missing scope or URL mapping). Best-effort: never fails the init.
 */
async function fetchGuildNickname(
  guildId: string | null,
  accessToken: string
): Promise<string | null> {
  if (!guildId) return null;
  try {
    const response = await fetch(
      `${discordApiBase()}/users/@me/guilds/${guildId}/member`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!response.ok) {
      // 404 here usually means the /discord URL mapping is missing; 401/403
      // a missing guilds.members.read grant.
      console.warn("[discord] guild member fetch failed:", response.status);
      return null;
    }
    const member: { nick?: string | null } = await response.json();
    return member.nick || null;
  } catch (error) {
    console.warn("[discord] guild member fetch failed:", describeError(error));
    return null;
  }
}

/**
 * Register a handler fired when Discord dispatches ACTIVITY_JOIN — i.e.
 * this client entered the Activity via the "Join" button on a presence.
 */
export function setOnActivityJoinRoom(
  handler: ((code: string) => void) | null
): void {
  onActivityJoinRoom = handler;
}

/**
 * Initialize the SDK and authenticate the user. Resolves to the SDK when
 * running inside Discord, or null otherwise. Presence is best-effort — a
 * failed init must never break the game, so failures resolve to null.
 */
export function initDiscordClient(): Promise<DiscordSDK | null> {
  if (sdk) return Promise.resolve(sdk);
  if (initPromise) return initPromise;
  if (!isDiscordActivity()) return Promise.resolve(null);

  const clientId = getDiscordClientId();
  if (!clientId) {
    console.warn(
      "[discord] NEXT_PUBLIC_DISCORD_CLIENT_ID is not set — Discord features disabled"
    );
    settleInstanceId(null);
    return Promise.resolve(null);
  }

  initPromise = (async () => {
    const { DiscordSDK: SDK } = await import("@discord/embedded-app-sdk");

    const instance = new SDK(clientId);
    await instance.ready();
    settleInstanceId(instance.instanceId);

    console.info("[discord] SDK ready", {
      instanceId: instance.instanceId,
      guildId: instance.guildId,
      channelId: instance.channelId,
    });

    console.info("[discord] authorizing", DISCORD_CONFIG.oauthScopes);
    const { code } = await instance.commands.authorize({
      client_id: clientId,
      response_type: "code",
      state: "",
      prompt: "none",
      // OAuthScopes isn't exported from the package's public types; the
      // config values are literals within that union, so narrow here.
      scope: DISCORD_CONFIG.oauthScopes as Array<
        "identify" | "rpc.activities.write" | "guilds.members.read"
      >,
    });

    const response = await fetch("/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Token exchange failed (${response.status}): ${body}`);
    }
    const { access_token } = await response.json();

    const { user } = await instance.commands.authenticate({ access_token });
    console.info("[discord] authenticated", { userId: user.id });

    // Joins via the "Join" button on a friend's presence arrive as an
    // ACTIVITY_JOIN dispatch carrying the host's join secret (room:<CODE>).
    // Discord rejects this subscription before authenticate() (RPC error
    // 4006 "Not authenticated or invalid scope"), so it must come after. A
    // failed subscription must never take down the whole init.
    await instance
      .subscribe("ACTIVITY_JOIN", ({ secret }) => {
        const roomCode = parseRoomCode(secret);
        if (!roomCode) return;
        activityJoinRoomCode = roomCode;
        onActivityJoinRoom?.(roomCode);
      })
      .catch((error) => {
        console.warn(
          "[discord] ACTIVITY_JOIN subscribe failed:",
          describeError(error)
        );
      });

    const nickname = await fetchGuildNickname(instance.guildId, access_token);
    discordUserName = nickname ?? user.global_name ?? user.username;
    console.info(
      "[discord] display name from",
      nickname ? "guild nickname" : user.global_name ? "global_name" : "username"
    );

    sdk = instance;
    return sdk;
  })().catch((error) => {
    // The SDK stays null and every Discord feature silently dies without
    // this — surface the real failure (bad client id, token-exchange 500,
    // rejected authorize) in the activity console.
    console.error("[discord] init failed:", describeError(error));
    initPromise = null;
    // A failure before ready() leaves the instance id unknown; release any
    // waiters. After ready() this is a no-op — the id stays usable.
    settleInstanceId(null);
    return null;
  });

  return initPromise;
}
