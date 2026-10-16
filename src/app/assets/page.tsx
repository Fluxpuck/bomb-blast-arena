import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import {
  Bomb,
  Bomber,
  Powerup,
  Tile,
  type BomberState,
  type Facing,
  type PowerupKind,
  type TileKind,
} from "../../components/sprites";
import { DownloadPng } from "./downloadButton";
import { FitWidth } from "./fitWidth";

export const metadata: Metadata = {
  title: "Bomb Blast Arena — asset kit",
  robots: { index: false },
};

// Font variables (--font-bungee / --font-space / --font-mono) come from the
// vendored next/font/local fonts in the root layout.
const BUNGEE = "var(--font-bungee), 'Bungee', sans-serif";
const MONO = "var(--font-mono), 'JetBrains Mono', monospace";
const SPACE = "var(--font-space), 'Space Grotesk', Helvetica, sans-serif";
const PIXEL = "'Courier New', Courier, monospace";

type Palette = { accent: string; dark: string; light: string };
const BLUE: Palette = { accent: "#60a5fa", dark: "#1e3a8a", light: "#cfe8ff" };
const RED: Palette = { accent: "#ef4444", dark: "#991b1b", light: "#ffd3cf" };
const PURPLE: Palette = { accent: "#a78bfa", dark: "#5b21b6", light: "#ecd4ff" };
const GREEN: Palette = { accent: "#4ade80", dark: "#166534", light: "#d8ffe6" };

const iconGround = "linear-gradient(160deg,#ffce3d 0%,#ff9a2b 100%)";
const label: CSSProperties = {
  fontFamily: MONO,
  fontSize: 12,
  letterSpacing: ".14em",
  color: "#7f9bc4",
};
const caption: CSSProperties = { fontFamily: MONO, fontSize: 11, color: "#7f9bc4" };

type Asset = { id: string; name: string; label: string };

function Block({
  title,
  assets,
  children,
}: {
  title: string;
  assets?: Asset[];
  children: ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={label}>{title}</div>
        {assets?.map((a) => (
          <DownloadPng key={a.id} targetId={a.id} name={a.name} label={a.label} />
        ))}
      </div>
      {children}
    </div>
  );
}

function Abs({ style, children }: { style: CSSProperties; children: ReactNode }) {
  return <div style={{ position: "absolute", ...style }}>{children}</div>;
}

function Guy({
  p,
  scale,
  state = "idle",
  facing = "down",
}: {
  p: Palette;
  scale: number;
  state?: BomberState;
  facing?: Facing;
}) {
  return <Bomber accent={p.accent} dark={p.dark} light={p.light} scale={scale} state={state} facing={facing} />;
}

/** Icon-sized bomb clipped inside a rounded ground. */
function BombIcon({
  id,
  size,
  radius,
  offset,
  scale,
  background,
}: {
  id?: string;
  size: number;
  radius: number;
  offset: [number, number];
  scale: number;
  background: string;
}) {
  return (
    <div
      id={id}
      style={{
        position: "relative",
        width: size,
        height: size,
        borderRadius: radius,
        overflow: "hidden",
        background,
        flex: "0 0 auto",
      }}
    >
      <Abs style={{ left: offset[0], top: offset[1] }}>
        <Bomb state="placed" scale={scale} />
      </Abs>
    </div>
  );
}

/* Banner board: 5 x 4 tiles. Strings are tile kinds; objects overlay a sprite on a floor tile. */
type Overlay =
  | { floor: true; bomber: { p: Palette; state: BomberState; facing: Facing } }
  | { floor: true; powerup: PowerupKind }
  | { floor: true; blast: true };
type Cell = TileKind | Overlay;

const BANNER_CELLS: Cell[] = [
  "wall", "crate", "floor", "barrel", "wall",
  { floor: true, bomber: { p: BLUE, state: "walk", facing: "right" } }, "floor", { floor: true, powerup: "extraBomb" }, "floor", { floor: true, bomber: { p: RED, state: "idle", facing: "left" } },
  "crate", "floor", { floor: true, blast: true }, "floor", "crate",
  "wall", { floor: true, powerup: "increaseRange" }, "floor", { floor: true, bomber: { p: PURPLE, state: "idle", facing: "down" } }, "wall",
];

function BannerCell({ cell }: { cell: Cell }) {
  const S = 0.766;
  if (typeof cell === "string") {
    return <div><Tile kind={cell} scale={S} /></div>;
  }
  return (
    <div style={{ position: "relative", zIndex: "blast" in cell ? 4 : undefined }}>
      <Tile kind="floor" scale={S} />
      <Abs style={{ left: 0, top: 0 }}>
        {"bomber" in cell ? (
          <Guy p={cell.bomber.p} scale={S} state={cell.bomber.state} facing={cell.bomber.facing} />
        ) : "powerup" in cell ? (
          <Powerup kind={cell.powerup} scale={0.72} />
        ) : (
          <Bomb state="explode" range={2} scale={S} />
        )}
      </Abs>
    </div>
  );
}

const TITLE_TILES: TileKind[] = [
  "crate", "wall", "floor", "barrel", "floor", "crate", "floor", "wall",
  "floor", "crate", "floor", "barrel", "floor", "wall", "floor", "crate",
];

const MODE_BUTTONS = [
  { text: "Solo", bg: "#60a5fa", border: "#1e3a8a", color: "#fff" },
  { text: "Multiplayer", bg: "#a78bfa", border: "#5b21b6", color: "#fff" },
];

const modeButton: CSSProperties = {
  padding: "16px 0",
  borderRadius: 12,
  fontFamily: PIXEL,
  fontWeight: 700,
  fontSize: 30,
  letterSpacing: ".05em",
  textAlign: "center",
};

// Small mono uppercase kicker, reused for panel section headers (Room Code,
// Game Statistics, ...) across the game-screen artboards below.
const kicker: CSSProperties = {
  fontFamily: MONO,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: ".14em",
  textTransform: "uppercase",
  color: "#8fa6c9",
};

/** Label-left, mono-value-right stat line (Section/StatRow in ui.tsx). */
function Row({ label: l, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14, color: "#8fa6c9", padding: "2px 0" }}>
      <span>{l}</span>
      <span style={{ fontFamily: MONO, fontWeight: 700, color: "#e8f0fb" }}>{value}</span>
    </div>
  );
}

/* Board generator — ports mapSelectScreen.tsx's own 15x13 layout rules so the
   map previews and playing-HUD board match actual gameplay density. */
const BOARD_R = 13;
const BOARD_C = 15;
function isSpawn(r: number, c: number) {
  return ((r >= 1 && r < 3) || (r > 9 && r <= 11)) && ((c >= 1 && c < 3) || (c > 10 && c <= 13));
}
function isBorder(r: number, c: number) {
  return r === 0 || c === 0 || r === BOARD_R - 1 || c === BOARD_C - 1;
}
const MAP_PATTERNS: [string, (r: number, c: number) => boolean][] = [
  ["Classic", (r, c) => (r + 1) % 2 === 1 && (c + 1) % 2 === 1],
  ["Pillars", (r, c) => r % 3 === 2 && c % 3 === 2],
  ["Corridors", (r, c) => r % 3 === 0 && c % 3 !== 0],
  ["Arena", () => false],
];
const MAP_PREVIEWS = MAP_PATTERNS.map(([name, pillar]) => {
  const cells: string[] = [];
  for (let r = 0; r < BOARD_R; r++)
    for (let c = 0; c < BOARD_C; c++)
      cells.push(isBorder(r, c) ? "#5a6b82" : pillar(r, c) ? "#7d8ea6" : isSpawn(r, c) ? "#2a4d94" : "#0a1120");
  return { name, cells };
});

let boardSeed = 11;
function boardRandom() {
  boardSeed = (boardSeed * 16807) % 2147483647;
  return boardSeed / 2147483647;
}
const PLAY_BOARD: TileKind[] = (() => {
  const clear = new Set([
    "5,7", "5,8", "5,9", "5,10", "5,11", "3,9", "4,9", "6,9", "7,9",
    "1,3", "1,4", "3,6", "7,3", "3,13", "9,11", "9,12", "4,13",
  ]);
  const board: TileKind[] = [];
  for (let r = 0; r < BOARD_R; r++)
    for (let c = 0; c < BOARD_C; c++) {
      if (isBorder(r, c) || MAP_PATTERNS[0][1](r, c)) {
        board.push("wall");
        continue;
      }
      const v = boardRandom();
      if (isSpawn(r, c) || clear.has(`${r},${c}`) || v > 0.62) board.push("floor");
      else board.push(v < 0.09 ? "barrel" : "crate");
    }
  return board;
})();

// 05 is the multiplayer host lobby; 05a the solo lobby, which reuses the
// same in-room panel without the room code, spectators or Leave Room.
const LOBBY_VARIANTS = [
  {
    solo: false,
    id: "asset-lobby-host",
    name: "bomb-blast-arena-lobby-host",
    title: "05 · LOBBY · host view · lobbyScreen.tsx",
    players: [
      { name: "Fluxpuck", color: "#60a5fa", isHost: true, bot: false, slot: 1 },
      { name: "Nova", color: "#ef4444", isHost: false, bot: false, slot: 2 },
      { name: "Computer 1", color: "#4ade80", isHost: false, bot: true, slot: 3 },
    ],
    botOptions: [0, 1, 2],
    bots: 1,
  },
  {
    solo: true,
    id: "asset-lobby-solo",
    name: "bomb-blast-arena-lobby-solo",
    title: "05a · SOLO LOBBY · bot picker · lobbyScreen.tsx",
    players: [
      { name: "Player 1", color: "#60a5fa", isHost: false, bot: false, slot: 1 },
      { name: "Computer 1", color: "#ef4444", isHost: false, bot: true, slot: 2 },
      { name: "Computer 2", color: "#4ade80", isHost: false, bot: true, slot: 3 },
      { name: "Computer 3", color: "#a78bfa", isHost: false, bot: true, slot: 4 },
    ],
    botOptions: [1, 2, 3],
    bots: 3,
  },
];

type HudPlayer = {
  name: string;
  color: string;
  ping?: string;
  eliminated?: boolean;
  dim?: boolean;
  score?: number;
  lives?: number;
  bombs?: [number, number];
  range?: number;
  kills?: number;
};
const HUD_PLAYERS: HudPlayer[] = [
  { name: "Fluxpuck", color: "#60a5fa", ping: "24 ms", score: 340, lives: 3, bombs: [1, 2], range: 2, kills: 1 },
  { name: "Nova", color: "#ef4444", ping: "61 ms", score: 210, lives: 2, bombs: [1, 1], range: 1 },
  { name: "Computer 3", color: "#4ade80", eliminated: true, dim: true },
  { name: "Computer 4", color: "#a78bfa", score: 180, lives: 1, bombs: [2, 3], range: 3, kills: 1 },
];

function HudPanel({ corner, p }: { corner: "tl" | "tr" | "bl" | "br"; p: HudPlayer }) {
  const pos: CSSProperties =
    corner === "tl" ? { top: 16, left: 16 } :
    corner === "tr" ? { top: 16, right: 16 } :
    corner === "bl" ? { bottom: 16, left: 16 } :
    { bottom: 16, right: 16 };
  return (
    <div
      style={{
        position: "absolute",
        ...pos,
        width: 192,
        borderRadius: 12,
        overflow: "hidden",
        opacity: p.dim ? 0.75 : 1,
        background: "rgba(10,17,32,.78)",
        backdropFilter: "blur(6px)",
        border: `2px solid ${p.color}`,
        boxShadow: "0 8px 22px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.06)",
      }}
    >
      <div style={{ height: 6, background: p.color }} />
      <div style={{ padding: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: p.color, boxShadow: "0 0 0 2px rgba(0,0,0,.35)" }} />
          <span style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</span>
          {p.ping && <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: "#8fa6c9" }}>{p.ping}</span>}
        </div>
        {p.eliminated ? (
          <div style={{ textAlign: "center", padding: "4px 0" }}>
            <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: ".2em", textTransform: "uppercase", color: "#ff6b6b" }}>
              Eliminated
            </span>
          </div>
        ) : (
          <>
            {p.score !== undefined && <Row label="Score" value={p.score} />}
            {p.lives !== undefined && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#8fa6c9", padding: "2px 0" }}>
                <span>Lives</span>
                <span style={{ display: "flex", gap: 2, color: "#ef4444" }}>
                  {Array.from({ length: p.lives }, (_, i) => <span key={i}>♥</span>)}
                </span>
              </div>
            )}
            {p.bombs && <Row label="Bombs" value={<>{p.bombs[0]}<span style={{ color: "#8fa6c9" }}> / {p.bombs[1]}</span></>} />}
            {p.range !== undefined && <Row label="Range" value={p.range} />}
            {p.kills !== undefined && <Row label="Kills" value={p.kills} />}
          </>
        )}
      </div>
    </div>
  );
}

const END_CARDS = [
  { name: "Fluxpuck", color: "#60a5fa", score: 410, lives: 0, bombs: 24, blocks: 31, kills: 1 },
  { name: "Nova", color: "#ef4444", score: 280, lives: 0, bombs: 19, blocks: 22, kills: 0 },
  { name: "Pixel", color: "#4ade80", score: 150, lives: 0, bombs: 15, blocks: 18, kills: 0 },
  { name: "Rook", color: "#a78bfa", score: 690, lives: 2, bombs: 30, blocks: 31, kills: 2 },
];

export default function MarketingAssets() {
  return (
    <div className="fixed inset-0 overflow-auto bg-[#070d18]">
      <section
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 38,
          padding: 48,
          width: "100%",
          fontFamily: SPACE,
          color: "#e8f0fb",
          background: "radial-gradient(120% 80% at 50% 0%,#16294a 0%,#070d18 72%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
          <span
            style={{
              fontFamily: MONO,
              fontSize: 12,
              letterSpacing: ".18em",
              color: "#0a1120",
              background: "#ffce3d",
              padding: "4px 9px",
              borderRadius: 5,
              fontWeight: 700,
            }}
          >
            4a
          </span>
          <h1 style={{ margin: 0, fontSize: 34, fontWeight: 700, letterSpacing: "-.01em" }}>
            Bomb Blast Arena — asset kit
          </h1>
          <p style={{ margin: 0, fontFamily: MONO, fontSize: 13, color: "#7f9bc4" }}>
            artboards at export size · built from the game&apos;s own sprites · click a ↓ button to download a PNG
          </p>
        </div>

        {/* 01 LOGO */}
        <Block
          title="01 · LOGO LOCKUP"
          assets={[
            { id: "asset-logo-dark", name: "bomb-blast-arena-logo-dark", label: "dark 760×300" },
            { id: "asset-logo-light", name: "bomb-blast-arena-logo-light", label: "light card" },
            { id: "asset-logo-line", name: "bomb-blast-arena-logo-line", label: "one-line" },
          ]}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
            <FitWidth w={760} h={300}>
              <div
                id="asset-logo-dark"
                style={{
                  width: 760,
                  height: 300,
                boxSizing: "border-box",
                flex: "0 0 auto",
                position: "relative",
                overflow: "hidden",
                borderRadius: 14,
                background: "#0a1120",
                border: "1px solid rgba(124,196,255,.18)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: 520,
                  height: 520,
                  transform: "translate(-50%,-50%)",
                  borderRadius: "50%",
                  background: "radial-gradient(circle,rgba(255,154,43,.22) 0%,rgba(255,154,43,0) 62%)",
                }}
              />
              <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 22 }}>
                <div style={{ position: "relative", width: 96, height: 96, flex: "0 0 auto" }}>
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      borderRadius: 24,
                      background: "linear-gradient(160deg,#233a63 0%,#0e1a2f 100%)",
                      border: "3px solid #ffce3d",
                      boxSizing: "border-box",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      width: 96,
                      height: 96,
                      overflow: "hidden",
                      borderRadius: 24,
                    }}
                  >
                    <Abs style={{ left: -14, top: -8 }}>
                      <Bomb state="placed" scale={0.95} />
                    </Abs>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div
                    style={{
                      fontFamily: BUNGEE,
                      fontSize: 50,
                      lineHeight: 0.92,
                      color: "#ffce3d",
                      letterSpacing: ".005em",
                      textShadow: "0 4px 0 #a8410c,0 0 26px rgba(255,154,43,.5)",
                    }}
                  >
                    BOMB
                    <br />
                    BLAST
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ height: 3, width: 34, background: "#5fd7f2", borderRadius: 2 }} />
                    <div style={{ fontFamily: BUNGEE, fontSize: 24, color: "#5fd7f2", letterSpacing: ".22em" }}>
                      ARENA
                    </div>
                  </div>
                </div>
              </div>
              </div>
            </FitWidth>

            <FitWidth w={360} h={300}>
            <div style={{ width: 360, height: 300, flex: "0 0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
              <div
                id="asset-logo-light"
                style={{
                  flex: 1,
                  borderRadius: 14,
                  background: "#f2ede3",
                  border: "1px solid rgba(0,0,0,.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 14,
                }}
              >
                <div
                  style={{
                    position: "relative",
                    width: 58,
                    height: 58,
                    overflow: "hidden",
                    borderRadius: 15,
                    background: "#0a1120",
                  }}
                >
                  <Abs style={{ left: -9, top: -5 }}>
                    <Bomb state="placed" scale={0.58} />
                  </Abs>
                </div>
                <div style={{ fontFamily: BUNGEE, fontSize: 26, lineHeight: 0.9, color: "#14203a" }}>
                  BOMB
                  <br />
                  BLAST<span style={{ color: "#a8410c" }}> ARENA</span>
                </div>
              </div>
              <div
                id="asset-logo-line"
                style={{
                  flex: 1,
                  borderRadius: 14,
                  background: "#0a1120",
                  border: "1px solid rgba(255,255,255,.12)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div style={{ fontFamily: BUNGEE, fontSize: 19, color: "#f5f1e6", letterSpacing: ".06em" }}>
                  BOMB BLAST <span style={{ color: "#ffce3d" }}>ARENA</span>
                </div>
              </div>
              <div style={caption}>light ground · single-line horizontal</div>
              </div>
            </FitWidth>
          </div>
        </Block>

        {/* 02 BANNER */}
        <Block
          title="02 · SOCIAL BANNER · 1280×640"
          assets={[{ id: "asset-banner", name: "bomb-blast-arena-banner-1280x640", label: "1280×640" }]}
        >
          <FitWidth w={1280} h={640}>
          <div
            id="asset-banner"
            style={{
              width: 1280,
              height: 640,
              flex: "0 0 auto",
              position: "relative",
              overflow: "hidden",
              borderRadius: 16,
              background: "linear-gradient(165deg,#1b2f55 0%,#0a1120 58%,#1a1120 100%)",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "repeating-linear-gradient(90deg,rgba(124,196,255,.07) 0 1px,rgba(0,0,0,0) 1px 64px),repeating-linear-gradient(0deg,rgba(124,196,255,.07) 0 1px,rgba(0,0,0,0) 1px 64px)",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: -120,
                top: -160,
                width: 760,
                height: 760,
                borderRadius: "50%",
                background: "radial-gradient(circle,rgba(255,154,43,.2) 0%,rgba(255,154,43,0) 64%)",
              }}
            />

            <div
              style={{
                position: "absolute",
                left: 72,
                top: 104,
                display: "flex",
                flexDirection: "column",
                gap: 26,
                width: 620,
              }}
            >
              <div
                style={{
                  fontFamily: BUNGEE,
                  fontSize: 96,
                  lineHeight: 0.86,
                  color: "#ffce3d",
                  textShadow: "0 6px 0 #a8410c,0 0 44px rgba(255,154,43,.45)",
                }}
              >
                BOMB
                <br />
                BLAST
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ height: 5, width: 54, background: "#5fd7f2", borderRadius: 3 }} />
                <div style={{ fontFamily: BUNGEE, fontSize: 44, color: "#5fd7f2", letterSpacing: ".2em" }}>ARENA</div>
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: 25,
                  lineHeight: 1.35,
                  color: "#d7e4f7",
                  maxWidth: "22ch",
                  textWrap: "pretty",
                }}
              >
                Outlast three bots — or four friends — in a grid that keeps blowing up.
              </p>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 15,
                    fontWeight: 700,
                    color: "#0a1120",
                    background: "#ffce3d",
                    padding: "10px 16px",
                    borderRadius: 8,
                  }}
                >
                  ONLINE MULTIPLAYER
                </span>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 15,
                    fontWeight: 700,
                    color: "#5fd7f2",
                    border: "2px solid rgba(95,215,242,.55)",
                    padding: "8px 16px",
                    borderRadius: 8,
                  }}
                >
                  NPC OPPONENTS
                </span>
              </div>
            </div>

            <div
              style={{
                position: "absolute",
                right: 44,
                top: 70,
                display: "grid",
                gridTemplateColumns: "repeat(5,92px)",
                gridAutoRows: 92,
                gap: 4,
                background: "#2f3440",
                padding: 10,
                borderRadius: 14,
                transform: "rotate(-6deg)",
                boxShadow: "0 34px 70px rgba(0,0,0,.55)",
              }}
            >
              {BANNER_CELLS.map((cell, i) => (
                <BannerCell key={i} cell={cell} />
              ))}
            </div>
          </div>
          </FitWidth>
        </Block>

        {/* 03 TITLE SCREEN */}
        <Block
          title="03 · TITLE / BACK SCREEN · 1920×1080 · over the game's own background.jpg"
          assets={[{ id: "asset-title", name: "bomb-blast-arena-title-1920x1080", label: "1920×1080" }]}
        >
          <FitWidth w={1920} h={1080}>
          <div
            id="asset-title"
            style={{
              width: 1920,
              height: 1080,
              flex: "0 0 auto",
              position: "relative",
              overflow: "hidden",
              borderRadius: 18,
              background: "#0b1526",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                backgroundImage: "url(/image/background.jpg)",
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "radial-gradient(70% 55% at 50% 30%,rgba(11,21,38,.35) 0%,rgba(11,21,38,.78) 68%,rgba(7,13,24,.92) 100%)",
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "repeating-linear-gradient(0deg,rgba(0,0,0,.18) 0 2px,rgba(0,0,0,0) 2px 5px)",
                opacity: 0.45,
              }}
            />

            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: 340,
                display: "grid",
                gridTemplateColumns: "repeat(16,120px)",
                gridAutoRows: 120,
                gap: 4,
                opacity: 0.82,
              }}
            >
              {TITLE_TILES.map((kind, i) => (
                <div key={i}>
                  <Tile kind={kind} scale={1} />
                </div>
              ))}
            </div>
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: 340,
                background: "linear-gradient(180deg,#0a1120 0%,rgba(10,17,32,.6) 42%,rgba(10,17,32,.18) 100%)",
              }}
            />

            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 60,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 26,
              }}
            >
              <div
                style={{
                  fontFamily: BUNGEE,
                  fontSize: 158,
                  lineHeight: 0.82,
                  color: "#ffce3d",
                  textAlign: "center",
                  textShadow: "0 10px 0 #a8410c,0 0 90px rgba(255,154,43,.5)",
                }}
              >
                BOMB BLAST
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
                <div style={{ height: 7, width: 150, background: "#5fd7f2", borderRadius: 4 }} />
                <div style={{ fontFamily: BUNGEE, fontSize: 76, color: "#5fd7f2", letterSpacing: ".26em" }}>ARENA</div>
                <div style={{ height: 7, width: 150, background: "#5fd7f2", borderRadius: 4 }} />
              </div>
              <p style={{ margin: 0, fontSize: 30, color: "#dbe7f7", letterSpacing: ".02em" }}>
                Select game mode to start playing.
              </p>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                  alignItems: "center",
                  marginTop: 4,
                  width: 760,
                }}
              >
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, width: "100%" }}>
                  {MODE_BUTTONS.map((b) => (
                    <div
                      key={b.text}
                      style={{
                        ...modeButton,
                        background: b.bg,
                        border: `4px solid ${b.border}`,
                        color: b.color,
                      }}
                    >
                      {b.text}
                    </div>
                  ))}
                </div>
                <div
                  style={{
                    fontFamily: PIXEL,
                    fontWeight: 700,
                    fontSize: 21,
                    color: "#a8bcd8",
                    letterSpacing: ".04em",
                    marginTop: 2,
                    whiteSpace: "nowrap",
                    textAlign: "center",
                  }}
                >
                  Controls: WASD keys to move, Space to place bombs
                </div>
              </div>
            </div>

            <Abs style={{ left: 130, bottom: 150, zIndex: 3 }}>
              <Guy p={BLUE} scale={2.2} state="idle" facing="right" />
            </Abs>
            <Abs style={{ left: 400, bottom: 96, zIndex: 3 }}>
              <Guy p={RED} scale={1.8} state="walk" facing="right" />
            </Abs>
            <Abs style={{ right: 150, bottom: 150, zIndex: 3 }}>
              <Guy p={PURPLE} scale={2.2} state="win" facing="down" />
            </Abs>
            <Abs style={{ right: 452, bottom: 96, zIndex: 3 }}>
              <Guy p={GREEN} scale={1.8} state="idle" facing="left" />
            </Abs>
            <Abs style={{ left: "50%", bottom: 110, transform: "translateX(-50%)", zIndex: 2 }}>
              <Bomb state="ticking" scale={1.5} />
            </Abs>
          </div>
          </FitWidth>
        </Block>

        {/* 03a TITLE SCREEN — MOBILE */}
        <Block
          title="03a · TITLE / BACK SCREEN · MOBILE PORTRAIT · 390×844"
          assets={[{ id: "asset-title-mobile", name: "bomb-blast-arena-title-mobile-390x844", label: "390×844" }]}
        >
          <FitWidth w={390} h={844}>
          <div
            id="asset-title-mobile"
            style={{
              width: 390,
              height: 844,
              flex: "0 0 auto",
              position: "relative",
              overflow: "hidden",
              borderRadius: 18,
              background: "#0b1526",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                backgroundImage: "url(/image/background.jpg)",
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "radial-gradient(70% 55% at 50% 30%,rgba(11,21,38,.35) 0%,rgba(11,21,38,.78) 68%,rgba(7,13,24,.92) 100%)",
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "repeating-linear-gradient(0deg,rgba(0,0,0,.18) 0 2px,rgba(0,0,0,0) 2px 5px)",
                opacity: 0.45,
              }}
            />

            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: 132,
                display: "grid",
                gridTemplateColumns: "repeat(10,40px)",
                gridAutoRows: 40,
                gap: 4,
                justifyContent: "center",
                opacity: 0.82,
              }}
            >
              {Array.from({ length: 30 }, (_, i) => (
                <div key={i}>
                  <Tile kind={TITLE_TILES[i % TITLE_TILES.length]} scale={0.3333} />
                </div>
              ))}
            </div>
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: 132,
                background: "linear-gradient(180deg,#0a1120 0%,rgba(10,17,32,.6) 42%,rgba(10,17,32,.18) 100%)",
              }}
            />

            <Abs style={{ left: 14, bottom: 96, zIndex: 3 }}>
              <Guy p={BLUE} scale={0.75} state="idle" facing="right" />
            </Abs>
            <Abs style={{ right: 14, bottom: 96, zIndex: 3 }}>
              <Guy p={PURPLE} scale={0.75} state="win" facing="down" />
            </Abs>
            <Abs style={{ left: 159, bottom: 92, zIndex: 2 }}>
              <Bomb state="ticking" scale={0.6} />
            </Abs>

            <div
              style={{
                position: "absolute",
                left: 16,
                right: 16,
                top: 0,
                bottom: 200,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 14,
              }}
            >
              <div
                style={{
                  fontFamily: BUNGEE,
                  fontSize: 84,
                  lineHeight: 0.84,
                  color: "#ffce3d",
                  textAlign: "center",
                  textShadow: "0 6px 0 #a8410c,0 0 44px rgba(255,154,43,.5)",
                }}
              >
                BOMB
                <br />
                BLAST
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ height: 4, width: 40, background: "#5fd7f2", borderRadius: 3 }} />
                <div style={{ fontFamily: BUNGEE, fontSize: 32, color: "#5fd7f2", letterSpacing: ".26em", marginRight: "-.26em" }}>
                  ARENA
                </div>
                <div style={{ height: 4, width: 40, background: "#5fd7f2", borderRadius: 3 }} />
              </div>
              <p style={{ margin: 0, fontSize: 15, color: "#dbe7f7" }}>Select game mode to start playing.</p>

              <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", marginTop: 4 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {MODE_BUTTONS.map((b) => (
                    <div
                      key={b.text}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "11px 8px",
                        borderRadius: 10,
                        fontFamily: PIXEL,
                        fontWeight: 700,
                        fontSize: 14,
                        letterSpacing: ".05em",
                        textAlign: "center",
                        background: b.bg,
                        border: `3px solid ${b.border}`,
                        borderBottomWidth: 8,
                        color: b.color,
                      }}
                    >
                      {b.text}
                    </div>
                  ))}
                </div>
                <p
                  style={{
                    margin: "4px 0 0",
                    textAlign: "center",
                    fontFamily: PIXEL,
                    fontWeight: 700,
                    fontSize: 12,
                    color: "#a8bcd8",
                    letterSpacing: ".04em",
                  }}
                >
                  Use the on-screen pad to move, 💣 to drop bombs
                </p>
              </div>
            </div>
          </div>
          </FitWidth>
        </Block>

        {/* 03b TITLE SCREEN — TABLET */}
        <Block
          title="03b · TITLE / BACK SCREEN · TABLET PORTRAIT · 820×1180"
          assets={[{ id: "asset-title-tablet", name: "bomb-blast-arena-title-tablet-820x1180", label: "820×1180" }]}
        >
          <FitWidth w={820} h={1180}>
          <div
            id="asset-title-tablet"
            style={{
              width: 820,
              height: 1180,
              flex: "0 0 auto",
              position: "relative",
              overflow: "hidden",
              borderRadius: 18,
              background: "#0b1526",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                backgroundImage: "url(/image/background.jpg)",
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "radial-gradient(70% 55% at 50% 30%,rgba(11,21,38,.35) 0%,rgba(11,21,38,.78) 68%,rgba(7,13,24,.92) 100%)",
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "repeating-linear-gradient(0deg,rgba(0,0,0,.18) 0 2px,rgba(0,0,0,0) 2px 5px)",
                opacity: 0.45,
              }}
            />

            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: 240,
                display: "grid",
                gridTemplateColumns: "repeat(12,76px)",
                gridAutoRows: 76,
                gap: 4,
                justifyContent: "center",
                opacity: 0.82,
              }}
            >
              {Array.from({ length: 36 }, (_, i) => (
                <div key={i}>
                  <Tile kind={TITLE_TILES[i % TITLE_TILES.length]} scale={0.6333} />
                </div>
              ))}
            </div>
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: 240,
                background: "linear-gradient(180deg,#0a1120 0%,rgba(10,17,32,.6) 42%,rgba(10,17,32,.18) 100%)",
              }}
            />

            <Abs style={{ left: 40, bottom: 120, zIndex: 3 }}>
              <Guy p={BLUE} scale={1.39} state="idle" facing="right" />
            </Abs>
            <Abs style={{ left: 200, bottom: 70, zIndex: 3 }}>
              <Guy p={RED} scale={1.13} state="walk" facing="right" />
            </Abs>
            <Abs style={{ right: 40, bottom: 120, zIndex: 3 }}>
              <Guy p={PURPLE} scale={1.39} state="win" facing="down" />
            </Abs>
            <Abs style={{ right: 200, bottom: 70, zIndex: 3 }}>
              <Guy p={GREEN} scale={1.13} state="idle" facing="left" />
            </Abs>
            <Abs style={{ left: 353, bottom: 80, zIndex: 2 }}>
              <Bomb state="ticking" scale={0.95} />
            </Abs>

            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                bottom: 340,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 18,
              }}
            >
              <div
                style={{
                  fontFamily: BUNGEE,
                  fontSize: 96,
                  lineHeight: 0.82,
                  color: "#ffce3d",
                  whiteSpace: "nowrap",
                  textShadow: "0 6px 0 #a8410c,0 0 56px rgba(255,154,43,.5)",
                }}
              >
                BOMB BLAST
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ height: 5, width: 94, background: "#5fd7f2", borderRadius: 4 }} />
                <div style={{ fontFamily: BUNGEE, fontSize: 48, color: "#5fd7f2", letterSpacing: ".26em", marginRight: "-.26em" }}>
                  ARENA
                </div>
                <div style={{ height: 5, width: 94, background: "#5fd7f2", borderRadius: 4 }} />
              </div>
              <p style={{ margin: 0, fontSize: 18, color: "#dbe7f7" }}>Select game mode to start playing.</p>

              <div style={{ display: "flex", flexDirection: "column", gap: 12, width: 520, marginTop: 6 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {MODE_BUTTONS.map((b) => (
                    <div
                      key={b.text}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "13px 12px",
                        borderRadius: 10,
                        fontFamily: PIXEL,
                        fontWeight: 700,
                        fontSize: 18,
                        letterSpacing: ".05em",
                        textAlign: "center",
                        background: b.bg,
                        border: `3px solid ${b.border}`,
                        borderBottomWidth: 9,
                        color: b.color,
                      }}
                    >
                      {b.text}
                    </div>
                  ))}
                </div>
                <p
                  style={{
                    margin: "4px 0 0",
                    textAlign: "center",
                    fontFamily: PIXEL,
                    fontWeight: 700,
                    fontSize: 14,
                    color: "#a8bcd8",
                    letterSpacing: ".04em",
                  }}
                >
                  Use the on-screen pad to move, 💣 to drop bombs
                </p>
              </div>
            </div>
          </div>
          </FitWidth>
        </Block>

        {/* 04 MAP SELECT */}
        <Block
          title="04 · MAP_SELECT · mapSelectScreen.tsx · 15×13 previews"
          assets={[{ id: "asset-map-select", name: "bomb-blast-arena-map-select", label: "1280×720" }]}
        >
          <FitWidth w={1280} h={720}>
          <div
            id="asset-map-select"
            style={{ width: 1280, height: 720, flex: "0 0 auto", position: "relative", overflow: "hidden", borderRadius: 14, background: "#0b1526" }}
          >
            <div style={{ position: "absolute", inset: 0, backgroundImage: "url(/image/background.jpg)", backgroundSize: "cover", backgroundPosition: "center" }} />
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 16,
                backdropFilter: "blur(3px)",
                background: "radial-gradient(70% 55% at 50% 30%,rgba(11,21,38,.55) 0%,rgba(7,13,24,.9) 100%)",
              }}
            >
              <div
                style={{
                  width: 720,
                  boxSizing: "border-box",
                  padding: 28,
                  color: "#e8f0fb",
                  borderRadius: 18,
                  border: "2px solid rgba(124,196,255,.24)",
                  background: "linear-gradient(180deg,#16233f,#0c1526)",
                  boxShadow: "0 24px 60px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.07)",
                }}
              >
                <div style={{ marginBottom: 24, textAlign: "center" }}>
                  <div style={{ fontFamily: BUNGEE, fontSize: 34, lineHeight: 0.95, letterSpacing: ".01em", color: "#ffce3d", textShadow: "0 3px 0 #a8410c,0 0 22px rgba(255,154,43,.4)" }}>
                    SELECT MAP
                  </div>
                  <p style={{ margin: "10px 0 0", fontSize: 14, color: "#8fa6c9" }}>Breakable blocks are placed randomly each game</p>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 16 }}>
                  {MAP_PREVIEWS.map((m) => (
                    <div
                      key={m.name}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 8,
                        padding: "12px 18px",
                        fontSize: 14,
                        color: "#e8f0fb",
                        background: "#18274a",
                        border: "3px solid #0b1526",
                        borderBottomWidth: 7,
                        borderRadius: 10,
                        boxShadow: "0 8px 14px rgba(0,0,0,.45),inset 0 3px 0 rgba(255,255,255,.28)",
                      }}
                    >
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(15,6px)", border: "2px solid #0b1526", borderRadius: 6, overflow: "hidden" }}>
                        {m.cells.map((color, i) => (
                          <div key={i} style={{ width: 6, height: 6, background: color }} />
                        ))}
                      </div>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{m.name}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
                  <div
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "10px 18px",
                      color: "#e8f0fb", background: "#18274a", border: "3px solid #0b1526", borderBottomWidth: 7, borderRadius: 10,
                      boxShadow: "0 8px 14px rgba(0,0,0,.45),inset 0 3px 0 rgba(255,255,255,.28)",
                    }}
                  >
                    <span style={{ fontSize: 18, fontWeight: 700, color: "#ffce3d" }}>?</span>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>Random Preset</span>
                  </div>
                  <div
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "10px 18px",
                      color: "#e8f0fb", background: "#18274a", border: "3px solid #0b1526", borderBottomWidth: 7, borderRadius: 10,
                      boxShadow: "0 8px 14px rgba(0,0,0,.45),inset 0 3px 0 rgba(255,255,255,.28)",
                    }}
                  >
                    <span style={{ fontSize: 18, fontWeight: 700, color: "#ffce3d" }}>⚄</span>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>Generate Random Map</span>
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <div
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center", padding: "10px 18px",
                      fontFamily: PIXEL, letterSpacing: ".05em", fontWeight: 700, fontSize: 17, color: "#fff",
                      background: "#5d6f8f", border: "3px solid #2b3648", borderBottomWidth: 8, borderRadius: 10,
                      boxShadow: "0 9px 14px rgba(0,0,0,.45),inset 0 3px 0 rgba(255,255,255,.28)",
                    }}
                  >
                    Back
                  </div>
                </div>
              </div>
            </div>
          </div>
          </FitWidth>
        </Block>

        {/* 05 LOBBY HOST + 05a SOLO LOBBY */}
        {LOBBY_VARIANTS.map((v) => (
        <Block
          key={v.id}
          title={v.title}
          assets={[{ id: v.id, name: v.name, label: "1280×720" }]}
        >
          <FitWidth w={1280} h={720}>
          <div
            id={v.id}
            style={{ width: 1280, height: 720, flex: "0 0 auto", position: "relative", overflow: "hidden", borderRadius: 14, background: "#0b1526" }}
          >
            <div style={{ position: "absolute", inset: 0, backgroundImage: "url(/image/background.jpg)", backgroundSize: "cover", backgroundPosition: "center" }} />
            <div
              style={{
                position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
                backdropFilter: "blur(3px)", background: "radial-gradient(70% 55% at 50% 30%,rgba(11,21,38,.55) 0%,rgba(7,13,24,.9) 100%)",
              }}
            >
              <div
                style={{
                  width: 720, boxSizing: "border-box", padding: 28, color: "#e8f0fb", borderRadius: 18,
                  border: "2px solid rgba(124,196,255,.24)", background: "linear-gradient(180deg,#16233f,#0c1526)",
                  boxShadow: "0 24px 60px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.07)",
                }}
              >
                <div style={{ marginBottom: 24, textAlign: "center" }}>
                  <div style={{ fontFamily: BUNGEE, fontSize: 34, lineHeight: 0.95, letterSpacing: ".01em", color: "#5fd7f2", textShadow: "0 3px 0 #0f5f73,0 0 22px rgba(95,215,242,.4)" }}>
                    {v.solo ? "SOLO" : "MULTIPLAYER"}
                  </div>
                  <p style={{ margin: "10px 0 0", fontSize: 14, color: "#8fa6c9" }}>
                    {v.solo ? "Choose how many bots to play against" : "Room lobby"}
                  </p>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  {!v.solo && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                    <span style={kicker}>Room Code</span>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 12, padding: "8px 20px", background: "#0a1120", border: "2px solid rgba(124,196,255,.24)", borderRadius: 10 }}>
                      <span style={{ fontSize: 36, fontWeight: 700, letterSpacing: ".3em", paddingLeft: ".3em", color: "#ffce3d" }}>BLST</span>
                      <span style={kicker}>Copy</span>
                    </div>
                  </div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <span style={kicker}>Players ({v.players.length}/4)</span>
                        {v.players.map((p) => (
                          <div
                            key={p.name}
                            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "8px 12px", borderRadius: 12, background: "rgba(255,255,255,.04)", border: `1px ${p.bot ? "dashed" : "solid"} rgba(124,196,255,.14)` }}
                          >
                            <span style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
                              <span style={{ width: 12, height: 12, borderRadius: "50%", boxShadow: "0 0 0 2px rgba(0,0,0,.35)", background: p.color }} />
                              {p.name}
                              {p.isHost && <span style={{ ...kicker, color: "#ffce3d" }}>Host</span>}
                              {p.bot && <span style={kicker}>Bot</span>}
                            </span>
                            <span style={kicker}>Slot {p.slot}</span>
                          </div>
                        ))}
                      </div>
                      {!v.solo && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <span style={kicker}>Spectators (1/8)</span>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "8px 12px", borderRadius: 12, background: "rgba(255,255,255,.04)", border: "1px solid rgba(124,196,255,.14)" }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
                            <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#94a3b8", boxShadow: "0 0 0 2px rgba(0,0,0,.35)" }} />
                            Ghost
                          </span>
                          <span style={kicker}>Watching</span>
                        </div>
                      </div>
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {/* Bots picker (Segmented in ui.tsx): 0..free slots in
                          multiplayer, 1..3 in solo. */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <span style={kicker}>Bots</span>
                        <div style={{ display: "flex", padding: 4, borderRadius: 10, background: "#0a1120", border: "1px solid rgba(124,196,255,.24)" }}>
                          {v.botOptions.map((n) => (
                            <span
                              key={n}
                              style={{
                                ...kicker, flex: 1, minHeight: 36, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8,
                                ...(n === v.bots ? { background: "#5fd7f2", color: "#0a1120" } : null),
                              }}
                            >
                              {n}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "center", padding: "13px 18px",
                          fontFamily: PIXEL, letterSpacing: ".05em", fontWeight: 700, fontSize: 20, color: "#0a0a0a",
                          background: "#4ade80", border: "3px solid #166534", borderBottomWidth: 9, borderRadius: 10,
                          boxShadow: "0 10px 14px rgba(0,0,0,.45),inset 0 3px 0 rgba(255,255,255,.28)",
                        }}
                      >
                        Start Game
                      </div>
                      {!v.solo && (
                      <div
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "center", padding: "6px 18px",
                          fontFamily: PIXEL, letterSpacing: ".05em", fontWeight: 700, fontSize: 14, color: "#fff",
                          background: "#ef4444", border: "2px solid #991b1b", borderBottomWidth: 6, borderRadius: 8,
                          boxShadow: "0 8px 14px rgba(0,0,0,.45),inset 0 3px 0 rgba(255,255,255,.28)",
                        }}
                      >
                        Leave Room
                      </div>
                      )}
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: 20, textAlign: "center" }}>
                  <span style={{ fontSize: 14, color: "#8fa6c9" }}>← Back to menu</span>
                </div>
              </div>
            </div>
          </div>
          </FitWidth>
        </Block>
        ))}

        {/* 06 PLAYING HUD */}
        <Block
          title="06 · PLAYING · gameHud.tsx + playerHud.tsx + AudioController.tsx"
          assets={[{ id: "asset-playing", name: "bomb-blast-arena-playing", label: "1280×720" }]}
        >
          <FitWidth w={1280} h={720}>
          <div
            id="asset-playing"
            style={{ width: 1280, height: 720, flex: "0 0 auto", position: "relative", overflow: "hidden", borderRadius: 14, background: "#0b1526" }}
          >
            <div style={{ position: "absolute", inset: 0, backgroundImage: "url(/image/background.jpg)", backgroundSize: "cover", backgroundPosition: "center" }} />
            <div style={{ position: "absolute", left: 325, top: 92, width: 630, height: 546, background: "#0a1120", boxShadow: "0 20px 50px rgba(0,0,0,.55)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(15,42px)", gridAutoRows: 42 }}>
                {PLAY_BOARD.map((k, i) => (
                  <div key={i}><Tile kind={k} scale={0.35} /></div>
                ))}
              </div>
              <Abs style={{ left: 252, top: 126 }}><Powerup kind="extraBomb" scale={0.35} /></Abs>
              <Abs style={{ left: 126, top: 294 }}><Powerup kind="increaseRange" scale={0.35} /></Abs>
              <Abs style={{ left: 168, top: 42 }}><Bomb state="ticking" scale={0.35} /></Abs>
              <Abs style={{ left: 378, top: 210, zIndex: 3 }}><Bomb state="explode" range={2} scale={0.35} /></Abs>
              <Abs style={{ left: 126, top: 42, zIndex: 4 }}><Guy p={BLUE} scale={0.35} state="walk" facing="left" /></Abs>
              <Abs style={{ left: 546, top: 126, zIndex: 4 }}><Guy p={RED} scale={0.35} state="idle" facing="down" /></Abs>
              <Abs style={{ left: 462, top: 378, zIndex: 4 }}><Guy p={PURPLE} scale={0.35} state="walk" facing="left" /></Abs>
            </div>

            <div
              style={{
                position: "absolute", left: "50%", top: 16, transform: "translateX(-50%)", minWidth: 160, boxSizing: "border-box",
                padding: "8px 12px", borderRadius: 12, textAlign: "center", background: "rgba(10,17,32,.78)", backdropFilter: "blur(6px)",
                border: "2px solid rgba(124,196,255,.24)", boxShadow: "0 8px 22px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.06)",
              }}
            >
              <div style={{ marginBottom: 8 }}>
                <div style={{ ...kicker, marginBottom: 2 }}>Time remaining</div>
                <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "#4ade80" }}>01:34</div>
              </div>
              <div style={{ height: 8, borderRadius: 4, overflow: "hidden", background: "rgba(124,196,255,.18)" }}>
                <div style={{ height: "100%", borderRadius: 4, width: "52%", background: "#4ade80" }} />
              </div>
            </div>

            <HudPanel corner="tl" p={HUD_PLAYERS[0]} />
            <HudPanel corner="tr" p={HUD_PLAYERS[1]} />
            <HudPanel corner="bl" p={HUD_PLAYERS[2]} />
            <HudPanel corner="br" p={HUD_PLAYERS[3]} />

            <div
              style={{
                position: "absolute", left: "50%", bottom: 16, transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 12,
                padding: "8px 16px", borderRadius: 999, background: "rgba(10,17,32,.78)", backdropFilter: "blur(6px)",
                border: "2px solid rgba(124,196,255,.24)", boxShadow: "0 8px 22px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.06)",
              }}
            >
              <span style={{ fontSize: 20 }}>💥</span>
              <span style={{ fontSize: 20 }}>🔊</span>
              <div style={{ position: "relative", width: 96, height: 6, borderRadius: 3, background: "rgba(124,196,255,.25)" }}>
                <div style={{ position: "absolute", left: 40, top: -5, width: 16, height: 16, boxSizing: "border-box", borderRadius: "50%", background: "#ffce3d", border: "2px solid #a8410c" }} />
              </div>
              <span style={{ width: 36, textAlign: "right", fontFamily: MONO, fontSize: 11, fontWeight: 700, color: "#8fa6c9" }}>50%</span>
            </div>
          </div>
          </FitWidth>
        </Block>

        {/* 07 PAUSED */}
        <Block
          title="07 · PAUSED · pauseScreen.tsx"
          assets={[{ id: "asset-paused", name: "bomb-blast-arena-paused", label: "1280×720" }]}
        >
          <FitWidth w={1280} h={720}>
          <div
            id="asset-paused"
            style={{ width: 1280, height: 720, flex: "0 0 auto", position: "relative", overflow: "hidden", borderRadius: 14, background: "#0b1526" }}
          >
            <div style={{ position: "absolute", inset: 0, backgroundImage: "url(/image/background.jpg)", backgroundSize: "cover", backgroundPosition: "center" }} />
            <div style={{ position: "absolute", left: 325, top: 92, width: 630, height: 546, background: "#0a1120" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(15,42px)", gridAutoRows: 42 }}>
                {PLAY_BOARD.map((k, i) => (
                  <div key={i}><Tile kind={k} scale={0.35} /></div>
                ))}
              </div>
            </div>
            <div
              style={{
                position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
                backdropFilter: "blur(3px)", background: "radial-gradient(70% 55% at 50% 30%,rgba(11,21,38,.55) 0%,rgba(7,13,24,.9) 100%)",
              }}
            >
              <div
                style={{
                  width: 460, boxSizing: "border-box", padding: 28, color: "#e8f0fb", borderRadius: 18,
                  border: "2px solid rgba(124,196,255,.24)", background: "linear-gradient(180deg,#16233f,#0c1526)",
                  boxShadow: "0 24px 60px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.07)",
                }}
              >
                <div style={{ marginBottom: 24, textAlign: "center" }}>
                  <div style={{ fontFamily: BUNGEE, fontSize: 34, lineHeight: 0.95, letterSpacing: ".01em", color: "#5fd7f2", textShadow: "0 3px 0 #0f5f73,0 0 22px rgba(95,215,242,.4)" }}>
                    PAUSED
                  </div>
                  <p style={{ margin: "10px 0 0", fontSize: 14, color: "#8fa6c9" }}>Game is currently paused</p>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center", padding: "13px 18px",
                      fontFamily: PIXEL, letterSpacing: ".05em", fontWeight: 700, fontSize: 20, color: "#0a0a0a",
                      background: "#4ade80", border: "3px solid #166534", borderBottomWidth: 9, borderRadius: 10,
                      boxShadow: "0 10px 14px rgba(0,0,0,.45),inset 0 3px 0 rgba(255,255,255,.28)",
                    }}
                  >
                    Resume Game
                  </div>
                  <div
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center", padding: "13px 18px",
                      fontFamily: PIXEL, letterSpacing: ".05em", fontWeight: 700, fontSize: 20, color: "#fff",
                      background: "#5d6f8f", border: "3px solid #2b3648", borderBottomWidth: 9, borderRadius: 10,
                      boxShadow: "0 10px 14px rgba(0,0,0,.45),inset 0 3px 0 rgba(255,255,255,.28)",
                    }}
                  >
                    Main Menu
                  </div>
                </div>
                <p style={{ margin: "24px 0 0", fontSize: 12, color: "#8fa6c9", textAlign: "center" }}>WASD to move · Space to place bombs · ESC to pause/resume</p>
              </div>
            </div>
          </div>
          </FitWidth>
        </Block>

        {/* 07a PAUSED — MOBILE */}
        <Block
          title="07a · PAUSED · MOBILE PORTRAIT · buttons stack · 390×844"
          assets={[{ id: "asset-paused-mobile", name: "bomb-blast-arena-paused-mobile-390x844", label: "390×844" }]}
        >
          <FitWidth w={390} h={844}>
          <div
            id="asset-paused-mobile"
            style={{ width: 390, height: 844, flex: "0 0 auto", position: "relative", overflow: "hidden", borderRadius: 18, background: "#0b1526" }}
          >
            <div style={{ position: "absolute", inset: 0, backgroundImage: "url(/image/background.jpg)", backgroundSize: "cover", backgroundPosition: "center" }} />
            <div style={{ position: "absolute", left: 15, top: 170, width: 360, height: 312, background: "#0a1120" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(15,24px)", gridAutoRows: 24 }}>
                {PLAY_BOARD.map((k, i) => (
                  <div key={i}><Tile kind={k} scale={0.2} /></div>
                ))}
              </div>
            </div>
            <div
              style={{
                position: "absolute", inset: 0, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
                backdropFilter: "blur(3px)", background: "radial-gradient(70% 55% at 50% 30%,rgba(11,21,38,.55) 0%,rgba(7,13,24,.9) 100%)",
              }}
            >
              <div
                style={{
                  width: "100%", boxSizing: "border-box", padding: 28, color: "#e8f0fb", borderRadius: 18,
                  border: "2px solid rgba(124,196,255,.24)", background: "linear-gradient(180deg,#16233f,#0c1526)",
                  boxShadow: "0 24px 60px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.07)",
                }}
              >
                <div style={{ marginBottom: 24, textAlign: "center" }}>
                  <div style={{ fontFamily: BUNGEE, fontSize: 26, lineHeight: 0.95, color: "#5fd7f2", textShadow: "0 3px 0 #0f5f73,0 0 22px rgba(95,215,242,.4)" }}>
                    PAUSED
                  </div>
                  <p style={{ margin: "10px 0 0", fontSize: 14, color: "#8fa6c9" }}>Game is currently paused</p>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
                  <div
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center", padding: "13px 18px",
                      fontFamily: PIXEL, letterSpacing: ".05em", fontWeight: 700, fontSize: 20, color: "#0a0a0a",
                      background: "#4ade80", border: "3px solid #166534", borderBottomWidth: 9, borderRadius: 10,
                      boxShadow: "0 10px 14px rgba(0,0,0,.45),inset 0 3px 0 rgba(255,255,255,.28)",
                    }}
                  >
                    Resume Game
                  </div>
                  <div
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center", padding: "13px 18px",
                      fontFamily: PIXEL, letterSpacing: ".05em", fontWeight: 700, fontSize: 20, color: "#fff",
                      background: "#5d6f8f", border: "3px solid #2b3648", borderBottomWidth: 9, borderRadius: 10,
                      boxShadow: "0 10px 14px rgba(0,0,0,.45),inset 0 3px 0 rgba(255,255,255,.28)",
                    }}
                  >
                    Main Menu
                  </div>
                </div>
                <p style={{ margin: "24px 0 0", fontSize: 12, color: "#8fa6c9", textAlign: "center" }}>ESC to pause/resume</p>
              </div>
            </div>
          </div>
          </FitWidth>
        </Block>

        {/* 08 VICTORY */}
        <Block
          title="08 · WIN · endScreen.tsx · local match, own card"
          assets={[{ id: "asset-victory", name: "bomb-blast-arena-victory", label: "1280×720" }]}
        >
          <FitWidth w={1280} h={720}>
          <div
            id="asset-victory"
            style={{ width: 1280, height: 720, flex: "0 0 auto", position: "relative", overflow: "hidden", borderRadius: 14, background: "#0b1526" }}
          >
            <div style={{ position: "absolute", inset: 0, backgroundImage: "url(/image/background.jpg)", backgroundSize: "cover", backgroundPosition: "center" }} />
            <div
              style={{
                position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
                backdropFilter: "blur(3px)", background: "radial-gradient(70% 55% at 50% 30%,rgba(11,21,38,.55) 0%,rgba(7,13,24,.9) 100%)",
              }}
            >
              <div
                style={{
                  width: 640, boxSizing: "border-box", padding: 28, color: "#e8f0fb", borderRadius: 18,
                  border: "2px solid rgba(124,196,255,.24)", background: "linear-gradient(180deg,#16233f,#0c1526)",
                  boxShadow: "0 24px 60px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.07)",
                }}
              >
                <div style={{ marginBottom: 24, textAlign: "center" }}>
                  <div style={{ fontFamily: BUNGEE, fontSize: 34, lineHeight: 0.95, letterSpacing: ".01em", color: "#6ff0a0", textShadow: "0 3px 0 #14663a,0 0 22px rgba(74,222,128,.4)" }}>
                    VICTORY!
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, margin: "-8px 0 24px" }}>
                  <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#60a5fa", boxShadow: "0 0 0 2px rgba(0,0,0,.35)" }} />
                  <span style={{ fontSize: 20, fontWeight: 700 }}>Fluxpuck Wins!</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24, alignItems: "start" }}>
                  <div style={{ padding: 14, borderRadius: 12, background: "rgba(255,255,255,.04)", border: "1px solid rgba(124,196,255,.14)" }}>
                    <div style={{ ...kicker, marginBottom: 10, paddingBottom: 8, borderBottom: "1px solid rgba(124,196,255,.16)" }}>Game Statistics</div>
                    <Row label="Time Played" value="2:07" />
                    <Row label="Bombs Placed" value={41} />
                    <Row label="Blocks Destroyed" value={63} />
                    <Row label="Total Kills" value={3} />
                  </div>
                  <div style={{ padding: 14, borderRadius: 12, background: "rgba(255,255,255,.04)", border: "1px solid rgba(124,196,255,.14)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, paddingBottom: 8, borderBottom: "1px solid rgba(124,196,255,.16)" }}>
                      <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#60a5fa", boxShadow: "0 0 0 2px rgba(0,0,0,.35)" }} />
                      <span style={kicker}>Fluxpuck Stats</span>
                    </div>
                    <Row label="Score" value={620} />
                    <Row label="Lives Left" value={2} />
                    <Row label="Bombs Placed" value={17} />
                    <Row label="Blocks Destroyed" value={28} />
                    <Row label="Kills" value={2} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
                  <div
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center", padding: "10px 18px",
                      fontFamily: PIXEL, letterSpacing: ".05em", fontWeight: 700, fontSize: 17, color: "#0a0a0a",
                      background: "#4ade80", border: "3px solid #166534", borderBottomWidth: 8, borderRadius: 10,
                      boxShadow: "0 9px 14px rgba(0,0,0,.45),inset 0 3px 0 rgba(255,255,255,.28)",
                    }}
                  >
                    Play Again
                  </div>
                  <div
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center", padding: "10px 18px",
                      fontFamily: PIXEL, letterSpacing: ".05em", fontWeight: 700, fontSize: 17, color: "#fff",
                      background: "#5d6f8f", border: "3px solid #2b3648", borderBottomWidth: 8, borderRadius: 10,
                      boxShadow: "0 9px 14px rgba(0,0,0,.45),inset 0 3px 0 rgba(255,255,255,.28)",
                    }}
                  >
                    Main Menu
                  </div>
                </div>
              </div>
            </div>
          </div>
          </FitWidth>
        </Block>

        {/* 09 GAME OVER (spectator) */}
        <Block
          title="09 · GAME_OVER · online spectator · endScreen.tsx"
          assets={[{ id: "asset-gameover", name: "bomb-blast-arena-game-over", label: "1280×720" }]}
        >
          <FitWidth w={1280} h={720}>
          <div
            id="asset-gameover"
            style={{ width: 1280, height: 720, flex: "0 0 auto", position: "relative", overflow: "hidden", borderRadius: 14, background: "#0b1526" }}
          >
            <div style={{ position: "absolute", inset: 0, backgroundImage: "url(/image/background.jpg)", backgroundSize: "cover", backgroundPosition: "center" }} />
            <div
              style={{
                position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
                backdropFilter: "blur(3px)", background: "radial-gradient(70% 55% at 50% 30%,rgba(11,21,38,.55) 0%,rgba(7,13,24,.9) 100%)",
              }}
            >
              <div
                style={{
                  width: 780, boxSizing: "border-box", padding: "24px 28px", color: "#e8f0fb", borderRadius: 18,
                  border: "2px solid rgba(124,196,255,.24)", background: "linear-gradient(180deg,#16233f,#0c1526)",
                  boxShadow: "0 24px 60px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.07)",
                }}
              >
                <div style={{ marginBottom: 24, textAlign: "center" }}>
                  <div style={{ fontFamily: BUNGEE, fontSize: 34, lineHeight: 0.95, letterSpacing: ".01em", color: "#ff7b7b", textShadow: "0 3px 0 #8e1f1f,0 0 22px rgba(239,68,68,.45)" }}>
                    GAME OVER
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, margin: "-8px 0 20px" }}>
                  <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#a78bfa", boxShadow: "0 0 0 2px rgba(0,0,0,.35)" }} />
                  <span style={{ fontSize: 20, fontWeight: 700 }}>Rook Wins!</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 3fr", gap: 16, marginBottom: 20, alignItems: "start" }}>
                  <div style={{ padding: 14, borderRadius: 12, background: "rgba(255,255,255,.04)", border: "1px solid rgba(124,196,255,.14)" }}>
                    <div style={{ ...kicker, marginBottom: 10, paddingBottom: 8, borderBottom: "1px solid rgba(124,196,255,.16)" }}>Game Statistics</div>
                    <Row label="Time Played" value="3:00" />
                    <Row label="Bombs Placed" value={88} />
                    <Row label="Blocks Destroyed" value={102} />
                    <Row label="Total Kills" value={3} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    {END_CARDS.map((c) => (
                      <div key={c.name} style={{ padding: "10px 12px", borderRadius: 12, background: "rgba(255,255,255,.04)", border: "1px solid rgba(124,196,255,.14)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, paddingBottom: 6, borderBottom: "1px solid rgba(124,196,255,.16)" }}>
                          <span style={{ width: 12, height: 12, borderRadius: "50%", flex: "0 0 auto", boxShadow: "0 0 0 2px rgba(0,0,0,.35)", background: c.color }} />
                          <span style={kicker}>{c.name} Stats</span>
                        </div>
                        <Row label="Score" value={c.score} />
                        <Row label="Lives Left" value={c.lives} />
                        <Row label="Bombs Placed" value={c.bombs} />
                        <Row label="Blocks Destroyed" value={c.blocks} />
                        <Row label="Kills" value={c.kills} />
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
                  <div
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center", padding: "10px 18px",
                      fontFamily: PIXEL, letterSpacing: ".05em", fontWeight: 700, fontSize: 17, color: "#0a0a0a",
                      background: "#4ade80", border: "3px solid #166534", borderBottomWidth: 8, borderRadius: 10,
                      filter: "grayscale(.7) brightness(.8)", opacity: 0.6,
                    }}
                  >
                    Return to Lobby
                  </div>
                  <div
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center", padding: "10px 18px",
                      fontFamily: PIXEL, letterSpacing: ".05em", fontWeight: 700, fontSize: 17, color: "#fff",
                      background: "#5d6f8f", border: "3px solid #2b3648", borderBottomWidth: 8, borderRadius: 10,
                      boxShadow: "0 9px 14px rgba(0,0,0,.45),inset 0 3px 0 rgba(255,255,255,.28)",
                    }}
                  >
                    Main Menu
                  </div>
                </div>
                <p style={{ margin: "12px 0 0", fontSize: 12, color: "#8fa6c9", textAlign: "center" }}>Waiting for the host to return to the lobby…</p>
              </div>
            </div>
          </div>
          </FitWidth>
        </Block>

        {/* 09a GAME OVER — MOBILE */}
        <Block
          title="09a · GAME_OVER · MOBILE PORTRAIT · 2-up cards, 3 rows · 390×844"
          assets={[{ id: "asset-gameover-mobile", name: "bomb-blast-arena-game-over-mobile-390x844", label: "390×844" }]}
        >
          <FitWidth w={390} h={844}>
          <div
            id="asset-gameover-mobile"
            style={{ width: 390, height: 844, flex: "0 0 auto", position: "relative", overflow: "hidden", borderRadius: 18, background: "#0b1526" }}
          >
            <div style={{ position: "absolute", inset: 0, backgroundImage: "url(/image/background.jpg)", backgroundSize: "cover", backgroundPosition: "center" }} />
            <div
              style={{
                position: "absolute", inset: 0, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
                backdropFilter: "blur(3px)", background: "radial-gradient(70% 55% at 50% 30%,rgba(11,21,38,.55) 0%,rgba(7,13,24,.9) 100%)",
              }}
            >
              <div
                style={{
                  width: "100%", boxSizing: "border-box", padding: 20, color: "#e8f0fb", borderRadius: 18,
                  border: "2px solid rgba(124,196,255,.24)", background: "linear-gradient(180deg,#16233f,#0c1526)",
                  boxShadow: "0 24px 60px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.07)",
                }}
              >
                <div style={{ marginBottom: 16, textAlign: "center", fontFamily: BUNGEE, fontSize: 26, lineHeight: 0.95, color: "#ff7b7b", textShadow: "0 3px 0 #8e1f1f,0 0 22px rgba(239,68,68,.45)" }}>
                  GAME OVER
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 16 }}>
                  <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#a78bfa" }} />
                  <span style={{ fontSize: 20, fontWeight: 700 }}>Rook Wins!</span>
                </div>
                <div style={{ padding: "12px 14px", borderRadius: 12, background: "rgba(255,255,255,.04)", border: "1px solid rgba(124,196,255,.14)", marginBottom: 12 }}>
                  <div style={{ ...kicker, marginBottom: 8, paddingBottom: 6, borderBottom: "1px solid rgba(124,196,255,.16)" }}>Game Statistics</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 16px" }}>
                    <Row label="Time" value="3:00" />
                    <Row label="Bombs" value={88} />
                    <Row label="Blocks" value={102} />
                    <Row label="Kills" value={3} />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
                  {END_CARDS.map((c) => (
                    <div key={c.name} style={{ padding: 10, borderRadius: 12, background: "rgba(255,255,255,.04)", border: "1px solid rgba(124,196,255,.14)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, paddingBottom: 6, borderBottom: "1px solid rgba(124,196,255,.16)" }}>
                        <span style={{ width: 10, height: 10, borderRadius: "50%", flex: "0 0 auto", background: c.color }} />
                        <span style={{ ...kicker, fontSize: 11 }}>{c.name}</span>
                      </div>
                      <Row label="Score" value={c.score} />
                      <Row label="Lives Left" value={c.lives} />
                      <Row label="Kills" value={c.kills} />
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center", padding: "10px 16px",
                      fontFamily: PIXEL, letterSpacing: ".05em", fontWeight: 700, fontSize: 17, color: "#0a0a0a",
                      background: "#4ade80", border: "3px solid #166534", borderBottomWidth: 8, borderRadius: 10,
                      filter: "grayscale(.7) brightness(.8)", opacity: 0.6,
                    }}
                  >
                    Return to Lobby
                  </div>
                  <div
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center", padding: "10px 16px",
                      fontFamily: PIXEL, letterSpacing: ".05em", fontWeight: 700, fontSize: 17, color: "#fff",
                      background: "#5d6f8f", border: "3px solid #2b3648", borderBottomWidth: 8, borderRadius: 10,
                      boxShadow: "0 9px 14px rgba(0,0,0,.45),inset 0 3px 0 rgba(255,255,255,.28)",
                    }}
                  >
                    Main Menu
                  </div>
                </div>
                <p style={{ margin: "12px 0 0", fontSize: 12, color: "#8fa6c9", textAlign: "center" }}>Waiting for the host to return to the lobby…</p>
              </div>
            </div>
          </div>
          </FitWidth>
        </Block>

        {/* 10 ICONS + CAPSULE */}
        <Block
          title="10 · APP ICON · 180 / 96 / 48 / 32 (scales cleanly to 512 / 128 / 32 / 16)"
          assets={[
            { id: "asset-icon-180", name: "bomb-blast-arena-icon-180", label: "icon 180" },
            { id: "asset-icon-96", name: "bomb-blast-arena-icon-96", label: "96" },
            { id: "asset-icon-48", name: "bomb-blast-arena-icon-48", label: "48" },
            { id: "asset-icon-32", name: "bomb-blast-arena-icon-32", label: "32" },
            { id: "asset-capsule", name: "bomb-blast-arena-capsule-460x215", label: "capsule 460×215" },
          ]}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 22, alignItems: "flex-end" }}>
            <BombIcon id="asset-icon-180" size={180} radius={38} offset={[24, 22]} scale={1.12} background={iconGround} />
            <BombIcon id="asset-icon-96" size={96} radius={20} offset={[13, 12]} scale={0.6} background={iconGround} />
            <BombIcon id="asset-icon-48" size={48} radius={10} offset={[6, 6]} scale={0.3} background={iconGround} />
            <BombIcon id="asset-icon-32" size={32} radius={7} offset={[4, 4]} scale={0.2} background="#ff9a2b" />

            <FitWidth w={460} h={215}>
            <div
              id="asset-capsule"
              style={{
                width: 460,
                height: 215,
                boxSizing: "border-box",
                flex: "0 0 auto",
                position: "relative",
                overflow: "hidden",
                borderRadius: 12,
                background: "linear-gradient(150deg,#1b2f55 0%,#0a1120 70%)",
                display: "flex",
                alignItems: "center",
                padding: "0 30px",
                gap: 22,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  right: -40,
                  top: -40,
                  width: 300,
                  height: 300,
                  borderRadius: "50%",
                  background: "radial-gradient(circle,rgba(255,154,43,.28) 0%,rgba(255,154,43,0) 62%)",
                }}
              />
              <div
                style={{
                  position: "relative",
                  zIndex: 2,
                  fontFamily: BUNGEE,
                  fontSize: 42,
                  lineHeight: 0.86,
                  color: "#ffce3d",
                  textShadow: "0 4px 0 #a8410c",
                }}
              >
                BOMB
                <br />
                BLAST
                <br />
                <span style={{ fontSize: 24, color: "#5fd7f2", letterSpacing: ".2em" }}>ARENA</span>
              </div>
              <div style={{ position: "relative", zIndex: 2, marginLeft: "auto" }}>
                <Guy p={BLUE} scale={1.25} state="idle" facing="left" />
              </div>
            </div>
            </FitWidth>
            <div style={caption}>icon drops the wordmark; store capsule keeps it · 460×215</div>
          </div>
        </Block>
      </section>
    </div>
  );
}
