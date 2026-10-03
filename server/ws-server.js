// =========================
// Bomb Blast Arena multiplayer relay server
// =========================
// Game-agnostic WebSocket relay. Knows only about rooms, 4-letter codes,
// up to 4 player slots + 8 spectators per room, and forwarding messages
// between host and guests. Spectators receive host broadcasts but cannot
// send to the host. A `join` that finds no free player slot (room full or
// game already locked) lands as a spectator instead of failing, and lobby
// members can switch roles with `setRole` — except the host, who runs the
// authoritative game. The actual game protocol (start/snapshot/blast/input)
// lives entirely in the browser clients; this server never inspects game
// payloads.
//
// Rooms created inside a Discord Activity carry the Activity's instance id.
// A socket may instead open with `watch` to subscribe to the open lobbies of
// one instance — that powers the "Join <host>'s Lobby" buttons, so everyone
// in the same Activity can find the host without sharing a code.
//
// Rooms are public by default: any socket may open with `browse` and keep
// sending `{t:"browse", page, pageSize}` requests to page through the public
// lobby list, sorted by the relay-measured round-trip latency to each lobby's
// host (the variable half of a guest's client -> relay -> host path). Rooms
// created with `isPublic:false` are never listed.
//
// Run with: yarn ws  (defaults to port 3001, override with WS_PORT env)

const { WebSocketServer } = require("ws");

const WS_PORT = parseInt(process.env.WS_PORT || "3001", 10);
const MAX_PLAYERS_PER_ROOM = 4;
const MAX_SPECTATORS_PER_ROOM = 8;
const CODE_LENGTH = 4;
// Alphabet without ambiguous characters (no I, O, 0, 1).
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const HEARTBEAT_INTERVAL_MS = 30000;
const DEFAULT_LOBBY_PAGE_SIZE = 8;
const MAX_LOBBY_PAGE_SIZE = 50;
// Discord instance ids are opaque strings; cap them so a client can't make
// the server hold arbitrarily large keys.
const MAX_INSTANCE_ID_LENGTH = 128;

// =========================
// Room model
// =========================
/**
 * @typedef {{ slot: number, name: string, ws: import("ws").WebSocket, isHost: boolean }} Player
 * @typedef {{ name: string, ws: import("ws").WebSocket }} Spectator
 * @typedef {{ code: string, players: Player[], spectators: Spectator[], locked: boolean, instanceId: string | null, isPublic: boolean }} Room
 * @typedef {{ room: Room, player: Player | Spectator, isSpectator: boolean } | { browser: true, ws: import("ws").WebSocket }} Session
 */

/** @type {Map<string, Room>} */
const roomsByCode = new Map();
/** @type {Map<import("ws").WebSocket, Session>} */
const sessions = new Map();
/** Sockets watching a Discord instance's lobbies, by instance id. */
/** @type {Map<string, Set<import("ws").WebSocket>>} */
const watchersByInstance = new Map();

// =========================
// Helpers
// =========================
function generateCode() {
  // Retry until we find an unused code. Collision odds are negligible at
  // this scale (26^4 = ~457k codes), but the loop keeps it correct.
  let code;
  do {
    code = "";
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
  } while (roomsByCode.has(code));
  return code;
}

/**
 * Timestamped log line. Only room codes, slots and instance ids are logged —
 * never player names or game payloads.
 */
function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

function send(ws, message) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function broadcastRoom(room) {
  const players = room.players.map((p) => ({
    slot: p.slot,
    name: p.name,
    isHost: p.isHost,
  }));
  const spectators = room.spectators.map((s) => ({ name: s.name }));
  const msg = { t: "room", code: room.code, players, spectators };
  for (const p of room.players) {
    send(p.ws, msg);
  }
  for (const s of room.spectators) {
    send(s.ws, msg);
  }
  notifyInstance(room.instanceId);
}

function validInstanceId(value) {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_INSTANCE_ID_LENGTH
    ? value
    : null;
}

/** Open lobbies hosted in one Discord instance, as sent to watchers. */
function instanceLobbies(instanceId) {
  const lobbies = [];
  for (const room of roomsByCode.values()) {
    if (room.instanceId !== instanceId) continue;
    const host = room.players.find((p) => p.isHost);
    if (!host) continue;
    lobbies.push({
      code: room.code,
      hostName: host.name,
      playerCount: room.players.length,
      locked: room.locked,
    });
  }
  return lobbies;
}

/**
 * All public rooms as browse entries, sorted by the relay's measured
 * round-trip latency to each lobby's host. Rooms whose host hasn't answered
 * one heartbeat ping yet (latencyMs null) sort last, then by code for a
 * stable order.
 */
function publicLobbies() {
  const lobbies = [];
  for (const room of roomsByCode.values()) {
    if (!room.isPublic) continue;
    const host = room.players.find((p) => p.isHost);
    if (!host) continue;
    lobbies.push({
      code: room.code,
      hostName: host.name,
      playerCount: room.players.length,
      maxPlayers: MAX_PLAYERS_PER_ROOM,
      locked: room.locked,
      latencyMs: typeof host.ws.bbaRttMs === "number" ? host.ws.bbaRttMs : null,
    });
  }
  lobbies.sort(
    (a, b) =>
      (a.latencyMs ?? Infinity) - (b.latencyMs ?? Infinity) ||
      a.code.localeCompare(b.code)
  );
  return lobbies;
}

/** Answer one `{t:"browse", page, pageSize}` request (0-based page). */
function sendLobbyList(ws, msg) {
  const pageSize = Math.min(
    Math.max(parseInt(msg.pageSize, 10) || DEFAULT_LOBBY_PAGE_SIZE, 1),
    MAX_LOBBY_PAGE_SIZE
  );
  const all = publicLobbies();
  const pageCount = Math.max(1, Math.ceil(all.length / pageSize));
  const page = Math.min(Math.max(parseInt(msg.page, 10) || 0, 0), pageCount - 1);
  send(ws, {
    t: "lobbyList",
    lobbies: all.slice(page * pageSize, (page + 1) * pageSize),
    page,
    pageSize,
    total: all.length,
  });
}

/** Push the current lobby list to everyone watching the room's instance. */
function notifyInstance(instanceId) {
  if (!instanceId) return;
  const watchers = watchersByInstance.get(instanceId);
  if (!watchers) return;
  const msg = { t: "lobbies", lobbies: instanceLobbies(instanceId) };
  for (const ws of watchers) send(ws, msg);
}

function findRoomByCode(code) {
  return roomsByCode.get((code || "").toUpperCase());
}

/**
 * Add a socket to a room as a spectator: receive-only, no slot. Used by the
 * `spectate` message and by `join` when no player slot is available (room
 * full or game already started). When joining a locked room the host is
 * pinged so it re-sends the start payload and this spectator can build the
 * grid mid-game.
 */
function addSpectator(room, ws, name) {
  if (room.spectators.length >= MAX_SPECTATORS_PER_ROOM) {
    send(ws, { t: "error", message: "Spectator limit reached" });
    ws.close();
    return;
  }
  const spectator = { name: name || "Spectator", ws };
  room.spectators.push(spectator);
  sessions.set(ws, { room, player: spectator, isSpectator: true });
  log(`[room ${room.code}] spectator joined (${room.spectators.length} watching)`);
  send(ws, { t: "spectating", code: room.code });
  broadcastRoom(room);
  if (room.locked) {
    const host = room.players.find((p) => p.isHost);
    if (host) send(host.ws, { t: "spectatorJoined" });
  }
}

function leaveRoom(session) {
  if (!session) return;
  const { room, player, isSpectator } = session;
  const wasHost = !isSpectator && player.isHost;

  // Remove the member from the room.
  if (isSpectator) {
    room.spectators = room.spectators.filter((s) => s !== player);
  } else {
    room.players = room.players.filter((p) => p !== player);
  }

  log(
    `[room ${room.code}] ${wasHost ? "host" : isSpectator ? "spectator" : `slot ${player.slot}`} left`
  );

  // Notify remaining members of the new roster. If the host left, close the
  // room and tell guests + spectators to return to the lobby.
  if (wasHost) {
    for (const p of room.players) {
      send(p.ws, { t: "hostLeft" });
      sessions.delete(p.ws);
    }
    for (const s of room.spectators) {
      send(s.ws, { t: "hostLeft" });
      sessions.delete(s.ws);
    }
    roomsByCode.delete(room.code);
    log(`[room ${room.code}] closed (host left)`);
    notifyInstance(room.instanceId);
  } else if (room.players.length + room.spectators.length > 0) {
    broadcastRoom(room);
  } else {
    roomsByCode.delete(room.code);
    log(`[room ${room.code}] closed (empty)`);
    notifyInstance(room.instanceId);
  }
}

// =========================
// Message handlers
// =========================
function handleMessage(session, data) {
  const { room, player } = session;
  let msg;
  try {
    msg = JSON.parse(data.toString());
  } catch {
    return;
  }

  // Browser sockets never join a room: the only message they may send is a
  // repeated browse request, answered with the requested page.
  if (session.browser) {
    if (msg.t === "browse") sendLobbyList(session.ws, msg);
    return;
  }

  switch (msg.t) {
    case "leave": {
      leaveRoom(session);
      sessions.delete(player.ws);
      break;
    }
    case "lock": {
      if (session.isSpectator || !player.isHost) return;
      room.locked = true;
      log(`[room ${room.code}] locked (match started)`);
      notifyInstance(room.instanceId);
      break;
    }
    case "setRole": {
      // Role changes are a lobby concept: once the room is locked the roster
      // is fixed and a player slot can't be claimed or freed mid-match.
      if (room.locked) {
        send(player.ws, { t: "error", message: "Game already started" });
        break;
      }
      if (msg.role === "spectator" && !session.isSpectator) {
        // The host runs the authoritative engine and there's no host
        // migration, so the host can't become a spectator.
        if (player.isHost) break;
        if (room.spectators.length >= MAX_SPECTATORS_PER_ROOM) {
          send(player.ws, { t: "error", message: "Spectator limit reached" });
          break;
        }
        room.players = room.players.filter((p) => p !== player);
        const spectator = { name: player.name, ws: player.ws };
        room.spectators.push(spectator);
        session.player = spectator;
        session.isSpectator = true;
        send(spectator.ws, { t: "spectating", code: room.code });
        broadcastRoom(room);
      } else if (msg.role === "player" && session.isSpectator) {
        if (room.players.length >= MAX_PLAYERS_PER_ROOM) {
          send(player.ws, { t: "error", message: "Room is full" });
          break;
        }
        // Assign the smallest free slot, same as a fresh join.
        const usedSlots = new Set(room.players.map((p) => p.slot));
        let slot = 0;
        while (usedSlots.has(slot)) slot++;
        const newPlayer = { slot, name: player.name, ws: player.ws, isHost: false };
        room.spectators = room.spectators.filter((s) => s !== player);
        room.players.push(newPlayer);
        session.player = newPlayer;
        session.isSpectator = false;
        send(newPlayer.ws, { t: "joined", code: room.code, slot });
        broadcastRoom(room);
      }
      break;
    }
    case "unlock": {
      // Host returned to the lobby after a match: open the room back up so
      // new players can join (and departed players can rejoin) before the
      // next game.
      if (session.isSpectator || !player.isHost) return;
      room.locked = false;
      log(`[room ${room.code}] unlocked (back to lobby)`);
      notifyInstance(room.instanceId);
      break;
    }
    case "relay": {
      // Spectators are receive-only: nothing they send is relayed.
      if (session.isSpectator) break;
      // Forward to a target audience. Only the host may broadcast to guests
      // (+ spectators); guests can only address the host. This keeps the
      // host authoritative.
      if (msg.to === "guests" && player.isHost) {
        const relayMsg = { t: "relay", from: player.slot, payload: msg.payload };
        for (const p of room.players) {
          if (!p.isHost) send(p.ws, relayMsg);
        }
        for (const s of room.spectators) {
          send(s.ws, relayMsg);
        }
      } else if (msg.to === "host") {
        const host = room.players.find((p) => p.isHost);
        if (host) send(host.ws, { t: "relay", from: player.slot, payload: msg.payload });
      }
      break;
    }
    default:
      break;
  }
}

// =========================
// Connection lifecycle
// =========================
const wss = new WebSocketServer({ port: WS_PORT });

wss.on("connection", (ws) => {
  // First message must be `create`, `join`, `spectate` or `watch`. Subsequent messages are handled
  // by handleMessage once the session is established.
  let registered = false;

  ws.on("message", (data) => {
    if (!registered) {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        log("[connection] rejected: first message is not JSON");
        ws.close();
        return;
      }
      registered = true;

      if (msg.t === "create") {
        const code = generateCode();
        /** @type {Room} */
        const room = {
          code,
          players: [],
          spectators: [],
          locked: false,
          instanceId: validInstanceId(msg.instanceId),
          // Rooms join the public lobby list unless the creator opts out.
          isPublic: msg.isPublic !== false,
        };
        const player = { slot: 0, name: msg.name || "Host", ws, isHost: true };
        room.players.push(player);
        roomsByCode.set(code, room);
        sessions.set(ws, { room, player, isSpectator: false });
        log(
          `[room ${code}] created`,
          room.instanceId ? `(discord instance ${room.instanceId})` : "(no discord instance)"
        );
        send(ws, { t: "created", code, slot: 0 });
        broadcastRoom(room);
      } else if (msg.t === "join") {
        const room = findRoomByCode(msg.code);
        if (!room) {
          log(`[join] room ${msg.code} not found`);
          send(ws, { t: "error", message: "Room not found" });
          ws.close();
          return;
        }
        // No slot for a new player — the room is full or the game already
        // started — so the join lands as a spectator instead of failing.
        if (room.locked || room.players.length >= MAX_PLAYERS_PER_ROOM) {
          addSpectator(room, ws, msg.name);
          return;
        }
        // Assign the smallest free slot. Using players.length would collide
        // after a mid-lobby leave (e.g. slots [0,2] → next join gets 2 again).
        const usedSlots = new Set(room.players.map((p) => p.slot));
        let slot = 0;
        while (usedSlots.has(slot)) slot++;
        const player = { slot, name: msg.name || `Player ${slot + 1}`, ws, isHost: false };
        room.players.push(player);
        sessions.set(ws, { room, player, isSpectator: false });
        log(`[room ${room.code}] player joined slot ${slot} (${room.players.length}/${MAX_PLAYERS_PER_ROOM})`);
        send(ws, { t: "joined", code: room.code, slot });
        broadcastRoom(room);
      } else if (msg.t === "browse") {
        // Read-only socket for the public lobby list; never joins a room.
        // The socket stays open so the client can page or refresh with
        // further browse requests handled by handleMessage.
        sessions.set(ws, { browser: true, ws });
        sendLobbyList(ws, msg);
      } else if (msg.t === "spectate") {
        const room = findRoomByCode(msg.code);
        if (!room) {
          log(`[spectate] room ${msg.code} not found`);
          send(ws, { t: "error", message: "Room not found" });
          ws.close();
          return;
        }
        addSpectator(room, ws, msg.name);
      } else if (msg.t === "watch") {
        // Receive-only subscription to one Discord instance's lobbies; the
        // socket never joins a room.
        const instanceId = validInstanceId(msg.instanceId);
        if (!instanceId) {
          log("[watch] rejected: invalid instance id");
          ws.close();
          return;
        }
        let watchers = watchersByInstance.get(instanceId);
        if (!watchers) {
          watchers = new Set();
          watchersByInstance.set(instanceId, watchers);
        }
        watchers.add(ws);
        log(`[watch] instance ${instanceId} (${watchers.size} watching)`);
        ws.on("close", () => {
          watchers.delete(ws);
          log(`[watch] instance ${instanceId} unwatched (${watchers.size} watching)`);
          if (
            watchers.size === 0 &&
            watchersByInstance.get(instanceId) === watchers
          ) {
            watchersByInstance.delete(instanceId);
          }
        });
        send(ws, { t: "lobbies", lobbies: instanceLobbies(instanceId) });
      } else {
        log(`[connection] rejected: unexpected first message "${msg.t}"`);
        send(ws, { t: "error", message: "Expected create, join, spectate, watch or browse first" });
        ws.close();
      }
      return;
    }

    const session = sessions.get(ws);
    if (!session) return;
    handleMessage(session, data);
  });

  ws.on("pong", () => {
    if (typeof ws.bbaPingSentAt === "number") {
      ws.bbaRttMs = Date.now() - ws.bbaPingSentAt;
    }
  });

  ws.on("close", () => {
    const session = sessions.get(ws);
    if (session) {
      if (!session.browser) leaveRoom(session);
      sessions.delete(ws);
    }
  });

  ws.on("error", () => {
    // swallow; close handler will clean up
  });
});

// =========================
// Heartbeat: drop dead connections
// =========================
setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.readyState === ws.OPEN) {
      // Stamp before pinging so the pong handler can record the RTT — that
      // becomes the latency shown on the public lobby list.
      ws.bbaPingSentAt = Date.now();
      ws.ping();
    }
  }
}, HEARTBEAT_INTERVAL_MS);

console.log(`Bomb Blast Arena relay server listening on ws://localhost:${WS_PORT}`);
