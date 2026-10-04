// Smoke test for the relay server. Uses Node's built-in WebSocket (Node 22+).
// Run after starting the server: node server/ws-server.js

const WS_URL = process.env.WS_URL || "ws://localhost:3001";

/** Wrap a WebSocket with a message queue so no messages are lost. */
function queued(ws) {
  const queue = [];
  const waiters = [];
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data.toString());
    if (waiters.length > 0) {
      waiters.shift().resolve(msg);
    } else {
      queue.push(msg);
    }
  });
  return {
    recv(timeoutMs = 2000) {
      return new Promise((resolve, reject) => {
        const waiter = { resolve: (m) => { clearTimeout(timer); resolve(m); } };
        const timer = setTimeout(() => {
          // A timed-out waiter must be removed, or it would swallow the next
          // message by resolving an already-rejected promise.
          const i = waiters.indexOf(waiter);
          if (i >= 0) waiters.splice(i, 1);
          reject(new Error("recv timeout"));
        }, timeoutMs);
        if (queue.length > 0) {
          clearTimeout(timer);
          resolve(queue.shift());
        } else {
          waiters.push(waiter);
        }
      });
    },
  };
}

function send(ws, msg) {
  ws.send(JSON.stringify(msg));
}

async function run() {
  let failures = 0;
  const assert = (cond, msg) => {
    if (cond) {
      console.log("  ✓", msg);
    } else {
      console.error("  ✗", msg);
      failures++;
    }
  };

  // --- Create room ---
  const host = new WebSocket(WS_URL);
  await new Promise((r) => (host.onopen = r));
  const hostQ = queued(host);
  send(host, { t: "create", name: "Alice" });
  const created = await hostQ.recv();
  assert(created.t === "created", "host receives 'created'");
  assert(typeof created.code === "string" && created.code.length === 4, "code is 4 chars");
  assert(created.slot === 0, "host slot is 0");
  const code = created.code;
  console.log("  room code:", code);

  const hostRoom = await hostQ.recv();
  assert(hostRoom.t === "room" && hostRoom.players.length === 1, "host gets room with 1 player");
  assert(Array.isArray(hostRoom.spectators) && hostRoom.spectators.length === 0, "room broadcast includes empty spectators list");

  // --- Join room ---
  const guest = new WebSocket(WS_URL);
  await new Promise((r) => (guest.onopen = r));
  const guestQ = queued(guest);
  send(guest, { t: "join", code, name: "Bob" });
  const joined = await guestQ.recv();
  assert(joined.t === "joined" && joined.slot === 1, "guest receives 'joined' with slot 1");

  // Both get a room update with 2 players.
  const guestRoom = await guestQ.recv();
  const hostRoom2 = await hostQ.recv();
  assert(guestRoom.t === "room" && guestRoom.players.length === 2, "guest sees 2 players");
  assert(hostRoom2.t === "room" && hostRoom2.players.length === 2, "host sees 2 players");

  // --- Spectate: watch-only member ---
  const spectator = new WebSocket(WS_URL);
  await new Promise((r) => (spectator.onopen = r));
  const specQ = queued(spectator);
  send(spectator, { t: "spectate", code, name: "Eve" });
  const spectating = await specQ.recv();
  assert(spectating.t === "spectating" && spectating.code === code, "spectator receives 'spectating'");

  // Everyone gets a room update including the spectators list.
  const specRoom = await specQ.recv();
  const hostRoom3 = await hostQ.recv();
  await guestQ.recv(); // guest's room broadcast
  assert(specRoom.t === "room" && specRoom.spectators.length === 1 && specRoom.spectators[0].name === "Eve", "spectator sees room with spectators list");
  assert(hostRoom3.t === "room" && hostRoom3.spectators.length === 1, "host sees spectator in room broadcast");

  // --- Relay: guest -> host (input) ---
  send(guest, { t: "relay", to: "host", payload: { t: "input", up: true } });
  const hostRelay = await hostQ.recv();
  assert(hostRelay.t === "relay" && hostRelay.from === 1 && hostRelay.payload.up === true, "host receives guest input relay");

  // --- Relay: host -> guests (snapshot) also reaches spectators ---
  send(host, { t: "relay", to: "guests", payload: { t: "snapshot", characters: [] } });
  const guestRelay = await guestQ.recv();
  assert(guestRelay.t === "relay" && guestRelay.payload.t === "snapshot", "guest receives host snapshot relay");
  const specRelay = await specQ.recv();
  assert(specRelay.t === "relay" && specRelay.payload.t === "snapshot", "spectator receives host snapshot relay");

  // --- Spectator -> host relay is dropped (receive-only) ---
  send(spectator, { t: "relay", to: "host", payload: { t: "input", up: true } });
  let spectatorRelayDropped = false;
  try {
    await hostQ.recv(300);
  } catch {
    spectatorRelayDropped = true;
  }
  assert(spectatorRelayDropped, "spectator input relay is dropped");

  // --- Role switch: player -> spectator frees the slot ---
  send(guest, { t: "setRole", role: "spectator" });
  const guestSpectating = await guestQ.recv();
  assert(guestSpectating.t === "spectating", "player switching to spectator receives 'spectating'");
  const guestRoomSwitch = await guestQ.recv();
  const hostRoomSwitch = await hostQ.recv();
  await specQ.recv(); // spectator's room broadcast
  assert(
    guestRoomSwitch.t === "room" &&
      guestRoomSwitch.players.length === 1 &&
      guestRoomSwitch.spectators.length === 2,
    "player->spectator frees the slot"
  );

  // --- Role switch: spectator -> player takes the smallest free slot ---
  send(spectator, { t: "setRole", role: "player" });
  const specJoined = await specQ.recv();
  assert(specJoined.t === "joined" && specJoined.slot === 1, "spectator switching to player gets freed slot 1");
  await specQ.recv(); // spectator's room broadcast
  await guestQ.recv(); // guest's room broadcast
  const hostRoomSwitch2 = await hostQ.recv();
  assert(
    hostRoomSwitch2.t === "room" &&
      hostRoomSwitch2.players.length === 2 &&
      hostRoomSwitch2.spectators.length === 1,
    "spectator->player takes a slot"
  );

  // --- The host can't spectate (no host migration): ignored silently ---
  send(host, { t: "setRole", role: "spectator" });
  let hostSwitchIgnored = false;
  try {
    await hostQ.recv(300);
  } catch {
    hostSwitchIgnored = true;
  }
  assert(hostSwitchIgnored, "host role switch is ignored");

  // --- Lock room: a join lands as spectator instead of failing ---
  send(host, { t: "lock" });
  await new Promise((r) => setTimeout(r, 100));
  const carol = new WebSocket(WS_URL);
  await new Promise((r) => (carol.onopen = r));
  const carolQ = queued(carol);
  send(carol, { t: "join", code, name: "Carol" });
  const carolResp = await carolQ.recv();
  assert(carolResp.t === "spectating", "locked room lands new joins as spectators");
  await carolQ.recv(); // Carol's room broadcast
  await guestQ.recv(); // guest's room broadcast
  await specQ.recv(); // spectator's room broadcast
  const hostRoomLocked = await hostQ.recv();
  assert(hostRoomLocked.t === "room" && hostRoomLocked.spectators.length === 2, "host sees locked join as spectator");
  const hostSpecPing = await hostQ.recv();
  assert(hostSpecPing.t === "spectatorJoined", "host gets spectatorJoined for locked join");

  // --- Role switches are rejected once the room is locked ---
  send(guest, { t: "setRole", role: "player" });
  const lockedRoleResp = await guestQ.recv();
  assert(lockedRoleResp.t === "error" && lockedRoleResp.message.includes("started"), "role switch rejected once locked");

  // --- Unlock room: new joins accepted again (host back in lobby) ---
  send(host, { t: "unlock" });
  await new Promise((r) => setTimeout(r, 100));
  const dave = new WebSocket(WS_URL);
  await new Promise((r) => (dave.onopen = r));
  const daveQ = queued(dave);
  send(dave, { t: "join", code, name: "Dave" });
  const daveResp = await daveQ.recv();
  assert(daveResp.t === "joined" && daveResp.slot === 2, "unlocked room accepts joins again");
  // Drain the join's room broadcast on every member queue.
  await daveQ.recv();
  await hostQ.recv();
  await guestQ.recv();
  await specQ.recv();
  await carolQ.recv();

  // --- Fill the last player slot, then a join lands as spectator ---
  const frank = new WebSocket(WS_URL);
  await new Promise((r) => (frank.onopen = r));
  const frankQ = queued(frank);
  send(frank, { t: "join", code, name: "Frank" });
  const frankResp = await frankQ.recv();
  assert(frankResp.t === "joined" && frankResp.slot === 3, "fourth player joins with slot 3");
  await frankQ.recv();
  await hostQ.recv();
  await guestQ.recv();
  await specQ.recv();
  await carolQ.recv();
  await daveQ.recv();

  const gina = new WebSocket(WS_URL);
  await new Promise((r) => (gina.onopen = r));
  const ginaQ = queued(gina);
  send(gina, { t: "join", code, name: "Gina" });
  const ginaResp = await ginaQ.recv();
  assert(ginaResp.t === "spectating", "join on a full room lands as spectator");
  const ginaRoom = await ginaQ.recv();
  assert(ginaRoom.t === "room" && ginaRoom.players.length === 4 && ginaRoom.spectators.length === 3, "full-room join sees the spectator list");
  await hostQ.recv();
  await guestQ.recv();
  await specQ.recv();
  await carolQ.recv();
  await daveQ.recv();
  await frankQ.recv();

  // --- Host leaves: guests and spectators get hostLeft ---
  host.close();
  const guestHostLeft = await guestQ.recv();
  assert(guestHostLeft.t === "hostLeft", "spectator (ex-player) receives hostLeft when host disconnects");
  const specHostLeft = await specQ.recv();
  assert(specHostLeft.t === "hostLeft", "player (ex-spectator) receives hostLeft when host disconnects");
  const carolHostLeft = await carolQ.recv();
  assert(carolHostLeft.t === "hostLeft", "locked join (spectator) receives hostLeft when host disconnects");
  const daveHostLeft = await daveQ.recv();
  assert(daveHostLeft.t === "hostLeft", "rejoined player receives hostLeft when host disconnects");
  const frankHostLeft = await frankQ.recv();
  assert(frankHostLeft.t === "hostLeft", "fourth player receives hostLeft when host disconnects");
  const ginaHostLeft = await ginaQ.recv();
  assert(ginaHostLeft.t === "hostLeft", "full-room join (spectator) receives hostLeft when host disconnects");

  guest.close();
  spectator.close();
  carol.close();
  dave.close();
  frank.close();
  gina.close();

  // --- Discord instance lobbies: watchers see rooms tagged with their id ---
  const instanceId = `instance-${Date.now()}`;
  const watcher = new WebSocket(WS_URL);
  await new Promise((r) => (watcher.onopen = r));
  const watcherQ = queued(watcher);
  send(watcher, { t: "watch", instanceId });
  const emptyLobbies = await watcherQ.recv();
  assert(emptyLobbies.t === "lobbies" && emptyLobbies.lobbies.length === 0, "watcher gets empty lobby list");

  const discordHost = new WebSocket(WS_URL);
  await new Promise((r) => (discordHost.onopen = r));
  const discordHostQ = queued(discordHost);
  send(discordHost, { t: "create", name: "Hana", instanceId });
  const discordCreated = await discordHostQ.recv();
  const listed = await watcherQ.recv();
  assert(
    listed.t === "lobbies" &&
      listed.lobbies.length === 1 &&
      listed.lobbies[0].code === discordCreated.code &&
      listed.lobbies[0].hostName === "Hana" &&
      listed.lobbies[0].playerCount === 1,
    "watcher sees the instance's new lobby with host name"
  );

  // A room without the instance id stays invisible to the watcher.
  const otherHost = new WebSocket(WS_URL);
  await new Promise((r) => (otherHost.onopen = r));
  send(otherHost, { t: "create", name: "Ivan" });

  send(discordHost, { t: "lock" });
  const lockedList = await watcherQ.recv();
  assert(
    lockedList.lobbies.length === 1 && lockedList.lobbies[0].locked === true,
    "watcher sees lobby lock (untagged room not listed)"
  );

  discordHost.close();
  const closedList = await watcherQ.recv();
  assert(closedList.lobbies.length === 0, "watcher sees lobby removed when host leaves");

  watcher.close();
  otherHost.close();

  // --- Public lobby list: browse pages public rooms only ---
  const browser = new WebSocket(WS_URL);
  await new Promise((r) => (browser.onopen = r));
  const browserQ = queued(browser);
  send(browser, { t: "browse", page: 0, pageSize: 8 });
  const emptyList = await browserQ.recv();
  assert(
    emptyList.t === "lobbyList" && emptyList.total === 0,
    "browser sees an empty public lobby list"
  );

  const publicHost = new WebSocket(WS_URL);
  await new Promise((r) => (publicHost.onopen = r));
  const publicHostQ = queued(publicHost);
  send(publicHost, { t: "create", name: "Mika" });
  const publicCreated = await publicHostQ.recv();

  const publicHost2 = new WebSocket(WS_URL);
  await new Promise((r) => (publicHost2.onopen = r));
  const publicHost2Q = queued(publicHost2);
  send(publicHost2, { t: "create", name: "Nao" });
  await publicHost2Q.recv();

  const privateHost = new WebSocket(WS_URL);
  await new Promise((r) => (privateHost.onopen = r));
  const privateHostQ = queued(privateHost);
  send(privateHost, { t: "create", name: "Oto", isPublic: false });
  await privateHostQ.recv();

  // Page through the list on the same socket: the private room never shows.
  send(browser, { t: "browse", page: 0, pageSize: 1 });
  const firstPage = await browserQ.recv();
  assert(
    firstPage.t === "lobbyList" &&
      firstPage.total === 2 &&
      firstPage.lobbies.length === 1 &&
      firstPage.pageSize === 1,
    "browse first page returns one of two public lobbies"
  );
  send(browser, { t: "browse", page: 1, pageSize: 1 });
  const secondPage = await browserQ.recv();
  assert(
    secondPage.t === "lobbyList" &&
      secondPage.page === 1 &&
      secondPage.lobbies.length === 1,
    "browse second page returns the other public lobby"
  );
  const listedCodes = new Set([
    firstPage.lobbies[0].code,
    secondPage.lobbies[0].code,
  ]);
  assert(
    listedCodes.has(publicCreated.code) && listedCodes.size === 2,
    "both public rooms are listed (private room is not)"
  );
  const entry = firstPage.lobbies[0];
  assert(
    typeof entry.hostName === "string" &&
      entry.maxPlayers === 4 &&
      entry.locked === false &&
      (entry.latencyMs === null || typeof entry.latencyMs === "number"),
    "lobby entry carries host name, capacity, lock and latency"
  );

  // A browse socket may only browse: a non-browse message is ignored.
  send(browser, { t: "leave" });
  send(browser, { t: "browse", page: 0, pageSize: 8 });
  const afterLeave = await browserQ.recv();
  assert(
    afterLeave.t === "lobbyList" && afterLeave.total === 2,
    "browser socket ignores non-browse messages"
  );

  browser.close();
  publicHost.close();
  publicHost2.close();
  privateHost.close();

  // --- Seeded lobbies: the seed leaving promotes the first real player ---
  const seedBot = new WebSocket(WS_URL);
  await new Promise((r) => (seedBot.onopen = r));
  const seedBotQ = queued(seedBot);
  send(seedBot, { t: "create", name: "Fuse", isPublic: true, seed: true });
  const seedCreated = await seedBotQ.recv();
  const seedCode = seedCreated.code;
  await seedBotQ.recv(); // seed's room broadcast

  const seedJoiner = new WebSocket(WS_URL);
  await new Promise((r) => (seedJoiner.onopen = r));
  const seedJoinerQ = queued(seedJoiner);
  send(seedJoiner, { t: "join", code: seedCode, name: "Uma" });
  const seedJoined = await seedJoinerQ.recv();
  assert(
    seedJoined.t === "joined" && seedJoined.slot === 1,
    "joiner takes a player slot in the seeded lobby"
  );
  const seedJoinerRoom = await seedJoinerQ.recv();
  assert(
    seedJoinerRoom.t === "room" && seedJoinerRoom.players.length === 2,
    "seeded lobby shows seed + joiner"
  );

  send(seedBot, { t: "leave" });
  const promotedRoom = await seedJoinerQ.recv();
  assert(
    promotedRoom.t === "room" &&
      promotedRoom.players.length === 1 &&
      promotedRoom.players[0].isHost === true,
    "joiner is promoted to host when the seed leaves"
  );

  // The promoted room is normal: when its new host leaves it closes instead
  // of promoting again.
  const seedWatcher = new WebSocket(WS_URL);
  await new Promise((r) => (seedWatcher.onopen = r));
  const seedWatcherQ = queued(seedWatcher);
  send(seedWatcher, { t: "browse", page: 0, pageSize: 8 });
  const seededList = await seedWatcherQ.recv();
  assert(
    seededList.lobbies.some((l) => l.code === seedCode),
    "promoted lobby stays on the public list"
  );
  seedJoiner.close();
  await new Promise((r) => setTimeout(r, 150));
  send(seedWatcher, { t: "browse", page: 0, pageSize: 8 });
  const closedSeedList = await seedWatcherQ.recv();
  assert(
    !closedSeedList.lobbies.some((l) => l.code === seedCode),
    "promoted lobby closes when its real host leaves"
  );

  seedWatcher.close();
  seedBot.close();

  // Let in-flight socket closes settle before exiting — exiting mid-close
  // trips a libuv assertion on Windows.
  await new Promise((r) => setTimeout(r, 300));

  console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} TEST(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error("Smoke test error:", err);
  process.exit(1);
});
