import { useRef, useState } from "react";
import { NET_CONFIG } from "../../game/core/config";
import { usePublicLobbies } from "../../hooks/usePublicLobbies";
import {
  InstanceLobby,
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
  TextInput,
} from "../ui";
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
  onCreate: (name: string, isPublic: boolean) => void;
  onJoin: (code: string, name: string) => void;
  /** Switch between player and spectator while in the room lobby. */
  onSwitchRole: (role: RoomRole) => void;
  onLeave: () => void;
  onStart: (fillBots: boolean) => void;
  onBack: () => void;
}

// Slot colours match the in-game player colours.
const SLOT_COLORS = ["#60a5fa", "#ef4444", "#4ade80", "#a78bfa"];

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
}: LobbyScreenProps) {
  const [name, setName] = useState(myName);
  // Adopt a late-arriving myName (Discord auth resolving after the lobby
  // opened) unless the user has already typed a nickname.
  const [prevMyName, setPrevMyName] = useState(myName);
  if (myName !== prevMyName) {
    setPrevMyName(myName);
    if (!name) setName(myName);
  }
  const [joinCode, setJoinCode] = useState(initialJoinCode);
  const [fillBots, setFillBots] = useState(true);
  // Rooms join the public server list unless the creator opts out.
  const [isPublic, setIsPublic] = useState(true);
  // Multiplayer opens on the public server list; "Create Room" leads to the
  // separate create/join view.
  const [view, setView] = useState<"servers" | "create">("servers");
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

  return (
    <Screen>
      <Panel width={inRoom ? 720 : 440}>
        <Heading
          title="MULTIPLAYER"
          subtitle={
            inRoom
              ? "Room lobby"
              : view === "servers"
                ? "Public servers"
                : "Create or join a room"
          }
          tone="cyan"
        />

        {/* Server list — the first multiplayer view. */}
        {!inRoom && view === "servers" && (
          <div className="flex flex-col gap-4">
            <div>
              <label htmlFor="nickname" className="block mb-2">
                <Label>Your nickname</Label>
              </label>
              <TextInput
                id="nickname"
                value={name}
                maxLength={16}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter a nickname"
              />
            </div>

            {/* One-click joins for lobbies in the same Discord Activity. */}
            {lobbies.map((lobby) => (
              <Button
                key={lobby.code}
                block
                variant="discord"
                size="lg"
                disabled={!name.trim() || connecting}
                onClick={() => onJoin(lobby.code, name.trim())}
              >
                {lobbyButtonLabel(lobby)}
              </Button>
            ))}

            {/* Public lobby list, sorted by relay-measured host latency.
                Full or in-game lobbies land the join as a spectator, so the
                button says "Watch" — same rule as the Discord lobby flow. */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Nearby lobbies ({serverList.total})</Label>
                <LinkButton
                  disabled={serverList.loading}
                  onClick={serverList.refresh}
                >
                  {serverList.loading ? "Loading…" : "Refresh"}
                </LinkButton>
              </div>
              <div className="flex flex-col gap-2">
                {serverList.lobbies.map((lobby) => {
                  const isFull = lobby.playerCount >= lobby.maxPlayers;
                  const status = lobby.locked ? "In game" : isFull ? "Full" : "Open";
                  return (
                    <div
                      key={lobby.code}
                      className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-white/[.04] border border-[rgba(124,196,255,.14)]"
                    >
                      <span className="flex items-center gap-2 font-bold min-w-0">
                        <Dot
                          color={
                            lobby.locked
                              ? "#f59e0b"
                              : isFull
                                ? "#ef4444"
                                : "#4ade80"
                          }
                        />
                        <span className="truncate">{lobby.hostName}&rsquo;s lobby</span>
                      </span>
                      <span className="flex items-center gap-3 shrink-0">
                        <Label>
                          {lobby.latencyMs === null
                            ? "– ms"
                            : `${lobby.latencyMs} ms`}
                        </Label>
                        <Label
                          className={cx(
                            (lobby.locked || isFull) && "text-ui-danger!"
                          )}
                        >
                          {status} · {lobby.playerCount}/{lobby.maxPlayers}
                        </Label>
                        <Button
                          variant={lobby.locked || isFull ? "neutral" : "green"}
                          size="sm"
                          disabled={!name.trim() || connecting}
                          onClick={() => onJoin(lobby.code, name.trim())}
                        >
                          {lobby.locked || isFull ? "Watch" : "Join"}
                        </Button>
                      </span>
                    </div>
                  );
                })}
                {serverList.error && <Hint>{serverList.error}</Hint>}
                {serverList.total === 0 && !serverList.loading && !serverList.error && (
                  <Hint>No public lobbies right now</Hint>
                )}
              </div>
              {serverList.total > serverList.pageSize && (
                <div className="flex items-center justify-between mt-2">
                  <LinkButton
                    disabled={serverList.page === 0 || serverList.loading}
                    onClick={() => serverList.setPage(serverList.page - 1)}
                  >
                    ← Prev
                  </LinkButton>
                  <Label>
                    Page {serverList.page + 1} of{" "}
                    {Math.max(1, Math.ceil(serverList.total / serverList.pageSize))}
                  </Label>
                  <LinkButton
                    disabled={
                      (serverList.page + 1) * serverList.pageSize >= serverList.total ||
                      serverList.loading
                    }
                    onClick={() => serverList.setPage(serverList.page + 1)}
                  >
                    Next →
                  </LinkButton>
                </div>
              )}
            </div>

            <Button
              block
              variant="purple"
              size="lg"
              onClick={() => setView("create")}
            >
              Create Room
            </Button>
          </div>
        )}

        {/* Create / join-with-code — reached from the server list. */}
        {!inRoom && view === "create" && (
          <div className="flex flex-col gap-4">
            <div>
              <label htmlFor="nickname-create" className="block mb-2">
                <Label>Your nickname</Label>
              </label>
              <TextInput
                id="nickname-create"
                value={name}
                maxLength={16}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter a nickname"
              />
            </div>

            <label className="flex items-center gap-3 text-sm cursor-pointer select-none">
              <Checkbox
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
              />
              List this lobby publicly
            </label>

            <Button
              block
              variant="purple"
              size="lg"
              disabled={!name.trim() || connecting}
              onClick={() => onCreate(name.trim(), isPublic)}
            >
              {connecting ? "Connecting…" : "Create Room"}
            </Button>

            <div className="flex items-center gap-3">
              <span className="flex-1 h-px bg-ui-line" />
              <Label>or join with code</Label>
              <span className="flex-1 h-px bg-ui-line" />
            </div>

            <div className="flex gap-3 items-stretch">
              <TextInput
                value={joinCode}
                maxLength={4}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="CODE"
                aria-label="Room code"
                className="flex-1 min-w-0 w-auto! text-center text-xl! uppercase tracking-[0.3em] font-bold"
              />
              {/* A full or already-started room lands the join as a
                  spectator instead of failing — no separate Watch needed. */}
              <Button
                variant="green"
                disabled={!name.trim() || joinCode.length !== 4 || connecting}
                onClick={() => onJoin(joinCode, name.trim())}
              >
                Join
              </Button>
            </div>

            <div className="text-center">
              <LinkButton onClick={() => setView("servers")}>
                ← Back to server list
              </LinkButton>
            </div>
          </div>
        )}

        {/* In-room view */}
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
          </div>
        )}

        {/* Error message */}
        {error && <ErrorText className="mt-4">{error}</ErrorText>}

        {/* Back to menu */}
        <div className="mt-5 text-center">
          <LinkButton onClick={onBack}>← Back to menu</LinkButton>
        </div>
      </Panel>
    </Screen>
  );
}
