// =========================
// Bomb Blast Arena lobby seeder
// =========================
// Keeps at least MIN_PUBLIC_LOBBIES open public lobbies on the relay so new
// players always see something to join. Every CHECK_INTERVAL_MS it fetches
// the public lobby list (same `browse` message the browser client uses) and
// creates `seed:true` rooms until the minimum is met. Only joinable rooms
// count — a full or locked (in-game) lobby lands newcomers as spectators,
// which is not "something to join".
//
// A seeded room is hosted by this process under a themed name. The bot can't
// run a game, so when the first real player joins, the bot leaves and the
// relay promotes that joiner to host — the seeded lobby becomes a normal
// player-owned room, and the seeder tops the list back up on the next check.
//
// Run with: yarn seed  (WS_URL to target a relay, SEED_INTERVAL_MS and
// SEED_MIN_LOBBIES to override the defaults, SEED_TOKEN to match a relay
// that overrides its development seed token)

const WebSocket = require("ws");

const WS_URL = process.env.WS_URL || "ws://localhost:3001";
const CHECK_INTERVAL_MS = parseInt(process.env.SEED_INTERVAL_MS || "240000", 10);
const MIN_PUBLIC_LOBBIES = parseInt(process.env.SEED_MIN_LOBBIES || "3", 10);
// Must match the relay's SEED_TOKEN — the relay rejects `seed:true` without it.
const SEED_TOKEN = process.env.SEED_TOKEN || "bomb-blast-local-seed";
// A browse socket that never gets answered is closed after this delay.
const BROWSE_TIMEOUT_MS = 10000;
// Bot host names, themed to the game — the list shows "<name>'s lobby". When
// every base name is live, a copy number is appended ("Fuse 2") so a higher
// MIN_PUBLIC_LOBBIES than base names still seeds fully.
const SEED_NAMES = ["Fuse", "Spark", "Boom", "Blast", "TNT", "Ember", "Cap"];

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

/** Count the public lobbies a newcomer can actually join as a player. */
function fetchOpenLobbyCount() {
  return new Promise((resolve, reject) => {
    let settled = false;
    const ws = new WebSocket(WS_URL);
    const timeout = setTimeout(
      () => settle(() => reject(new Error("browse timed out"))),
      BROWSE_TIMEOUT_MS
    );
    const settle = (finish) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      ws.close();
      finish();
    };
    ws.on("open", () => {
      // The relay caps pageSize at 50 — beyond that the unseen tail is not
      // counted as open, which errs toward seeding more, not less.
      ws.send(JSON.stringify({ t: "browse", page: 0, pageSize: 50 }));
    });
    ws.on("message", (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (msg.t !== "lobbyList") return;
      const joinable = msg.lobbies.filter(
        (l) => !l.locked && l.playerCount < l.maxPlayers
      ).length;
      settle(() => resolve(joinable));
    });
    ws.on("error", (err) => settle(() => reject(err)));
    ws.on("close", () =>
      settle(() => reject(new Error("closed before lobbyList")))
    );
  });
}

/**
 * Host one seeded room. Returns once the seed is handed off (a real player
 * joined and the bot left) or the socket died — the caller decides whether
 * to replace it.
 */
function hostSeedRoom(name) {
  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL);
    let code = null;
    const finish = (reason) => {
      if (ws.readyState === ws.OPEN) ws.close();
      resolve(reason);
    };
    ws.on("open", () => {
      ws.send(
        JSON.stringify({
          t: "create",
          name,
          isPublic: true,
          seed: true,
          seedToken: SEED_TOKEN,
        })
      );
    });
    ws.on("message", (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (msg.t === "created") {
        code = msg.code;
        log(`[seeder] hosting lobby ${code} as "${name}"`);
      } else if (msg.t === "room" && msg.players.length > 1) {
        // A real player joined: hand the room over and free this seed slot.
        ws.send(JSON.stringify({ t: "leave" }));
        log(`[seeder] lobby ${code} handed to its first player`);
        finish("handed-off");
      } else if (msg.t === "error") {
        log(`[seeder] relay rejected the seed: ${msg.message}`);
        finish("rejected");
      }
    });
    ws.on("error", () => finish("socket error"));
    ws.on("close", () => finish("closed"));
  });
}

/** Names not currently held by a live seed socket. */
const activeSeedSockets = new Set();

/** The next free host name — a base name, else a numbered copy. */
function pickSeedName() {
  for (const name of SEED_NAMES) {
    if (!activeSeedSockets.has(name)) return name;
  }
  for (let copy = 2; ; copy++) {
    for (const base of SEED_NAMES) {
      const name = `${base} ${copy}`;
      if (!activeSeedSockets.has(name)) return name;
    }
  }
}

async function createSeed(name) {
  activeSeedSockets.add(name);
  try {
    await hostSeedRoom(name);
  } finally {
    activeSeedSockets.delete(name);
  }
}

async function check() {
  let openCount;
  try {
    openCount = await fetchOpenLobbyCount();
  } catch {
    log(`[seeder] relay unreachable at ${WS_URL} — retrying later`);
    return;
  }
  const needed = MIN_PUBLIC_LOBBIES - openCount;
  if (needed <= 0) {
    log(`[seeder] ${openCount} open public lobbies — nothing to do`);
    return;
  }
  for (let i = 0; i < needed; i++) {
    // Detached: the seed lives until hand-off or disconnect.
    createSeed(pickSeedName());
  }
  log(`[seeder] ${openCount} open public lobbies — seeding ${needed} more`);
}

log(
  `[seeder] keeping >=${MIN_PUBLIC_LOBBIES} open public lobbies on ${WS_URL}, checking every ${CHECK_INTERVAL_MS}ms`
);
// Run once immediately, then on the interval. If every seed socket drops
// (relay restart), the next check re-seeds — sockets reconnect through the
// interval rather than per-socket retries.
check();
setInterval(check, CHECK_INTERVAL_MS);
