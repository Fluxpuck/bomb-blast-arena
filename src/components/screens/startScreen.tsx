import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { GameMode } from "../../types/game";
import { InstanceLobby } from "../../types/multiplayer";
import { Bomb, Bomber, Tile, type TileKind } from "../sprites";
import { isTouchDevice } from "../touchControls";
import { Button, cx, type ButtonVariant } from "../ui";

interface StartScreenProps {
  onStart: (mode: GameMode) => void;
  onMultiplayer: () => void;
  /** Lobbies hosted in the same Discord Activity (empty outside Discord). */
  lobbies?: InstanceLobby[];
  onJoinLobby?: (code: string) => void;
}

const BUNGEE = "var(--font-bungee), 'Bungee', sans-serif";
const PIXEL = "'Courier New', Courier, monospace";

// Button colour per game mode
const modeVariant: Record<GameMode, ButtonVariant> = {
  "2 players": "blue",
  "3 players": "orange",
  "4 players": "red",
  online: "purple",
};

const gameModes: GameMode[] = ["2 players", "3 players", "4 players"];

const BLUE = { accent: "#60a5fa", dark: "#1e3a8a", light: "#cfe8ff" };
const RED = { accent: "#ef4444", dark: "#991b1b", light: "#ffd3cf" };
const PURPLE = { accent: "#a78bfa", dark: "#5b21b6", light: "#ecd4ff" };
const GREEN = { accent: "#4ade80", dark: "#166534", light: "#d8ffe6" };

// Decorative floor strip along the bottom edge; repeats to fill the width.
const TILE_PATTERN: TileKind[] = [
  "crate", "wall", "floor", "barrel", "floor", "crate", "floor", "wall",
  "floor", "crate", "floor", "barrel", "floor", "wall", "floor", "crate",
];
const TILE_ROWS = 3;

// Once the layout unit's per-element floors are reached, the whole title +
// menu column shrinks to fit short viewports — down to this factor, below
// which it clips instead of becoming unreadable.
const MIN_MENU_SCALE = 0.5;
const MENU_BOTTOM_MARGIN = 12;

interface Viewport {
  /** 1 = the 1920x1080 design artboard. Bound by height, and by width
   *  against the title lockup (~1300 design px wide) so it never overflows. */
  u: number;
  width: number;
  height: number;
  /** Below the sm breakpoint and taller than wide: phones held upright get
   *  their own stacked-title layout instead of the shrunk landscape one. */
  mobilePortrait: boolean;
  /** sm and up, portrait: same layout as landscape, just centred and with
   *  touch-friendly button sizing instead of the shrink-to-fit scale. */
  portrait: boolean;
}

function useViewport(): Viewport | null {
  const [vp, setVp] = useState<Viewport | null>(null);
  useEffect(() => {
    const update = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const portrait = height > width;
      setVp({
        u: Math.min(height / 1080, width / 1300),
        width,
        height,
        portrait,
        mobilePortrait: portrait && width < 640,
      });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return vp;
}

const isTouch = isTouchDevice();

// Fixed touch-target metrics for the mobile-portrait button grid — large
// enough to tap reliably regardless of how small the phone is.
const TOUCH_BUTTON_STYLE = {
  "--bw": "3px",
  "--depth": "5px",
  "--btn-py": "11px",
  "--btn-fs": "16px",
  borderRadius: 10,
} as CSSProperties;

/**
 * "Join Alice's Lobby (2/4)". Mid-match or full, the relay lands the join
 * as a spectator, so the label says "Watch" instead.
 */
export function lobbyButtonLabel(lobby: InstanceLobby): string {
  if (lobby.locked) return `Watch ${lobby.hostName}'s Game`;
  if (lobby.playerCount >= 4) return `Watch ${lobby.hostName}'s Lobby (full)`;
  return `Join ${lobby.hostName}'s Lobby (${lobby.playerCount}/4)`;
}

function Abs({ style, children }: { style: CSSProperties; children: ReactNode }) {
  return <div style={{ position: "absolute", ...style }}>{children}</div>;
}

export function StartScreen({
  onStart,
  onMultiplayer,
  lobbies = [],
  onJoinLobby,
}: StartScreenProps) {
  const vp = useViewport();
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuScale, setMenuScale] = useState(1);

  // Fit the measured menu column inside its available space. Landscape (and
  // tablet portrait) anchor the column near the top, so the budget is the
  // viewport below that offset; mobile portrait centres it in the band above
  // the tile strip, so the budget is the band's own height.
  // offsetTop/offsetHeight are layout values, so the transform itself never
  // feeds back into the measurement.
  useEffect(() => {
    const update = () => {
      const el = menuRef.current;
      if (!el) return;
      const portraitNow = window.innerHeight > window.innerWidth;
      const budget =
        portraitNow && window.innerWidth < 640
          ? window.innerHeight - 132 * Math.min(window.innerHeight / 844, window.innerWidth / 390)
          : window.innerHeight - el.offsetTop;
      setMenuScale(Math.min(1, Math.max(MIN_MENU_SCALE, (budget - MENU_BOTTOM_MARGIN) / el.offsetHeight)));
    };
    update();
    window.addEventListener("resize", update);
    // Late-loading fonts change the column height without a resize.
    const observer = new ResizeObserver(update);
    if (menuRef.current) observer.observe(menuRef.current);
    return () => {
      window.removeEventListener("resize", update);
      observer.disconnect();
    };
  }, [vp]);

  // Measure before painting so the layout doesn't jump from a default size.
  if (vp === null) return <div className="fixed inset-0 z-50" />;
  const { u, width, height, portrait, mobilePortrait } = vp;

  const wide = width >= 700;
  const tile = 120 * u;
  const tileGap = 4;
  const tileCols = Math.ceil(width / (tile + tileGap)) + 1;

  // Size the shared button to the layout unit (see BUTTON_BASE in ui.tsx).
  // Tablet portrait uses the shared "lg" size and mobile portrait a fixed
  // touch-target size instead, both per the PROPOSED responsive spec.
  const buttonSize = {
    "--bw": `${Math.max(2, 4 * u)}px`,
    "--depth": `${Math.max(3, 6 * u)}px`,
    "--btn-py": `${Math.max(8, 11 * u)}px`,
    "--btn-fs": `${Math.max(14, 22 * u)}px`,
    borderRadius: Math.max(8, 12 * u),
  } as CSSProperties;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Vignette + scanlines over the page background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(70% 55% at 50% 30%,rgba(11,21,38,.35) 0%,rgba(11,21,38,.78) 68%,rgba(7,13,24,.92) 100%)",
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "repeating-linear-gradient(0deg,rgba(0,0,0,.18) 0 2px,rgba(0,0,0,0) 2px 5px)",
          opacity: 0.45,
        }}
      />

      {/* Decorative tiles, faded into the ground */}
      <div aria-hidden className="absolute inset-x-0 bottom-0 pointer-events-none overflow-hidden" style={{ height: 340 * u }}>
        <div
          className="grid h-full overflow-hidden"
          style={{
            gridTemplateColumns: `repeat(${tileCols}, ${tile}px)`,
            gridAutoRows: tile,
            gap: tileGap,
            justifyContent: "center",
            alignContent: "end",
            opacity: 0.82,
          }}
        >
          {Array.from({ length: tileCols * TILE_ROWS }, (_, i) => {
            const row = Math.floor(i / tileCols);
            const col = i % tileCols;
            return (
              <Tile key={i} kind={TILE_PATTERN[(col + row * 5) % TILE_PATTERN.length]} scale={u} />
            );
          })}
        </div>
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg,#0a1120 0%,rgba(10,17,32,.6) 42%,rgba(10,17,32,.18) 100%)",
          }}
        />
      </div>

      {/* Title + menu: landscape and tablet-portrait anchor near the top and
          scale with the layout unit; mobile portrait centres a stacked title
          in the band above the tile strip with fixed touch-size buttons. */}
      <div
        className="absolute inset-x-0 flex flex-col items-center"
        style={
          portrait
            ? {
                top: 0,
                bottom: mobilePortrait ? 132 * Math.min(height / 844, width / 390) : 340 * u,
                justifyContent: "center",
              }
            : { top: 60 * u }
        }
      >
        <div
          ref={menuRef}
          className="flex flex-col items-center"
          style={{
            gap: mobilePortrait ? 14 : Math.max(10, 26 * u),
            transform: `scale(${menuScale})`,
            transformOrigin: portrait ? "50% 50%" : "50% 0",
          }}
        >
          <h1
            className={cx("text-center", !mobilePortrait && "whitespace-nowrap")}
            style={{
              fontFamily: BUNGEE,
              fontSize: mobilePortrait ? 84 : 158 * u,
              lineHeight: 0.82,
              color: "#ffce3d",
              textShadow: mobilePortrait
                ? "0 6px 0 #a8410c, 0 0 44px rgba(255,154,43,.5)"
                : `0 ${10 * u}px 0 #a8410c, 0 0 ${90 * u}px rgba(255,154,43,.5)`,
            }}
          >
            {mobilePortrait ? (
              <>
                BOMB
                <br />
                BLAST
              </>
            ) : (
              "BOMB BLAST"
            )}
          </h1>
          <div className="flex items-center" style={{ gap: mobilePortrait ? 12 : 26 * u }}>
            <div style={{ height: mobilePortrait ? 4 : Math.max(3, 7 * u), width: mobilePortrait ? 40 : 150 * u, background: "#5fd7f2", borderRadius: 4 }} />
            <div
              style={{
                fontFamily: BUNGEE,
                fontSize: mobilePortrait ? 32 : 76 * u,
                color: "#5fd7f2",
                letterSpacing: ".26em",
                marginRight: "-.26em",
              }}
            >
              ARENA
            </div>
            <div style={{ height: mobilePortrait ? 4 : Math.max(3, 7 * u), width: mobilePortrait ? 40 : 150 * u, background: "#5fd7f2", borderRadius: 4 }} />
          </div>
          <p
            className="text-center px-4"
            style={{ fontSize: mobilePortrait ? 15 : Math.max(14, 26 * u), color: "#dbe7f7", letterSpacing: ".02em" }}
          >
            Select game mode to start playing.
          </p>

          <div
            className="flex flex-col items-center"
            style={{ gap: mobilePortrait ? 8 : Math.max(8, 12 * u), marginTop: 4, width: "min(520px, 92vw)", maxWidth: 520 }}
          >
            <div
              className="grid grid-cols-3 w-full"
              style={{ gap: mobilePortrait ? 8 : Math.max(8, 14 * u) }}
            >
              {gameModes.map((mode) => (
                <Button
                  key={mode}
                  variant={modeVariant[mode]}
                  size={portrait && !mobilePortrait ? "lg" : undefined}
                  style={mobilePortrait ? TOUCH_BUTTON_STYLE : portrait ? undefined : buttonSize}
                  onClick={() => onStart(mode)}
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </Button>
              ))}
            </div>
            {/* One-click joins for lobbies in the same Discord Activity. */}
            {onJoinLobby &&
              lobbies.map((lobby) => (
                <Button
                  key={lobby.code}
                  block
                  variant="discord"
                  size={portrait && !mobilePortrait ? "lg" : undefined}
                  style={mobilePortrait ? TOUCH_BUTTON_STYLE : portrait ? undefined : buttonSize}
                  onClick={() => onJoinLobby(lobby.code)}
                >
                  {lobbyButtonLabel(lobby)}
                </Button>
              ))}
            <Button
              block
              variant={modeVariant.online}
              size={portrait && !mobilePortrait ? "lg" : undefined}
              style={mobilePortrait ? TOUCH_BUTTON_STYLE : portrait ? undefined : buttonSize}
              onClick={onMultiplayer}
            >
              Multiplayer (Online)
            </Button>
            <p
              className="text-center px-2"
              style={{
                fontFamily: PIXEL,
                fontWeight: 700,
                fontSize: mobilePortrait ? 12 : Math.max(12, 18 * u),
                color: "#a8bcd8",
                letterSpacing: ".04em",
                marginTop: 2,
              }}
            >
              {isTouch
                ? "Use the on-screen pad to move, \u{1F4A3} to drop bombs"
                : "Controls: WASD keys to move, Space to place bombs"}
            </p>
          </div>
        </div>
      </div>

      {/* Cast, hidden on narrow screens where they would crowd the menu */}
      {wide && (
        <div aria-hidden className="pointer-events-none">
          <Abs style={{ left: 130 * u, bottom: 150 * u, zIndex: 3 }}>
            <Bomber {...BLUE} scale={2.2 * u} state="idle" facing="right" />
          </Abs>
          <Abs style={{ left: 400 * u, bottom: 96 * u, zIndex: 3 }}>
            <Bomber {...RED} scale={1.8 * u} state="walk" facing="right" />
          </Abs>
          <Abs style={{ right: 150 * u, bottom: 150 * u, zIndex: 3 }}>
            <Bomber {...PURPLE} scale={2.2 * u} state="win" facing="down" />
          </Abs>
          <Abs style={{ right: 452 * u, bottom: 96 * u, zIndex: 3 }}>
            <Bomber {...GREEN} scale={1.8 * u} state="idle" facing="left" />
          </Abs>
          <Abs style={{ left: "50%", bottom: 110 * u, transform: "translateX(-50%)", zIndex: 2 }}>
            <Bomb state="ticking" scale={1.5 * u} />
          </Abs>
        </div>
      )}
    </div>
  );
}
