# AGENT.md

Guidance for AI coding agents working in this repository.

## Project Overview

**Bomb Blast Arena** (lo-fi-bomberman) is a browser-based bombing game built with Next.js 16 (App Router), TypeScript, and Tailwind CSS. It supports 1-4 players (1 human + up to 3 AI opponents) with bomb placement, destructible barrels, power-ups, and a timed game mode.

The game loop and rendering are **imperative DOM manipulation** driven by `requestAnimationFrame`, not React state. React is used only for the surrounding UI (screens, HUDs, audio controls). The game grid is a real DOM element built with `document.createElement`.

## Commands

Dependencies must be installed first (`yarn install`) — `node_modules` is gitignored. The project requires Node.js 26 and Yarn 4.

- `yarn dev` — start the Next.js dev server (visit `http://localhost:3000`)
- `yarn build` — production build
- `yarn start` — run the production build
- `yarn lint` — run ESLint (`eslint .` with `next/core-web-vitals`)
- `yarn typecheck` — run `tsc --noEmit`

There is **no test framework** configured. There are no unit/integration/e2e tests.

## Tech Stack

- **Next.js 16.3.5** (App Router, Turbopack) + **React 19.2** + **TypeScript 5.5** (strict mode)
- **Tailwind CSS 4** (CSS-first config in `src/app/globals.css`, no `tailwind.config.js`) for UI styling; game elements use inline styles
- Path alias: `@/*` maps to `./src/*` (see `tsconfig.json`)
- ESLint config: `next/core-web-vitals` flat config (see `eslint.config.mjs`)

## Architecture

### Directory layout

```
src/
  app/                 Next.js App Router (page, layout, game canvas)
  components/          React UI components
    screens/           Start, Lobby, Pause, End screens + HUDs
    AudioController.tsx
  discord/             Discord Activity integration (SDK client, rich presence)
  game/                Vanilla TS game engine (no React)
    core/              Config constants (config.ts)
    assets/            DOM element factories (blocks, character, dynamite, powerups)
    hooks/             tracker.ts (stats), sound.ts (audio)
    net/               Online multiplayer (roomClient, host, guest)
    engine.ts          Game loop, per-player input, lifecycle, win conditions, roster
    grid.ts            Grid generation + DOM building + walkability + cell snapshots
    input.ts           Shared keyboard key -> direction mapping
    player.ts          Character/Player/Computer classes + CharacterManager singleton
    ai.ts              AI movement logic (BFS pathfinding, danger avoidance)
    animations.ts      Bomb fuse, explosions, chain reactions, barrel destruction
    powerup.ts         Power-up pickup detection
  hooks/               React hooks (useAudio.ts)
  types/               Shared types (game.ts, multiplayer.ts, assets.d.ts)
server/                WebSocket relay server (ws-server.js) + smoke test
public/                Static assets (images, music, soundFX)
```

### Key modules

| Module | Responsibility |
| --- | --- |
| `src/game/engine.ts` | Main `requestAnimationFrame` loop, keyboard input, movement, bomb placement, blast-cell damage, win conditions, game lifecycle (`startEngine`/`stopEngine`/`pauseGame`/`resumeGame`) |
| `src/game/grid.ts` | Generates the grid layout (borders, checkerboard solids, random barrels, corner spawn zones), builds the DOM grid, exposes `isWalkable`/`getCellAt`/`resetGrid`/`updateGridLayout` |
| `src/game/player.ts` | `Character` base class (lives, damage cooldown, immunity, inventory, bomb range), `Player` and `Computer` subclasses, `CharacterManager` singleton |
| `src/game/ai.ts` | `updateComputerPlayers` — BFS pathfinding AI: chase enemies, clear barrels, grab powerups, flee bomb danger |
| `src/game/animations.ts` | `armDynamite` — bomb fuse timer (pausable via `pauseBombTimers`/`resumeBombTimers`), explosion propagation, barrel destruction, chain reactions, power-up drops |
| `src/game/powerup.ts` | `checkPowerupPickup` — detects and applies power-ups when a character steps on them |
| `src/game/core/config.ts` | All tunable constants: `GAME_CONFIG`, `GRID_PATTERN`, `PLAYER_CONFIG`, `BOMB_CONFIG`, `SCORE_CONFIG`, `POWERUP_CONFIG` |
| `src/game/hooks/tracker.ts` | `GameTracker` + `PlayerTracker` singletons — stats, scores, kills, time tracking, explosion damage application |
| `src/game/hooks/sound.ts` | `playSound`/`stopSound` — cached `HTMLAudioElement` playback from `public/soundFX/` |
| `src/types/game.ts` | Shared types: `Position`, `GridPosition`, `Direction` + `DIRECTION_DELTAS`, `GameState`, `GameMode` |
| `src/app/page.tsx` | Root page — manages `GameState` (START/PLAYING/PAUSED/GAME_OVER/WIN), wires engine callbacks, renders screens |
| `src/app/game.tsx` | Mounts the grid DOM into React, runs the character render loop |

### Singletons

Two singletons manage global game state (both use the private-constructor + `getInstance()` pattern):

- `characterManager` (`src/game/player.ts`) — registry of all `Character` instances
- `tracker` (`src/game/hooks/tracker.ts`) — per-player stats and game-wide tracking

### Game state flow

`GameState` enum (`src/types/game.ts`): `START` → `PLAYING` → `PAUSED` ↔ `PLAYING` → `GAME_OVER` | `WIN` → `START`

The engine exposes callback setters (`setOnPlayerDead`, `setOnTimeOver`, `setOnWin`) that the React layer wires up in `page.tsx`.

### Rendering model

The grid is a single `HTMLDivElement` (`id="game-grid"`) built once in `grid.ts` and mounted into React via a ref in `game.tsx`. Characters keep one wrapper element each in `charElements`; `renderCharacters()` only updates position per frame and rebuilds the inner visual when its inputs (state/facing/palette/cell size) change. Cell walkability is tracked via `dataset.solid`, `dataset.barrel`, `dataset.bomb`, and `dataset.powerup` attributes on each cell. Note: characters and blast visuals are also children of `grid` — iterate `cellCache` (not `grid.children`) when reading cell state.

## Conventions

### Code style

- **TypeScript strict mode** is on — avoid `any` except where the codebase already uses it (e.g. `dataset` casts).
- **Named exports** for game modules; **default exports** only for Next.js pages/layouts and the `Game` component.
- **Section comments** with `// =========================` dividers are used throughout game modules — follow this pattern when adding to those files.
- **JSDoc comments** on exported functions describe purpose and params.
- **SSR guards**: game modules that touch the DOM guard with `typeof document !== "undefined"` or `typeof window === "undefined"`. Always add these guards in new game-side code.
- **Styling**: React components use Tailwind classes; imperative DOM elements use `Object.assign(el.style, {...})` with inline styles.
- **Config**: all tunable values live in `src/game/core/config.ts` as named constant objects. Do not hardcode magic numbers — add them to the relevant config object.
- **No tests**: there is no test runner. Verify changes by running `yarn dev` and playing the game, plus `yarn lint`.

### Commit style

Conventional commits are used: `feat:`, `fix:`, `refactor:`, `chore:`. Examples from history:

```
feat: add game pause functionality with ESC key and pause screen UI
refactor: reorganized code into hooks, core, assets, screens, etc.
fix: cap displayed time played to game time limit in end screen stats
```

### Imports

- Use the `@/` alias for cross-directory imports (e.g. `@/types/game`, `@/game/core/config`) — though many existing files use relative paths; match the surrounding file's choice.
- Group imports: external → internal aliases → relative.

## Known issues / caveats

- **`tasks.md` describes a more advanced AI** (state machine: HUNTING/ESCAPING/etc., target priorities, player prediction) than what `ai.ts` implements — the shipped AI is a simpler priority chain (chase → barrel → powerup → roam) with danger-avoidance BFS. Treat `tasks.md` as a design spec, not current behavior.

## Online Multiplayer

A self-hostable online multiplayer mode uses a separate WebSocket relay server.

### Running the relay

```bash
yarn ws          # runs server/ws-server.js on ws://localhost:3001 (WS_PORT env to override)
yarn dev         # in another terminal, the Next.js client
```

For production, set `NEXT_PUBLIC_WS_URL` (e.g. `wss://your-host:3001`) so the
browser bundle connects to the right server.

### Architecture: host-authoritative, dumb relay

The game engine is DOM-bound and uses `Math.random`/`setTimeout`, so it cannot
run headless on the server or in lockstep. Instead:

- **Relay server** (`server/ws-server.js`, CommonJS, `ws`): game-agnostic. Manages
  rooms, 4-letter codes, up to 4 player slots plus up to 8 spectators
  (`NET_CONFIG.maxSpectators`), and relays messages between host and guests.
  Spectators receive host broadcasts but cannot send to the host; they may
  join locked rooms — the server pings the host (`spectatorJoined`) so it can
  re-send the start payload. A `join` that finds no free player slot (room
  full or already locked) lands as a spectator instead of failing, and lobby
  members switch roles with `setRole` — the host can't spectate (no host
  migration). Rooms are public by default (`create` accepts `isPublic:false`)
  and the `browse` message pages the public lobby list, sorted by the
  relay-measured heartbeat RTT to each room's host. A `create` with
  `seed:true` + the shared `seedToken` marks a seeder lobby: its bot host
  leaving promotes the oldest remaining player to host instead of closing
  the room. Never inspects game payloads.
- **Lobby seeder** (`server/lobby-seeder.js`): keeps >=`SEED_MIN_LOBBIES`
  (default 3) open public lobbies alive (full/locked rooms don't count),
  checking every `SEED_INTERVAL_MS` (default 4 min) via a `browse` socket
  and hosting `seed:true` rooms under themed names. When a real player
  joins, the bot leaves and the joiner is promoted to host. `yarn seed` or
  the `seeder` docker-compose service. `SEED_TOKEN` must match the relay's
  (default `bomb-blast-local-seed`; override both in deployments).
- **Host browser** runs the real engine unchanged and streams authoritative
  state. `src/game/net/host.ts` relays bomb blasts (`setOnBombExplode`) and
  broadcasts full state snapshots every `NET_CONFIG.snapshotIntervalMs` (50ms)
  via `getCellSnapshots` + character/tracker stats. Online simulation uses a
  timer loop instead of only `requestAnimationFrame`, but fully backgrounded
  browser tabs may still be throttled; server-authoritative simulation would
  be needed to remove that limitation.
- **Guests** are thin views. `src/game/net/guest.ts` rebuilds the grid from the
  host's `start` payload, creates local `Player` instances so `game.tsx`
  renders unchanged, and applies each snapshot (`applyCellSnapshots` +
  `syncTimedFlags`). Keyboard input is sent to the host as `InputPayload`.
  **Spectators** use the same guest view in spectator mode (no input listener,
  nothing sent to the host); they can also join mid-game via the
  `spectatorJoined` → re-sent `start` flow.
- **Engine input** is per-player (`inputByPlayer` map in `engine.ts`): the
  keyboard writes to the local player's entry; `setRemoteInput` applies guest
  input. `setRoster` declares which slots are local/remote/computer.
- Pause is disabled in online games (`pauseGame` no-ops when `hasRemotePlayers`).
- Once the host calls `lockRoom`, joins land as spectators and `setRole` is
  rejected. Host disconnect closes the room and guests get `hostLeft`.
- After a match, "Play Again" returns the host to the room lobby: it broadcasts
  `backToLobby` (which enables the guests' end-screen "Return to Lobby" button)
  and sends `unlock` so the room accepts joins again until the next `lock`.

### Key modules

| Module | Responsibility |
| --- | --- |
| `server/ws-server.js` | Relay server: rooms, codes, slots, message forwarding, `browse` public-lobby listing, seed host promotion |
| `server/lobby-seeder.js` | Keeps >=3 public lobbies alive so the server list is never empty |
| `src/types/multiplayer.ts` | Protocol types (room messages, game payloads, snapshots) |
| `src/game/net/roomClient.ts` | Singleton WebSocket client wrapper + event setters |
| `src/game/net/publicLobbies.ts` | One-shot `browse` fetch for the public server list |
| `src/hooks/usePublicLobbies.ts` | Paged, auto-refreshing public lobby list state for the lobby screen |
| `src/game/net/host.ts` | Host: snapshot broadcast, blast relay, guest input routing |
| `src/game/net/guest.ts` | Guest: grid rebuild, snapshot apply, keyboard→host, sounds |
| `src/components/screens/lobbyScreen.tsx` | Create/join room UI, public/private toggle, public server list, roster, player/spectator role switching, host start controls |

### Smoke test

`node server/smoke-test.js` (after starting the relay) verifies the room/relay
protocol: create, join, bidirectional relay, role switching, joins landing as
spectators on full/locked rooms, hostLeft on host disconnect.

## Discord Activity (rich presence)

The game can run as a Discord Activity with rich presence and share-link
invites. Everything in `src/discord/` no-ops outside Discord — detection is
the `frame_id` query param Discord injects into the iframe URL
(`isDiscordActivity()` in `src/discord/client.ts`).

### Env vars (see `.env.example`)

- `NEXT_PUBLIC_DISCORD_CLIENT_ID` — app client ID (browser-exposed)
- `DISCORD_CLIENT_SECRET` — server-only, used by `src/app/api/token/route.ts`
  to exchange the `authorize()` code for an access token
- `NEXT_PUBLIC_WS_URL` — public relay origin (existing var)

### Dev portal setup (manual)

1. Enable **Activities**, add a placeholder OAuth2 redirect URI (`https://127.0.0.1`).
2. **URL Mappings**: `/` → the public app URL, `/ws` → the public relay host,
   `/discord` → `discord.com` (Discord REST API for the guild nickname;
   prefix is `DISCORD_CONFIG.apiProxyPrefix`).
   The `/ws` prefix is `DISCORD_CONFIG.wsProxyPrefix`; inside the sandbox
   (`*.discordsays.com`) `relayWsUrl()` in `net/roomClient.ts` dials
   `wss://<activity-host>/ws` directly — scheme must be `wss` with an
   implicit port, and `NEXT_PUBLIC_WS_URL` is ignored there. Under an
   "Application URL Override" the origin isn't discordsays.com, so the
   configured server URL is dialed directly instead.
3. Dev workflow needs tunnels: `cloudflared tunnel --url http://localhost:3000`
   for the app and a second tunnel for the relay (`yarn ws` on :3001), then
   point the mappings at the tunnel hosts. The relay must be publicly
   reachable inside Discord — `localhost` cannot be a mapping target.

### Key modules

| Module | Responsibility |
| --- | --- |
| `src/discord/client.ts` | Detection, SDK init, OAuth (`identify` + `rpc.activities.write` + `guilds.members.read`), invite `customId` + `ACTIVITY_JOIN` room-code handling, Discord display name (server nickname → `global_name` → `username`) |
| `src/discord/presence.ts` | `updatePresence(gameState, ctx)` — maps game state to `setActivity` payloads (party size, elapsed timer, winner, join secret while in a lobby) |
| `src/app/api/token/route.ts` | OAuth code → access token exchange |
| `src/discord/linkPreview.ts` | Link-preview copy + `requestOrigin()` + `componentEmbedPayload()` builder |
| `src/app/component-embed.json/route.ts` | Serves the component-embed JSON the layout's `<link>` points at |

Presence updates fire on `GameState` transitions in `page.tsx` (never
per-frame — Discord rate-limits `SET_ACTIVITY`). While in a room lobby the
presence carries `instance: true` + `secrets.join: "room:<CODE>"`, which
makes Discord render a **Join** button; joiners get the code via the
`ACTIVITY_JOIN` dispatch. Lobby invites also use
`commands.shareLink({ custom_id: "room:<CODE>" })`. Either way, recipients
auto-join the room under their Discord display name (capped at 16 chars) —
falling back to a pre-filled join box if auth yielded no name — and the
relay rejects the join when the room is full or already started.

Rooms created inside an Activity are tagged with the SDK `instanceId`
(shared by everyone in the same Activity). The id is known right after the
SDK handshake (`whenDiscordInstanceReady()`), before OAuth, so lobby
discovery keeps working when a participant's login fails or is declined. `net/instanceLobbies.ts` opens a
separate receive-only socket that sends `{ t: "watch", instanceId }`; the
relay pushes `{ t: "lobbies" }` on every change, and the start + lobby
screens render one-click "Join <host>'s Lobby" buttons (or "Watch" when the
match is running or the room is full).

### Link previews (unfurling)

Pasting the game URL in chat unfurls a rich card, styled by Discord's
link-preview tags plus a component embed
(https://docs.discord.com/developers/link-previews/overview and
/component-embeds). The app is self-hostable under arbitrary hosts, so every
absolute URL is resolved per request from the request origin
(`requestOrigin()` in `src/discord/linkPreview.ts`) — which also means pages
render dynamically.

- `src/app/layout.tsx`: `generateMetadata` sets `metadataBase` from the
  request origin and emits `og:`/`twitter:` (`summary_large_image`) tags
  using the marketing social banner; the `viewport` export sets
  `theme-color` (the preview's accent color).
- The same layout renders `<link rel="discord:component-embed">` — React
  hoists it into `<head>` — pointing at `/component-embed.json`, a route
  serving the component payload (Container → Section + Thumbnail, Media
  Gallery, Text Displays, link-style Buttons only).
- The standard OG preview remains as fallback for crawlers that don't read
  component embeds.

## Controls

- Move: `WASD` or Arrow Keys
- Bomb: `Spacebar`
- Pause/Resume: `Escape` (disabled in online games)
