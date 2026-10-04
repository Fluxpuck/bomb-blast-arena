// =========================
// Bomb Blast Arena lobby seeder
// =========================
// Keeps at least MIN_PUBLIC_LOBBIES public lobbies on the relay so new
// players always see something to join. Every CHECK_INTERVAL_MS it fetches
// the public lobby list (same `browse` message the browser client uses) and
// creates `seed:true` rooms until the minimum is met.
//
// A seeded room is hosted by this process under a themed name. The bot can't
// run a game, so when the first real player joins, the bot leaves and the
// relay promotes that joiner to host — the seeded lobby becomes a normal
// player-owned room, and the seeder tops the list back up on the next check.
//
// Run with: yarn seed  (WS_URL to target a relay, SEED_INTERVAL_MS and
// SEED_MIN_LOBBIES to override the defaults)

const WebSocket = require("ws");

const WS_URL = process.env.WS_URL || "ws://localhost:3001";
const CHECK_INTERVAL_MS = parseInt(process.env.SEED_INTERVAL_MS || "240000", 10);
const MIN_PUBLIC_LOBBIES = parseInt(process.env.SEED_MIN_LOBBIES || "3", 10);
const RECONNECT_DELAY_MS = 5000;
// Bot host names, themed to the game — the list shows "<name>'s lobby".
const SEED_NAMES = ["Fuse", "Spark", "Boom", "Blast", "TNT", "Ember", "Cap"];

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

/** Fetch the total public lobby count via a one-shot browse socket. */
function fetchLobbyCount() {
  return new Promise((resolve, reject) => {
    let settled = false;
    const ws = new WebSocket(WS_URL);
    const settle = (finish) => {
      if (settled) return;
      settled = true;
      ws.close();
      finish();
    };
    ws.on("open", () => {
      ws.send(JSON.stringify({ t: "browse", page: 0, pageSize: 1 }));
    });
    ws.on("message", (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (msg.t === "lobbyList") settle(() => resolve(msg.total));
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
      ws.send(JSON.stringify({ t: "create", name, isPublic: true, seed: true }));
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
      }
    });
    ws.on("error", () => finish("socket error"));
    ws.on("close", () => finish("closed"));
  });
}

/** Names not currently held by a live seed socket. */
const activeSeedSockets = new Set();

async function createSeed(name) {
  activeSeedSockets.add(name);
  try {
    await hostSeedRoom(name);
  } finally {
    activeSeedSockets.delete(name);
  }
}

async function check() {
  let total;
  try {
    total = await fetchLobbyCount();
  } catch {
    log(`[seeder] relay unreachable at ${WS_URL} — retrying later`);
    return;
  }
  const needed = MIN_PUBLIC_LOBBIES - total;
  if (needed <= 0) {
    log(`[seeder] ${total} public lobbies — nothing to do`);
    return;
  }
  const freeNames = SEED_NAMES.filter((n) => !activeSeedSockets.has(n));
  const toCreate = Math.min(needed, freeNames.length);
  for (const name of freeNames.slice(0, toCreate)) {
    // Detached: the seed lives until hand-off or disconnect.
    createSeed(name);
  }
  log(`[seeder] ${total} public lobbies — seeding ${toCreate} more`);
}

log(
  `[seeder] keeping >=${MIN_PUBLIC_LOBBIES} public lobbies on ${WS_URL}, checking every ${CHECK_INTERVAL_MS}ms`
);
// Run once immediately, then on the interval. If every seed socket drops
// (relay restart), the next check re-seeds — sockets reconnect through the
// interval rather than per-socket retries.
check();
setInterval(check, CHECK_INTERVAL_MS);
