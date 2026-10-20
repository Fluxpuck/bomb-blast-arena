---
name: testing
description: How to verify a change to Bomb Blast Arena - static checks, headless unit tests for the grid data model, the relay smoke test, and playing solo and online matches in a browser. Use before pushing any change under src/ or server/.
---

# Testing Bomb Blast Arena

Run the checks that match what you changed. Dependencies first: `yarn install`
(Node 26, Yarn 4).

## 1. Static checks (always)

```bash
yarn typecheck   # tsc --noEmit
yarn lint        # eslint; one pre-existing warning in src/hooks/useAudio.ts
```

## 2. Unit tests (game logic)

```bash
yarn test        # node --test "src/**/*.test.ts"
```

- Uses Node's built-in `node:test` and native TypeScript type stripping. There
  is no test framework dependency; don't add one.
- Only DOM-free modules can be unit tested. Today that is `src/game/state.ts`
  (the arena data model and `computeBlast`), tested in
  `src/game/state.test.ts`.
- Tested modules may only have `import type` imports, or imports with an
  explicit `.ts` extension, because Node does not resolve extensionless paths.
  That is why `state.ts` takes `gridCols` as an argument instead of importing
  `core/config`.
- New gameplay rules (blast reach, walkability, pickups) belong in the model so
  they can get a test here. Build a small arena with `resetCells(tiles, cols)`,
  mutate `getCellState(row, col)` and assert.

## 3. Relay smoke test (when touching `server/` or the room protocol)

```bash
yarn ws &                      # relay on :3001
node server/smoke-test.js
```

## 4. Play the game (when touching anything that renders or runs in a match)

The DOM renderer, timers, input, AI movement and netcode have no unit tests.
Check them in a real browser.

```bash
yarn dev            # http://localhost:3000
yarn ws             # second terminal, only for online matches
```

Checklist:

- **Solo**: Solo → Start Game → pick a map. Bombs explode, crates and barrels
  disappear, power-ups drop and get picked up, bots move, place bombs and
  flee their own blasts. No errors in the console.
- **Online**: one window creates a lobby (Multiplayer → + Create Lobby →
  Create Room), a second joins with the room code. The host starts with a bot.
  The guest's grid must match the host's (destroyed crates, bombs, power-ups);
  this exercises `getCellSnapshots` and `applyCellSnapshots`.
- **Spectator**: a third window joining a started room watches the same grid.
- **Resize / portrait**: the grid and power-ups rescale.

In a cloud session, drive this headlessly with Playwright (Chromium is
preinstalled; never run `playwright install`): launch Chromium, click through
the buttons above with `page.getByRole("button", { name: ... })`, collect
`pageerror` and console errors, and take screenshots of host and guest to
compare.
