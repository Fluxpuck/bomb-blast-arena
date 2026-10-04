import { useEffect, useRef, useState } from "react";
import { NET_CONFIG } from "../../game/core/config";
import { MAP_PATTERNS } from "../../game/maps";
import { usePublicLobbies } from "../../hooks/usePublicLobbies";
import {
  InstanceLobby,
  PublicLobby,
  RoomPlayer,
  RoomRole,
  RoomSpectator,
} from "../../types/multiplayer";
import {
  Button,
  Checkbox,
  cx,
  Dot,
  ErrorText,
  Heading,
  Hint,
  INPUT_BASE,
  Label,
  LinkButton,
  Panel,
  Screen,
  Segmented,
  TextInput,
} from "../ui";
import { MapPreview } from "./mapSelectScreen";
import { lobbyButtonLabel } from "./startScreen";

interface LobbyScreenProps {
  roomCode: string | null;
  /** Pre-fills the join box — set when launched from a Discord invite. */
  initialJoinCode?: string;
  /** Lobbies hosted in the same Discord Activity (empty outside Discord). */
  lobbies?: InstanceLobby[];
  players: RoomPlayer[];
  spectators: RoomSpectator[];
  isHost: boolean;
  /** True when this client is a spectator in the room (watch-only). */
  isSpectator: boolean;
  myName: string;
  error: string | null;
  connecting: boolean;
  onCreate: (
    name: string,
    isPublic: boolean,
    roomName?: string,
    mapId?: string
  ) => void;
  onJoin: (code: string, name: string) => void;
  /** Switch between player and spectator while in the room lobby. */
  onSwitchRole: (role: RoomRole) => void;
  onLeave: () => void;
  onStart: (fillBots: boolean) => void;
  onBack: () => void;
  /** The room's declared map (null while browsing or when undeclared). */
  roomMapId?: string | null;
}

// Slot colours match the in-game player colours.
const SLOT_COLORS = ["#60a5fa", "#ef4444", "#4ade80", "#a78bfa"];
const EMPTY_SLOT_COLOR = "#1e2b45";

const MAX_ROOM_NAME_LENGTH = 24;
const CODE_LENGTH = 4;
const NICKNAME_MAX_LENGTH = 16;

// Nicknames persist between visits so returning players keep their identity.
const NICKNAME_STORAGE_KEY = "bomb-blast-arena.nickname";

// Fallback nickname words, themed like the seeder bot names. A random pick
// means hosting/joining is never blocked on typing a name first.
const NICKNAME_WORDS = ["Fuse", "Spark", "Boom", "Blast", "TNT", "Ember", "Cap"];

function randomNickname(): string {
  const word =
    NICKNAME_WORDS[Math.floor(Math.random() * NICKNAME_WORDS.length)];
  return `${word}${Math.floor(1000 + Math.random() * 9000)}`;
}

function readStoredNickname(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(NICKNAME_STORAGE_KEY) ?? "";
  } catch {
    // Storage can be unavailable (private mode, policy) — never block play.
    return "";
  }
}

function storeNickname(name: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NICKNAME_STORAGE_KEY, name);
  } catch {
    // Optional persistence; hosting and joining must still work.
  }
}

// Map choices beyond the named presets — same ids the map-select screen uses.
const EXTRA_MAP_OPTIONS = [
  { id: "random", name: "Random preset", icon: "?" },
  { id: "generate", name: "Generate random map", icon: "⚄" },
] as const;

// Row/list column metrics from the lobby design: map thumb, name, status,
// players, ping, action — desktop only, mobile rows stack instead.
const ROOM_GRID =
  "grid grid-cols-[52px_minmax(0,1fr)_92px_104px_52px_96px] gap-3.5 items-center";

const STATUS_STYLE = {
  open: "text-[#4ade80] bg-[rgba(74,222,128,.12)]",
  inGame: "text-ui-yellow bg-[rgba(255,206,61,.12)]",
  full: "text-ui-muted bg-[rgba(143,166,201,.12)]",
} as const;

type LobbyTab = "all" | "open" | "inGame";

function lobbyStatus(lobby: PublicLobby): keyof typeof STATUS_STYLE {
  if (lobby.locked) return "inGame";
  return lobby.playerCount >= lobby.maxPlayers ? "full" : "open";
}

function lobbyStatusLabel(status: keyof typeof STATUS_STYLE): string {
  return status === "inGame" ? "In game" : status === "full" ? "Full" : "Open";
}

/** A lobby's declared map preset — rooms without one show no map/thumb. */
function lobbyMap(lobby: PublicLobby) {
  return MAP_PATTERNS.find((pattern) => pattern.id === lobby.mapId) ?? null;
}

/** Display name for a map id, covering the random/generate picks. */
function mapNameForId(mapId: string | null | undefined): string | null {
  const preset = MAP_PATTERNS.find((pattern) => pattern.id === mapId);
  if (preset) return preset.name;
  if (mapId === "random") return "Random";
  if (mapId === "generate") return "Generated";
  return null;
}

/** Display name for a lobby's map. */
function lobbyMapName(lobby: PublicLobby): string | null {
  return mapNameForId(lobby.mapId);
}

/** Occupied slots; falls back to the first N when an older relay omits them. */
function lobbySlots(lobby: PublicLobby): number[] {
  return (
    lobby.slots ??
    Array.from({ length: lobby.playerCount }, (_, i) => i)
  );
}

function pingColor(latencyMs: number | null): string {
  if (latencyMs === null) return "text-ui-muted";
  if (latencyMs < 50) return "text-[#4ade80]";
  if (latencyMs < 100) return "text-ui-yellow";
  return "text-ui-danger";
}

// =========================
// Nickname chip
// =========================
// The player's identity on the browser screen — a chip instead of a full
// field. EDIT opens an inline editor (names auto-fill from storage or a
// random pick, so it starts closed).
function NicknameChip({
  name,
  editing,
  onEdit,
  onChange,
}: {
  name: string;
  editing: boolean;
  onEdit: (editing: boolean) => void;
  onChange: (name: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  return (
    <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-[10px] bg-ui-ink border-2 border-ui-line">
      <Dot color={SLOT_COLORS[0]} />
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          value={name}
          maxLength={NICKNAME_MAX_LENGTH}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => onEdit(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onEdit(false);
          }}
          placeholder="Enter a nickname"
          className="w-36 bg-transparent font-bold text-sm text-ui-text outline-hidden placeholder:text-[rgba(143,166,201,.55)] placeholder:font-normal"
          aria-label="Your nickname"
        />
      ) : (
        <>
          <span
            className={cx(
              "font-bold text-sm max-w-40 truncate",
              !name && "text-ui-muted font-normal"
            )}
          >
            {name || "Set nickname"}
          </span>
          <button
            type="button"
            onClick={() => onEdit(true)}
            className={cx(
              "cursor-pointer text-ui-cyan hover:text-white transition-colors",
              "font-mono text-[11px] font-bold tracking-[.14em] uppercase"
            )}
          >
            Edit
          </button>
        </>
      )}
    </div>
  );
}

// =========================
// Room list rows
// =========================
function PlayerDots({ lobby, small }: { lobby: PublicLobby; small?: boolean }) {
  const slots = lobbySlots(lobby);
  return (
    <span className="flex items-center gap-1">
      {[0, 1, 2, 3].map((slot) => (
        <span
          key={slot}
          className={cx(
            "rounded-full shrink-0",
            small ? "w-[9px] h-[9px]" : "w-3 h-3"
          )}
          style={{
            backgroundColor: slots.includes(slot)
              ? SLOT_COLORS[slot]
              : EMPTY_SLOT_COLOR,
          }}
        />
      ))}
      <span className="font-mono text-xs text-ui-muted ml-1">
        {lobby.playerCount}/{lobby.maxPlayers}
      </span>
    </span>
  );
}

/** 3px-per-cell mini map preview, reusing the map-select renderer. */
function MapThumb({ lobby }: { lobby: PublicLobby }) {
  const map = lobbyMap(lobby);
  if (!map) return null;
  return <MapPreview pattern={map} cellSize={3} />;
}

function PingText({ latencyMs }: { latencyMs: number | null }) {
  return (
    <span className={cx("font-mono text-xs font-bold", pingColor(latencyMs))}>
      {latencyMs === null ? "– ms" : `${latencyMs} ms`}
    </span>
  );
}

// =========================
// Host form — the dedicated create view uses it on all sizes.
// =========================
function HostForm({
  name,
  roomName,
  mapId,
  isPublic,
  connecting,
  onName,
  onRoomName,
  onMapId,
  onIsPublic,
  onCreate,
}: {
  name: string;
  roomName: string;
  mapId: string;
  isPublic: boolean;
  connecting: boolean;
  onName: (value: string) => void;
  onRoomName: (value: string) => void;
  onMapId: (value: string) => void;
  onIsPublic: (value: boolean) => void;
  onCreate: () => void;
}) {
  const roomNamePlaceholder = `${name.trim() || "Host"}'s room`;
  return (
    <>
      <div>
        <Label className="block mb-1.5">Your nickname</Label>
        <TextInput
          value={name}
          maxLength={NICKNAME_MAX_LENGTH}
          onChange={(e) => onName(e.target.value)}
          placeholder="Enter a nickname"
          aria-label="Your nickname"
        />
      </div>
      <div>
        <Label className="block mb-1.5">Room name</Label>
        <TextInput
          value={roomName}
          maxLength={MAX_ROOM_NAME_LENGTH}
          onChange={(e) => onRoomName(e.target.value)}
          placeholder={roomNamePlaceholder}
          aria-label="Room name"
        />
      </div>
      <div>
        <Label className="block mb-1.5">Map</Label>
        {/* Same thumbnail picker as the map-select screen: mini previews
            for the presets, icon cards for random/generate. */}
        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Map">
          {MAP_PATTERNS.map((pattern) => {
            const isActive = mapId === pattern.id;
            return (
              <button
                key={pattern.id}
                type="button"
                role="radio"
                aria-checked={isActive}
                onClick={() => onMapId(pattern.id)}
                className={cx(
                  "flex flex-col items-center gap-1.5 p-2 rounded-[10px] bg-ui-ink border-2 cursor-pointer transition-colors",
                  isActive
                    ? "border-ui-cyan shadow-[0_0_0_3px_rgba(95,215,242,.25)]"
                    : "border-ui-line hover:border-ui-cyan"
                )}
              >
                <MapPreview pattern={pattern} cellSize={4} />
                <span className="font-bold text-[11px]">{pattern.name}</span>
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2">
          {EXTRA_MAP_OPTIONS.map((option) => {
            const isActive = mapId === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={isActive}
                onClick={() => onMapId(option.id)}
                className={cx(
                  "flex items-center justify-center gap-2 px-2 py-2.5 rounded-[10px] bg-ui-ink border-2 cursor-pointer transition-colors",
                  isActive
                    ? "border-ui-cyan shadow-[0_0_0_3px_rgba(95,215,242,.25)]"
                    : "border-ui-line hover:border-ui-cyan"
                )}
              >
                <span className="text-base font-bold text-ui-yellow">
                  {option.icon}
                </span>
                <span className="font-bold text-[11px]">{option.name}</span>
              </button>
            );
          })}
        </div>
      </div>
      <Segmented
        options={[
          { value: "public", label: "Public" },
          { value: "private", label: "Private" },
        ]}
        value={isPublic ? "public" : "private"}
        onChange={(value) => onIsPublic(value === "public")}
      />
      <Button
        block
        variant="purple"
        size="lg"
        disabled={!name.trim() || connecting}
        onClick={onCreate}
      >
        {connecting ? "Connecting…" : "Create Room"}
      </Button>
    </>
  );
}

export function LobbyScreen({
  roomCode,
  initialJoinCode = "",
  lobbies = [],
  players,
  spectators,
  isHost,
  isSpectator,
  myName,
  error,
  connecting,
  onCreate,
  onJoin,
  onSwitchRole,
  onLeave,
  onStart,
  onBack,
  roomMapId = null,
}: LobbyScreenProps) {
  const [name, setName] = useState(myName);
  // Filled once on mount when no name was provided: the stored nickname,
  // else a random themed one so hosting/joining never starts blocked.
  const generatedNameRef = useRef<string | null>(null);
  useEffect(() => {
    setName((prev) => {
      if (prev) return prev;
      const stored = readStoredNickname();
      if (stored) return stored;
      if (!generatedNameRef.current) {
        generatedNameRef.current = randomNickname();
      }
      return generatedNameRef.current;
    });
  }, []);
  // Adopt a late-arriving myName (Discord auth resolving after the lobby
  // opened) over an empty or still-random nickname — never a typed or
  // stored one. An emptied myName (e.g. leaving a room) keeps the current
  // nickname instead of clearing it.
  const [prevMyName, setPrevMyName] = useState(myName);
  if (myName !== prevMyName) {
    setPrevMyName(myName);
    if (myName && (!name || name === generatedNameRef.current)) {
      setName(myName);
    }
  }
  const [joinCode, setJoinCode] = useState(initialJoinCode);
  const [fillBots, setFillBots] = useState(true);
  // Rooms join the public server list unless the creator opts out.
  const [isPublic, setIsPublic] = useState(true);
  const [roomName, setRoomName] = useState("");
  const [mapId, setMapId] = useState(MAP_PATTERNS[0].id);
  const [tab, setTab] = useState<LobbyTab>("all");
  // The name chip edits inline via its Edit button.
  const [editingName, setEditingName] = useState(false);
  // The browser is the landing view; "create" is the dedicated host menu.
  const [view, setView] = useState<"browse" | "create">("browse");
  // Footer status line — "Joining X…" until the join resolves into a room
  // or an error replaces it.
  const [status, setStatus] = useState<string | null>(null);
  const lastJoinCodeRef = useRef<string | null>(null);
  // Adopt a late-arriving invite code (a Discord join dispatch while the
  // lobby is already open) by prefilling the join field.
  const [prevJoinCode, setPrevJoinCode] = useState(initialJoinCode);
  if (initialJoinCode !== prevJoinCode) {
    setPrevJoinCode(initialJoinCode);
    if (initialJoinCode) setJoinCode(initialJoinCode);
  }
  // Fetching stops inside a room — the list is irrelevant there.
  const serverList = usePublicLobbies(roomCode === null);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const codeRef = useRef<HTMLSpanElement>(null);

  const inRoom = roomCode !== null;
  // Spectators count as participants so a host can start a match for an
  // audience (e.g. host + bots) without a second player.
  const participantCount = players.length + spectators.length;
  const canStart = isHost && participantCount >= 2;

  const nameIsSet = name.trim().length > 0;
  const codeIsValid = joinCode.length === CODE_LENGTH;

  // Esc leaves the browser — in the create menu it steps back to browse
  // first; in-room Esc stays free for other uses.
  useEffect(() => {
    if (inRoom) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (view === "create") setView("browse");
      else onBack();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [inRoom, view, onBack]);

  // Re-render once a second so "Updated Ns ago" ticks between refreshes.
  // Date.now() can't be read during render (react-hooks/purity), so the
  // clock lives in state.
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => {
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // The footer status is a browser-screen thing — drop it once a join or
  // create lands in the room view (render-time adjust, same pattern as the
  // myName/invite-code backfill above).
  const [prevInRoom, setPrevInRoom] = useState(inRoom);
  if (inRoom !== prevInRoom) {
    setPrevInRoom(inRoom);
    if (inRoom) setStatus(null);
  }

  // The server says "Room not found" — the footer shows the friendlier
  // wording with the attempted code, per the lobby spec.
  const statusText =
    error === "Room not found" && lastJoinCodeRef.current
      ? `No room with code ${lastJoinCodeRef.current}`
      : (error ?? status);

  const openLobbies = serverList.lobbies.filter(
    (lobby) => lobbyStatus(lobby) === "open"
  );
  const inGameLobbies = serverList.lobbies.filter(
    (lobby) => lobbyStatus(lobby) === "inGame"
  );
  const visibleLobbies =
    tab === "open"
      ? openLobbies
      : tab === "inGame"
        ? inGameLobbies
        : serverList.lobbies;

  const updatedSecondsAgo =
    serverList.updatedAt === null
      ? null
      : Math.max(0, Math.round((nowMs - serverList.updatedAt) / 1000));

  // Actions that need a nickname open the chip editor instead of silently
  // doing nothing — the buttons themselves stay enabled-looking per spec.
  const requireName = (): boolean => {
    if (nameIsSet) return true;
    setEditingName(true);
    setStatus("Set a nickname first");
    return false;
  };

  const joinLobby = (lobby: PublicLobby) => {
    if (!requireName() || connecting) return;
    lastJoinCodeRef.current = lobby.code;
    storeNickname(name.trim());
    setStatus(`Joining ${lobby.name}…`);
    onJoin(lobby.code, name.trim());
  };

  const joinByCode = () => {
    if (!codeIsValid) return;
    if (!requireName() || connecting) return;
    lastJoinCodeRef.current = joinCode;
    storeNickname(name.trim());
    setStatus(`Joining ${joinCode}…`);
    onJoin(joinCode, name.trim());
  };

  const createRoom = () => {
    if (!requireName() || connecting) return;
    storeNickname(name.trim());
    setStatus("Creating room…");
    onCreate(name.trim(), isPublic, roomName.trim() || undefined, mapId);
  };

  const handleCodeChange = (value: string) => {
    setJoinCode(
      value
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, CODE_LENGTH)
    );
  };

  // navigator.clipboard is blocked inside the Discord activity iframe, so
  // fall back to the deprecated execCommand path (still works there with a
  // user gesture), then finally select the code so it can be copied manually.
  const handleCopyCode = async () => {
    if (!roomCode) return;
    let didCopy = false;
    try {
      await navigator.clipboard.writeText(roomCode);
      didCopy = true;
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = roomCode;
      Object.assign(textarea.style, { position: "fixed", opacity: "0" });
      document.body.appendChild(textarea);
      textarea.select();
      try {
        didCopy = document.execCommand("copy");
      } catch {
        didCopy = false;
      } finally {
        textarea.remove();
      }
    }
    if (didCopy) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return;
    }
    const selection = window.getSelection();
    if (!codeRef.current || !selection) return;
    const range = document.createRange();
    range.selectNodeContents(codeRef.current);
    selection.removeAllRanges();
    selection.addRange(range);
    setCopyFailed(true);
    setTimeout(() => setCopyFailed(false), 4000);
  };

  // =========================
  // Shared fragments
  // =========================
  const tabOptions = [
    { value: "all" as LobbyTab, label: `All ${serverList.lobbies.length}` },
    { value: "open" as LobbyTab, label: `Open ${openLobbies.length}` },
    { value: "inGame" as LobbyTab, label: `In game ${inGameLobbies.length}` },
  ];

  // One-click joins for lobbies in the same Discord Activity.
  const discordLobbyButtons = lobbies.map((lobby) => (
    <Button
      key={lobby.code}
      block
      variant="discord"
      size="lg"
      disabled={!nameIsSet || connecting}
      onClick={() => {
        lastJoinCodeRef.current = lobby.code;
        storeNickname(name.trim());
        setStatus(`Joining ${lobby.hostName}'s lobby…`);
        onJoin(lobby.code, name.trim());
      }}
    >
      {lobbyButtonLabel(lobby)}
    </Button>
  ));

  const listBody = () => {
    // Skeleton rows until the first fetch lands.
    if (serverList.loading && serverList.updatedAt === null) {
      return (
        <>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-[52px] rounded-xl bg-white/[.05] animate-pulse"
            />
          ))}
        </>
      );
    }
    if (serverList.error) {
      return (
        <div className="flex items-center justify-center gap-2 py-6">
          <Hint>Couldn&apos;t load rooms</Hint>
          <LinkButton onClick={serverList.refresh}>Retry</LinkButton>
        </div>
      );
    }
    if (visibleLobbies.length === 0) {
      return (
        <Hint className="py-6">
          No rooms here right now — create one and share the code.
        </Hint>
      );
    }
    return null;
  };

  return (
    <Screen>
      <Panel
        width={inRoom ? 720 : view === "create" ? 440 : null}
        className={
          inRoom || view === "create"
            ? undefined
            : // 8rem clearance leaves room for the fixed audio pill that sits
              // bottom-centre on desktop instead of overlapping the footer.
              // The panel never scrolls itself — the room list does. On
              // mobile the sheet still needs whole-panel scrolling.
              "w-[min(1100px,calc(100vw-2rem))] max-h-[calc(100dvh-8rem)] flex flex-col max-sm:overflow-y-auto"
        }
      >
        {/* ============ Lobby browser — desktop (>= sm) ============ */}
        {!inRoom && view === "browse" && (
          <div className="hidden sm:flex flex-col gap-5 flex-1 min-h-0">
            {/* Header: title + subtitle left, nickname chip right. */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1
                  className="font-display font-normal text-[34px] leading-[.95] tracking-[.01em] text-ui-cyan [text-shadow:0_3px_0_#0f5f73,0_0_22px_rgba(95,215,242,.4)]"
                  style={{ fontFamily: "var(--font-bungee), Bungee, sans-serif" }}
                >
                  MULTIPLAYER
                </h1>
                <p className="mt-2 text-sm text-ui-muted">
                  Pick a public room, enter a code, or host your own
                </p>
              </div>
              <NicknameChip
                name={name}
                editing={editingName}
                onEdit={setEditingName}
                onChange={setName}
              />
            </div>

            {/* Body: room list left, join/host cards right. The grid row
                is minmax(0,1fr) so the column can shrink — the room list
                absorbs overflow with its own scrollbar. */}
            <div className="grid grid-cols-[minmax(0,1fr)_300px] grid-rows-[minmax(0,1fr)] gap-6 flex-1 min-h-0">
              <div className="flex flex-col gap-3 min-w-0 min-h-0">
                {discordLobbyButtons}

                {/* Toolbar: filter tabs + last-refresh stamp. */}
                <div className="flex items-center justify-between gap-3">
                  <Segmented
                    options={tabOptions}
                    value={tab}
                    onChange={setTab}
                    className="w-auto"
                  />
                  <button
                    type="button"
                    onClick={serverList.refresh}
                    className={cx(
                      "flex items-center gap-1.5 cursor-pointer hover:text-white transition-colors",
                      "font-mono text-[11px] font-bold tracking-[.14em] uppercase text-ui-muted"
                    )}
                  >
                    {updatedSecondsAgo === null
                      ? "Loading…"
                      : `Updated ${updatedSecondsAgo}s ago`}
                    <span aria-hidden>↻</span>
                  </button>
                </div>

                {/* Column header */}
                <div className={cx(ROOM_GRID, "px-3")}>
                  <Label>Map</Label>
                  <Label>Room</Label>
                  <Label>Status</Label>
                  <Label>Players</Label>
                  <Label>Ping</Label>
                  <span />
                </div>

                {/* Room rows — the only scrollable part of the modal. */}
                <div className="flex flex-col gap-1.5 flex-1 min-h-0 overflow-y-auto pr-1">
                  {visibleLobbies.map((lobby) => {
                    const status = lobbyStatus(lobby);
                    const mapName = lobbyMapName(lobby);
                    return (
                      <div
                        key={lobby.code}
                        className={cx(
                          ROOM_GRID,
                          "px-3 py-2 rounded-xl bg-white/[.04] border border-[rgba(124,196,255,.14)] hover:border-ui-cyan hover:bg-[rgba(95,215,242,.06)] transition-colors"
                        )}
                      >
                        <MapThumb lobby={lobby} />
                        <span className="min-w-0">
                          <span className="block font-bold text-base truncate">
                            {lobby.name}
                          </span>
                          <span className="block text-[13px] text-ui-muted truncate">
                            {lobby.hostName}
                            {mapName ? ` · ${mapName}` : ""}
                          </span>
                        </span>
                        <Label
                          className={cx(
                            "justify-self-start px-2 py-0.5 rounded-md",
                            STATUS_STYLE[status]
                          )}
                        >
                          {lobbyStatusLabel(status)}
                        </Label>
                        <PlayerDots lobby={lobby} />
                        <PingText latencyMs={lobby.latencyMs} />
                        {/* Full or in-game rooms land the join as a
                            spectator — the button says "Watch". */}
                        <Button
                          variant={status === "open" ? "green" : "neutral"}
                          size="sm"
                          disabled={connecting}
                          onClick={() => joinLobby(lobby)}
                        >
                          {status === "open" ? "Join" : "Watch"}
                        </Button>
                      </div>
                    );
                  })}
                  {listBody()}
                </div>
              </div>

              {/* Right column: join with code, then host your own. Capped
                  at the row height so short screens scroll this card
                  instead of overflowing the footer. */}
              <div className="self-start flex flex-col gap-3 max-h-full overflow-y-auto">
                <form
                  className="flex flex-col gap-3 rounded-[14px] bg-white/[.04] border border-[rgba(124,196,255,.14)] p-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    joinByCode();
                  }}
                >
                  <Label>Join with code</Label>
                  <input
                    type="text"
                    value={joinCode}
                    maxLength={CODE_LENGTH}
                    onChange={(e) => handleCodeChange(e.target.value)}
                    placeholder="CODE"
                    aria-label="Room code"
                    className={cx(
                      INPUT_BASE,
                      "w-full px-3.5 py-2.5 text-center text-[26px] font-bold text-ui-yellow tracking-[0.4em] uppercase"
                    )}
                  />
                  <Button
                    type="submit"
                    variant="green"
                    disabled={!codeIsValid || connecting}
                  >
                    Join Room
                  </Button>
                  <Hint>
                    Private rooms only show up here — ask the host for their
                    4-letter code.
                  </Hint>
                </form>
                <div className="flex items-center gap-3">
                  <span className="h-px flex-1 bg-[rgba(124,196,255,.16)]" />
                  <Hint>or host your own</Hint>
                  <span className="h-px flex-1 bg-[rgba(124,196,255,.16)]" />
                </div>
                <Button
                  block
                  variant="purple"
                  size="lg"
                  onClick={() => setView("create")}
                >
                  + Create Lobby
                </Button>
              </div>
            </div>

            {/* Footer: back link left, status right. */}
            <div className="flex items-center justify-between gap-4">
              <LinkButton onClick={onBack}>← Back to menu</LinkButton>
              {statusText && (
                <span className="font-mono text-xs font-bold text-ui-yellow">
                  {statusText}
                </span>
              )}
            </div>
          </div>
        )}

        {/* ============ Lobby browser — mobile (< sm) ============ */}
        {!inRoom && view === "browse" && (
          <div className="sm:hidden flex flex-col gap-3.5 -m-3 p-4 pt-8 min-h-[calc(100dvh-2rem)]">
            {/* Top bar: back, title, refresh. */}
            <div className="flex items-center justify-between">
              <LinkButton onClick={onBack} aria-label="Back to menu">
                ←
              </LinkButton>
              <h1
                className="font-display font-normal text-2xl text-ui-cyan [text-shadow:0_3px_0_#0f5f73,0_0_22px_rgba(95,215,242,.4)]"
                style={{ fontFamily: "var(--font-bungee), Bungee, sans-serif" }}
              >
                MULTIPLAYER
              </h1>
              <LinkButton onClick={serverList.refresh} aria-label="Refresh">
                ↻
              </LinkButton>
            </div>

            <div className="flex justify-center">
              <NicknameChip
                name={name}
                editing={editingName}
                onEdit={setEditingName}
                onChange={setName}
              />
            </div>

            {discordLobbyButtons}

            {/* Code row sits on top; the Join key dims until 4 chars. */}
            <form
              className="flex gap-3 items-stretch"
              onSubmit={(e) => {
                e.preventDefault();
                joinByCode();
              }}
            >
              <TextInput
                value={joinCode}
                maxLength={CODE_LENGTH}
                onChange={(e) => handleCodeChange(e.target.value)}
                placeholder="CODE"
                aria-label="Room code"
                className="flex-1 min-w-0 w-auto! text-center text-xl! uppercase tracking-[0.3em] font-bold"
              />
              <Button
                type="submit"
                variant="green"
                disabled={!codeIsValid || connecting}
                className={cx("min-h-[44px]", !codeIsValid && "opacity-50!")}
              >
                Join
              </Button>
            </form>

            {/* Create sits with the join action, same as the desktop card. */}
            <Button
              block
              variant="purple"
              size="lg"
              onClick={() => setView("create")}
            >
              + Create Lobby
            </Button>

            <Segmented options={tabOptions} value={tab} onChange={setTab} />

            {/* Compact rows: name on top, dots · map · ping underneath. */}
            <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto">
              {visibleLobbies.map((lobby) => {
                const status = lobbyStatus(lobby);
                const mapName = lobbyMapName(lobby);
                return (
                  <div
                    key={lobby.code}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-white/[.04] border border-[rgba(124,196,255,.14)]"
                  >
                    <span className="min-w-0">
                      <span className="block font-bold truncate">
                        {lobby.name}
                      </span>
                      <span className="flex items-center gap-1.5 text-xs text-ui-muted">
                        <PlayerDots lobby={lobby} small />
                        {mapName && <span>· {mapName}</span>}
                        <PingText latencyMs={lobby.latencyMs} />
                      </span>
                    </span>
                    <Button
                      variant={status === "open" ? "green" : "neutral"}
                      size="sm"
                      disabled={connecting}
                      onClick={() => joinLobby(lobby)}
                      className="min-w-[72px] min-h-[44px] shrink-0"
                    >
                      {status === "open" ? "Join" : "Watch"}
                    </Button>
                  </div>
                );
              })}
              {listBody()}
            </div>

            {statusText && (
              <span className="font-mono text-xs font-bold text-ui-yellow text-center">
                {statusText}
              </span>
            )}
          </div>
        )}

        {/* ============ Create a lobby — dedicated host menu ============ */}
        {!inRoom && view === "create" && (
          <div className="flex flex-col gap-4">
            <Heading
              title="CREATE LOBBY"
              subtitle="Public rooms appear in the list; private rooms join by code"
              tone="cyan"
            />
            <HostForm
              name={name}
              roomName={roomName}
              mapId={mapId}
              isPublic={isPublic}
              connecting={connecting}
              onName={setName}
              onRoomName={setRoomName}
              onMapId={setMapId}
              onIsPublic={setIsPublic}
              onCreate={createRoom}
            />
            {statusText && (
              <span className="font-mono text-xs font-bold text-ui-yellow text-center">
                {statusText}
              </span>
            )}
            <div className="text-center">
              <LinkButton onClick={() => setView("browse")}>
                ← Back to rooms
              </LinkButton>
            </div>
          </div>
        )}

        {/* ============ In-room view ============ */}
        {inRoom && (
          <div className="flex flex-col gap-5">
            {/* Room code display */}
            <div className="text-center">
              <Label className="block mb-2">Room Code</Label>
              <button
                type="button"
                onClick={handleCopyCode}
                title="Click to copy"
                className={cx(INPUT_BASE, "inline-flex items-center gap-3 px-5 py-2 cursor-pointer hover:border-ui-cyan")}
              >
                <span
                  ref={codeRef}
                  className="text-4xl font-bold tracking-[0.3em] pl-[0.3em] text-ui-yellow"
                >
                  {roomCode}
                </span>
                <Label>
                  {copied ? "Copied!" : copyFailed ? "Ctrl+C" : "Copy"}
                </Label>
              </button>
              {/* The room's declared map — locked at creation, applied when
                  the host starts. */}
              {mapNameForId(roomMapId) && (
                <p className="mt-2">
                  <Label>Map: {mapNameForId(roomMapId)}</Label>
                </p>
              )}
            </div>

            {/* Roster on the left, controls on the right — keeps the panel
                landscape instead of one tall column. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 items-start">
              <div className="flex flex-col gap-4">
                {/* Player list */}
                <div>
                  <Label className="block mb-2">Players ({players.length}/4)</Label>
                  <div className="flex flex-col gap-2">
                    {players.map((p) => (
                      <div
                        key={p.slot}
                        className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-white/[.04] border border-[rgba(124,196,255,.14)]"
                      >
                        <span className="flex items-center gap-2 font-bold">
                          <Dot color={SLOT_COLORS[p.slot % SLOT_COLORS.length]} />
                          {p.name}
                          {p.isHost && (
                            <Label className="text-ui-yellow!">Host</Label>
                          )}
                        </span>
                        <Label>Slot {p.slot + 1}</Label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Spectator list */}
                {spectators.length > 0 && (
                  <div>
                    <Label className="block mb-2">
                      Spectators ({spectators.length}/{NET_CONFIG.maxSpectators})
                    </Label>
                    <div className="flex flex-col gap-2">
                      {spectators.map((s, i) => (
                        <div
                          key={`${s.name}-${i}`}
                          className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-white/[.04] border border-[rgba(124,196,255,.14)]"
                        >
                          <span className="flex items-center gap-2 font-bold">
                            <Dot color="#94a3b8" />
                            {s.name}
                          </span>
                          <Label>Watching</Label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

            {/* Host controls */}
            {isHost ? (
              <div className="flex flex-col gap-3">
                <label className="flex items-center gap-3 text-sm cursor-pointer select-none">
                  <Checkbox
                    checked={fillBots}
                    onChange={(e) => setFillBots(e.target.checked)}
                  />
                  Fill empty slots with bots
                </label>
                <Button
                  block
                  variant="green"
                  size="lg"
                  disabled={!canStart}
                  onClick={() => onStart(fillBots)}
                >
                  {canStart ? "Start Game" : "Need at least 2 participants"}
                </Button>
                <Button block variant="red" size="sm" onClick={onLeave}>
                  Leave Room
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-3 text-center">
                <p className="text-ui-muted">
                  {isSpectator
                    ? "Spectating — waiting for host to start…"
                    : "Waiting for host to start…"}
                </p>
                {/* Non-host members can switch roles in the lobby. The host
                    can't spectate — they run the authoritative game. */}
                {isSpectator ? (
                  <Button
                    block
                    variant="green"
                    size="sm"
                    disabled={players.length >= 4}
                    onClick={() => onSwitchRole("player")}
                  >
                    {players.length >= 4 ? "Player slots full" : "Join as player"}
                  </Button>
                ) : (
                  <Button
                    block
                    variant="blue"
                    size="sm"
                    onClick={() => onSwitchRole("spectator")}
                  >
                    Watch instead
                  </Button>
                )}
                <Button block variant="red" size="sm" onClick={onLeave}>
                  Leave Room
                </Button>
              </div>
            )}
            </div>

            {/* Back to menu */}
            <div className="text-center">
              <LinkButton onClick={onBack}>← Back to menu</LinkButton>
            </div>
          </div>
        )}

        {/* Error message (in-room errors; the browser shows them in the
            footer status line instead) */}
        {inRoom && error && <ErrorText className="mt-4">{error}</ErrorText>}
      </Panel>
    </Screen>
  );
}
