"use client";

import { useEffect, useRef, useState } from "react";
import { AudioController } from "../components/AudioController";
import { EndScreen } from "../components/screens/endScreen";
import { GameHUD } from "../components/screens/gameHud";
import { freeSlots, LobbyScreen } from "../components/screens/lobbyScreen";
import { MapSelectScreen } from "../components/screens/mapSelectScreen";
import { PauseScreen } from "../components/screens/pauseScreen";
import { PlayersHUD } from "../components/screens/playerHud";
import { StartScreen } from "../components/screens/startScreen";
import { TouchControls } from "../components/touchControls";
import {
  getDiscordUserName,
  getLaunchRoomCode,
  initDiscordClient,
  isDiscordActivity,
  setOnActivityJoinRoom,
  whenDiscordInstanceReady,
} from "../discord/client";
import { updatePresence } from "../discord/presence";
import { GAME_CONFIG } from "../game/core/config";
import {
  eliminatePlayer,
  getGameState,
  getLocalPlayerId,
  initializePlayers,
  pauseGame,
  pressLocalBomb,
  queuePlayerMove,
  resumeGame,
  setDesiredPlayersCount,
  setOnPlayerDead,
  setOnTimeOver,
  setOnWin,
  setRoster,
  startEngine,
  stopEngine
} from "../game/engine";
import { resetGrid } from "../game/grid";
import { PlayerStats, tracker } from "../game/hooks/tracker";
import { setMapPattern } from "../game/maps";
import {
  getLatestGameOver,
  getLatestStats,
  getLatestTimeElapsedMs,
  getMyPlayerId,
  handleHostPayload,
  sendGuestBomb,
  sendGuestMove,
  startGuestView,
  stopGuestView
} from "../game/net/guest";
import {
  handleGuestPayload,
  sendBackToLobby,
  sendGameOver,
  sendStart,
  startHosting,
  stopHosting,
} from "../game/net/host";
import { watchInstanceLobbies } from "../game/net/instanceLobbies";
import { roomClient } from "../game/net/roomClient";
import { Direction, GameMode, GameState } from "../types/game";
import {
  GamePayload,
  InstanceLobby,
  RoomPlayer,
  RoomRole,
  RoomSpectator,
  RosterEntry,
} from "../types/multiplayer";
import Game from "./game";

// The solo lobby's one human — named like the local player in the match.
const SOLO_PLAYERS: RoomPlayer[] = [{ slot: 0, name: "Player 1", isHost: false }];

export default function Home() {
  // Game state
  const [gameMode, setGameMode] = useState<GameMode>("solo");
  const [gameState, setGameState] = useState<GameState>(GameState.START);
  const [timeElapsedMs, setTimeElapsedMs] = useState(0);
  const [winner, setWinner] = useState<PlayerStats | undefined>(undefined);

  // Lobby state
  const [lobbyState, setLobbyState] = useState<{
    code: string | null;
    players: RoomPlayer[];
    spectators: RoomSpectator[];
    isHost: boolean;
    error: string | null;
    connecting: boolean;
    myName: string;
    /** Map preset declared when the room was created (null = pick at start). */
    mapId: string | null;
  }>({
    code: null,
    players: [],
    spectators: [],
    isHost: false,
    error: null,
    connecting: false,
    myName: "",
    mapId: null,
  });

  // True when this client is an online guest (joined someone else's room).
  const [isGuest, setIsGuest] = useState(false);
  // True when this client spectates: receives host state but sends no input.
  const [isSpectator, setIsSpectator] = useState(false);
  // Guest-side: the host signalled it is back in the room lobby, so the
  // end-screen "Return to Lobby" button can be enabled.
  const [hostBackInLobby, setHostBackInLobby] = useState(false);

  // The host's roster, kept in a ref so the PLAYING effect and relay handler
  // can read it without re-subscribing.
  const rosterRef = useRef<RosterEntry[]>([]);

  // True while the lobby screen is the local solo lobby (no relay room).
  const [soloLobby, setSoloLobby] = useState(false);
  // The lobby's bot picker. Defaults to filling every free slot; clamped to
  // the free slots by the lobby screen.
  const [lobbyBots, setLobbyBots] = useState(3);
  // Bots the solo game started with — kept for "Play Again".
  const soloBotsRef = useRef(1);
  // The online host's bot count, held while the map-select screen is shown;
  // null = the map pick is for a solo game.
  const pendingOnlineBotsRef = useRef<number | null>(null);

  // Discord Activity state: the room code carried by a shareLink invite
  // (pre-fills the lobby join box), and whether the SDK has authenticated —
  // gating the presence effect so the first push doesn't fire before auth.
  const [inviteJoinCode, setInviteJoinCode] = useState("");
  const [discordReady, setDiscordReady] = useState(false);
  // Wall-clock match start for the presence elapsed timer.
  const matchStartMsRef = useRef(0);
  // Set when the engine is paused: the PLAYING effect reads it to skip the
  // fresh-match setup on resume (the engine stays alive while paused).
  const pausedEngineRef = useRef(false);
  // Authenticated Discord display name — the default lobby nickname and the
  // identity used when auto-joining a room from a Discord invite/Join.
  const discordNameRef = useRef<string | null>(null);
  // Open lobbies hosted by others in the same Discord Activity instance —
  // rendered as one-click "Join <host>'s Lobby" buttons.
  const [instanceLobbies, setInstanceLobbies] = useState<InstanceLobby[]>([]);

  // =========================
  // Relay dispatch (kept in a ref so the roomClient callback always calls
  // the latest version with current isGuest/gameMode values, avoiding a
  // stale closure from the mount-time useEffect).
  // =========================
  const handleRelayRef = useRef<(from: number, payload: GamePayload) => void>(
    () => {}
  );
  const handleSpectatorJoinedRef = useRef<() => void>(() => {});

  const handleRelay = (from: number, payload: GamePayload) => {
    if (isGuest) {
      // Guest receives host payloads.
      if (payload.t === "start") {
        // The host re-broadcasts start when a spectator joins a locked room;
        // ignore the duplicate once this view is already in the match.
        setHostBackInLobby(false);
        if (
          gameState !== GameState.PLAYING &&
          gameState !== GameState.PAUSED
        ) {
          startGuestView(payload, roomClient.isSpectator());
          setGameState(GameState.PLAYING);
        }
      } else if (payload.t === "gameOver") {
        handleHostPayload(payload);
        setGameState(payload.state === "WIN" ? GameState.WIN : GameState.GAME_OVER);
      } else if (payload.t === "backToLobby") {
        setHostBackInLobby(true);
      } else {
        handleHostPayload(payload);
      }
    } else {
      // Host receives guest input.
      handleGuestPayload(from, payload, rosterRef.current);
    }
  };
  handleRelayRef.current = handleRelay;

  // A spectator joined a locked room (host only): re-send the start payload
  // so they can build the grid, and the game-over payload if the match has
  // already ended. In-game guests ignore the duplicate start.
  const handleSpectatorJoined = () => {
    if (rosterRef.current.length === 0) return;
    sendStart(rosterRef.current);
    if (gameState === GameState.GAME_OVER || gameState === GameState.WIN) {
      sendGameOver(gameState, winner?.id);
    }
  };
  handleSpectatorJoinedRef.current = handleSpectatorJoined;

  // =========================
  // Room client event wiring
  // =========================
  useEffect(() => {
    roomClient.setOnRoom((code, players, spectators, mapId) => {
      // The room broadcast is how a join that auto-landed as spectator — or
      // a mid-lobby role switch — reaches React state.
      setIsSpectator(roomClient.isSpectator());
      // Mid-game guest disconnect (host only): eliminate the departed remote
      // player so they don't linger as a frozen character. rosterRef is only
      // populated on the host, so this block never runs on guests.
      if (
        getGameState() === GameState.PLAYING &&
        rosterRef.current.length > 0
      ) {
        const remainingSlots = new Set(players.map((p) => p.slot));
        rosterRef.current = rosterRef.current.filter((entry) => {
          const isDepartedRemote =
            entry.control === "remote" && !remainingSlots.has(entry.slot);
          if (isDepartedRemote) eliminatePlayer(entry.id);
          return !isDepartedRemote;
        });
      }

      const mySlot = roomClient.getSlot();
      const me = players.find((p) => p.slot === mySlot);
      setLobbyState((prev) => ({
        ...prev,
        code,
        players,
        spectators,
        isHost: me?.isHost ?? false,
        myName: me?.name ?? prev.myName,
        mapId,
        error: null,
        connecting: false,
      }));
    });

    roomClient.setOnError((message) => {
      setLobbyState((prev) => ({ ...prev, error: message, connecting: false }));
    });

    roomClient.setOnHostLeft(() => {
      // If we were mid-game, stop the guest view and return to the start.
      stopGuestView();
      setIsGuest(false);
      setIsSpectator(false);
      setHostBackInLobby(false);
      setGameState(GameState.START);
      setLobbyState((prev) => ({
        ...prev,
        code: null,
        players: [],
        spectators: [],
        isHost: false,
        error: "Host left the game",
        connecting: false,
      }));
    });

    roomClient.setOnRelay((from, payload) => {
      handleRelayRef.current(from, payload);
    });

    roomClient.setOnSpectatorJoined(() => {
      handleSpectatorJoinedRef.current();
    });

    return () => {
      roomClient.setOnRoom(null);
      roomClient.setOnError(null);
      roomClient.setOnHostLeft(null);
      roomClient.setOnRelay(null);
      roomClient.setOnSpectatorJoined(null);
    };
     
  }, []);

  // Route a Discord-provided room code (shareLink launch or the presence
  // "Join" button) into the lobby: auto-join with the Discord name when we
  // have one, otherwise just pre-fill the join box. Never interrupts a
  // live match.
  const joinFromDiscordRef = useRef<(code: string) => void>(() => {});
  joinFromDiscordRef.current = (code) => {
    if (
      gameState === GameState.PLAYING ||
      gameState === GameState.PAUSED
    ) {
      return;
    }
    setSoloLobby(false);
    setGameState(GameState.LOBBY);
    const name = discordNameRef.current;
    if (name) {
      if (lobbyState.code) roomClient.reset(); // leave any current room
      handleJoinRoom(code, name);
    } else {
      setInviteJoinCode(code);
    }
  };

  // =========================
  // Discord Activity init + invite deep-link
  // =========================
  useEffect(() => {
    if (!isDiscordActivity()) return;
    initDiscordClient().then((sdk) => {
      if (!sdk) return;
      setDiscordReady(true);
      const name = getDiscordUserName();
      // Lobby nicknames are capped at 16 chars (lobby input maxLength).
      const discordName = name ? name.slice(0, 16) : null;
      discordNameRef.current = discordName;
      // Auth can finish after the lobby is already open — backfill the
      // nickname unless one is already set.
      if (discordName) {
        setLobbyState((prev) =>
          prev.myName ? prev : { ...prev, myName: discordName }
        );
      }
      setOnActivityJoinRoom((code) => joinFromDiscordRef.current(code));
      const code = getLaunchRoomCode();
      if (code) joinFromDiscordRef.current(code);
    });
  }, []);

  // Watch the Activity instance's lobbies as soon as the SDK handshake
  // completes — not gated on OAuth, so a participant whose login fails or
  // is declined still sees the join buttons (they just type a nickname).
  useEffect(() => {
    if (!isDiscordActivity()) return;
    let cancelled = false;
    let unwatch: (() => void) | null = null;
    whenDiscordInstanceReady().then((instanceId) => {
      if (cancelled || !instanceId) return;
      unwatch = watchInstanceLobbies(instanceId, setInstanceLobbies);
    });
    return () => {
      cancelled = true;
      unwatch?.();
    };
  }, []);

  // Our own room never shows up as a lobby to join.
  const joinableLobbies = instanceLobbies.filter(
    (lobby) => lobby.code !== lobbyState.code
  );

  // =========================
  // Escape key (pause) — disabled in online games
  // =========================
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (gameMode === "online") return; // online games can't pause

      if (gameState === GameState.PLAYING) {
        pausedEngineRef.current = true;
        pauseGame();
        setGameState(GameState.PAUSED);
      } else if (gameState === GameState.PAUSED) {
        resumeGame();
        setGameState(GameState.PLAYING);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [gameState, gameMode]);

  // =========================
  // Game lifecycle (PLAYING effect)
  // =========================
  useEffect(() => {
    if (gameState !== GameState.PLAYING) return;

    // Resuming a paused match: the cleanup below keeps the engine alive
    // while paused, so skip the fresh-match setup — re-running
    // initializePlayers would orphan the characters the tracker references.
    const resumingFromPause = pausedEngineRef.current;
    pausedEngineRef.current = false;
    if (!resumingFromPause) {
      matchStartMsRef.current = Date.now();
    }

    if (gameMode === "online" && isGuest) {
      // Back-date the presence timer by the host's clock so a mid-game
      // spectator doesn't get a fresh "elapsed" timer.
      matchStartMsRef.current = Date.now() - getLatestTimeElapsedMs();
      // Guest: no engine to start. The guest view was already started by the
      // relay handler. Just poll the latest snapshot for the HUD/time.
      const timeInterval = setInterval(() => {
        setTimeElapsedMs(getLatestTimeElapsedMs());
      }, 100);

      return () => {
        clearInterval(timeInterval);
      };
    }

    // Host or solo/local: initialize players, start the engine, wire callbacks.
    if (!resumingFromPause) {
      initializePlayers();
    }

    setOnPlayerDead((winnerId) => {
      setWinner(winnerId ? tracker.getPlayer(winnerId)?.getStats() : undefined);
      setGameState(GameState.GAME_OVER);
      if (gameMode === "online") {
        sendGameOver(getGameState(), winnerId);
      }
    });

    setOnTimeOver(() => {
      setGameState(GameState.GAME_OVER);
      if (gameMode === "online") {
        sendGameOver(getGameState());
      }
    });

    setOnWin((winnerId) => {
      const winnerStats = tracker.getPlayer(winnerId)?.getStats();
      setWinner(winnerStats);
      setGameState(GameState.WIN);
      if (gameMode === "online") {
        sendGameOver(getGameState(), winnerId);
      }
    });

    if (!resumingFromPause) {
      startEngine();

      // For online host: start relaying snapshots + blasts.
      if (gameMode === "online" && !isGuest) {
        startHosting(rosterRef.current);
      }
    }

    const timeInterval = setInterval(() => {
      setTimeElapsedMs(tracker.timeElapsedMs);
    }, 100);

    return () => {
      // Stepping into PAUSED leaves the engine alive so resumeGame()
      // continues the same match; every other exit tears it down.
      if (getGameState() !== GameState.PAUSED) {
        stopEngine();
        if (gameMode === "online" && !isGuest) {
          stopHosting();
        }
      }
      clearInterval(timeInterval);
    };

  }, [gameState, gameMode, isGuest]);

  // =========================
  // Discord rich presence — no-op outside Discord. Declared after the
  // PLAYING effect so matchStartMsRef is already set on match entry.
  // =========================
  useEffect(() => {
    if (!discordReady) return;
    const inMatch =
      gameState === GameState.PLAYING || gameState === GameState.PAUSED;
    updatePresence(gameState, {
      gameMode,
      roomCode: lobbyState.code,
      playerCount: lobbyState.players.length,
      matchStartMs: inMatch ? matchStartMsRef.current : 0,
      // Guests/spectators get the winner via the host's gameOver payload,
      // not the engine callbacks that set `winner`.
      winnerName: winner?.name ?? getLatestGameOver()?.winner?.name,
      spectating: isSpectator,
      soloLobby,
    });
  }, [
    gameState,
    gameMode,
    lobbyState.code,
    lobbyState.players.length,
    winner,
    discordReady,
    isSpectator,
    soloLobby,
  ]);

  // =========================
  // Solo: a local lobby to pick bots, then the map
  // =========================
  const handleSolo = () => {
    setSoloLobby(true);
    setGameState(GameState.LOBBY);
  };

  const handleSoloStart = (bots: number) => {
    soloBotsRef.current = bots;
    pendingOnlineBotsRef.current = null;
    setGameState(GameState.MAP_SELECT);
  };

  // Actually launches a solo game once a map has been chosen.
  const startLocalGame = () => {
    setIsGuest(false);
    setGameMode("solo");
    setGameState(GameState.PLAYING);
    setTimeElapsedMs(0);
    setWinner(undefined);
    resetGrid();
    tracker.reset();
    tracker.startGame();
    setDesiredPlayersCount(1 + soloBotsRef.current);
  };

  // =========================
  // Lobby handlers
  // =========================
  const handleMultiplayer = () => {
    setSoloLobby(false);
    setGameState(GameState.LOBBY);
    setLobbyState({
      code: null,
      players: [],
      spectators: [],
      isHost: false,
      error: null,
      connecting: false,
      myName: discordNameRef.current ?? "",
      mapId: null,
    });
    setIsGuest(false);
    setIsSpectator(false);
  };

  // Inside Discord the relay is reached through the /ws URL mapping — a
  // connect failure there almost always means the mapping is missing or
  // points at a host Discord can't reach.
  const relayConnectError = isDiscordActivity()
    ? "Could not connect to the server — is the /ws URL mapping set?"
    : "Could not connect to the server";

  const handleCreateRoom = async (
    name: string,
    isPublic: boolean,
    roomName?: string,
    mapId?: string
  ) => {
    setLobbyState((prev) => ({ ...prev, connecting: true, error: null, myName: name }));
    // A creator is never a guest or spectator — clear stale flags a failed
    // join/spectate may have left, or the next match would wait for a host
    // start payload that never comes.
    setIsGuest(false);
    setIsSpectator(false);
    try {
      await roomClient.connect();
      roomClient.createRoom(name, isPublic, roomName, mapId);
    } catch {
      setLobbyState((prev) => ({
        ...prev,
        connecting: false,
        error: relayConnectError,
      }));
    }
  };

  const handleJoinRoom = async (code: string, name: string) => {
    setLobbyState((prev) => ({ ...prev, connecting: true, error: null, myName: name }));
    setIsGuest(true);
    setIsSpectator(false);
    setGameMode("online");
    try {
      await roomClient.connect();
      roomClient.joinRoom(code, name);
    } catch {
      setLobbyState((prev) => ({
        ...prev,
        connecting: false,
        error: relayConnectError,
      }));
      setIsGuest(false);
      setGameMode("solo");
    }
  };

  // Switch between player and spectator mid-lobby. The server confirms with
  // a joined/spectating message + room broadcast, which updates isSpectator.
  const handleSwitchRole = (role: RoomRole) => {
    roomClient.setRole(role);
  };

  const handleLeaveRoom = () => {
    roomClient.leaveRoom();
    setIsGuest(false);
    setIsSpectator(false);
    setHostBackInLobby(false);
    setLobbyState({
      code: null,
      players: [],
      spectators: [],
      isHost: false,
      error: null,
      connecting: false,
      myName: discordNameRef.current ?? "",
      mapId: null,
    });
  };

  const handleLobbyBack = () => {
    roomClient.reset();
    stopGuestView();
    setIsGuest(false);
    setIsSpectator(false);
    setHostBackInLobby(false);
    setGameState(GameState.START);
    setLobbyState({
      code: null,
      players: [],
      spectators: [],
      isHost: false,
      error: null,
      connecting: false,
      myName: discordNameRef.current ?? "",
      mapId: null,
    });
  };

  // =========================
  // Host: start the online game
  // =========================
  const handleStartOnlineGame = (bots: number) => {
    // The map was picked at room creation and is advertised to joiners —
    // start on it directly instead of re-picking on the map-select screen.
    // Rooms without a declared map (created before map support) fall back
    // to the picker.
    if (lobbyState.mapId) {
      setMapPattern(lobbyState.mapId);
      startOnlineGame(bots);
      return;
    }
    pendingOnlineBotsRef.current = bots;
    setGameState(GameState.MAP_SELECT);
  };

  // Actually launches the online game once the host has chosen a map.
  const startOnlineGame = (bots: number) => {
    const mySlot = roomClient.getSlot();
    const roster: RosterEntry[] = lobbyState.players.map((p) => ({
      id: `player-${p.slot + 1}`,
      name: p.name,
      control: p.slot === mySlot ? "local" : "remote",
      slot: p.slot,
    }));

    // Bots take the free slots, same ones the lobby showed them in.
    freeSlots(lobbyState.players)
      .slice(0, bots)
      .forEach((slot, i) => {
        roster.push({
          id: `computer-${i + 1}`,
          name: `Computer ${i + 1}`,
          control: "computer",
          slot,
        });
      });

    rosterRef.current = roster;

    // Lock the room so no one else can join mid-game.
    roomClient.lockRoom();

    // Reset the grid and tracker for a fresh round.
    resetGrid();
    tracker.reset();
    tracker.startGame();
    setRoster(roster);

    // Tell guests to build the grid + characters.
    sendStart(roster);

    // Switch to playing; the PLAYING effect initializes players + engine.
    setGameMode("online");
    setIsGuest(false);
    setWinner(undefined);
    setTimeElapsedMs(0);
    setGameState(GameState.PLAYING);
  };

  // =========================
  // Map select
  // =========================
  const handleMapSelect = (mapId: string) => {
    setMapPattern(mapId);
    const bots = pendingOnlineBotsRef.current;
    if (bots !== null) {
      startOnlineGame(bots);
    } else {
      startLocalGame();
    }
  };

  const handleMapSelectBack = () => {
    // Both online and solo picks come from a lobby, so back returns there.
    pendingOnlineBotsRef.current = null;
    setGameState(GameState.LOBBY);
  };

  // =========================
  // Restart / return to menu
  // =========================
  const handleGameRestart = () => {
    // Leaving a paused match for the menu: the PLAYING cleanup skips the
    // teardown while paused, so stop the still-running engine here.
    if (getGameState() === GameState.PAUSED) {
      pausedEngineRef.current = false;
      stopEngine();
    }
    if (gameMode === "online") {
      // Leave the room and return to the start screen.
      roomClient.reset();
      stopGuestView();
      stopHosting();
      setIsGuest(false);
      setIsSpectator(false);
      setHostBackInLobby(false);
    }
    // Clear the room from lobby state too — otherwise the stale code/players
    // would leak a phantom party into the next game's rich presence.
    setLobbyState({
      code: null,
      players: [],
      spectators: [],
      isHost: false,
      error: null,
      connecting: false,
      myName: discordNameRef.current ?? "",
      mapId: null,
    });
    setGameState(GameState.START);
    setTimeElapsedMs(0);
    setWinner(undefined);
  };

  const handlePlayAgain = () => {
    if (gameMode === "online" && isGuest) return; // guests can't restart

    if (gameMode === "online" && !isGuest) {
      // Host returns to the room lobby instead of restarting straight away:
      // guests follow via the backToLobby payload, the room is unlocked so
      // players can join/leave again, and a fresh roster is built on start.
      sendBackToLobby();
      roomClient.unlockRoom();
      rosterRef.current = [];
      setWinner(undefined);
      setTimeElapsedMs(0);
      setGameState(GameState.LOBBY);
      return;
    }

    // Solo: restart straight away with the same bots and map selection — a
    // "random" pick re-rolls on this reset.
    startLocalGame();
  };

  // Guest/spectator: leave the end screen for the room lobby. Only offered
  // once the host has signalled it is back in the lobby itself.
  const handleReturnToLobby = () => {
    stopGuestView();
    setWinner(undefined);
    setTimeElapsedMs(0);
    setGameState(GameState.LOBBY);
  };

  // =========================
  // HUD stats
  // =========================
  const getPlayerStats = () => {
    if (gameMode === "online" && isGuest) {
      return getLatestStats();
    }
    return tracker.getPlayers().map((player) => player.getStats());
  };

  // The end screen only shows the local player's own stats. Spectators have
  // no character of their own, so they see everyone's stats instead.
  const getOwnStats = (): PlayerStats[] => {
    const all = getPlayerStats();
    if (gameMode === "online" && isGuest) {
      if (isSpectator) return all;
      const myId = getMyPlayerId();
      return all.filter((player) => player.id === myId);
    }
    if (gameMode === "online") {
      const myId = rosterRef.current.find(
        (entry) => entry.control === "local"
      )?.id;
      return all.filter((player) => player.id === myId);
    }
    return all.filter((player) => player.isPlayer);
  };

  // =========================
  // End screen winner/stats
  // =========================
  const getEndWinner = () => {
    if (gameMode === "online" && isGuest) {
      return getLatestGameOver()?.winner;
    }
    return winner;
  };

  const getEndGameStats = () => {
    if (gameMode === "online" && isGuest) {
      return getLatestGameOver()?.gameStats ?? tracker.getGameStats();
    }
    return tracker.getGameStats();
  };

  // Whether to show the "Play Again" button (host or solo/local only).
  const canPlayAgain = !(gameMode === "online" && isGuest);
  // Online guests/spectators get a "Return to Lobby" button instead, enabled
  // once the host has signalled it is back in the lobby.
  const canReturnToLobby = gameMode === "online" && isGuest;

  // =========================
  // Touch controls
  // =========================
  const handleTouchMove = (direction: Direction) => {
    if (gameMode === "online" && isGuest) {
      sendGuestMove(direction);
      return;
    }
    const playerId = getLocalPlayerId();
    if (playerId) queuePlayerMove(playerId, direction);
  };

  const handleTouchBomb = () => {
    if (gameMode === "online" && isGuest) {
      sendGuestBomb();
      return;
    }
    pressLocalBomb();
  };

  return (
    <main className="min-h-screen flex items-center justify-center relative bg-gray-900 text-white overflow-hidden">
      {/* Background */}
      <div
        className="fixed inset-0 z-0 pointer-events-none bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url(/image/background.jpg)" }}
      />

      {/* Audio Controller - Always visible */}
      <AudioController autoPlay={true} />

      {/* Game Content (padding reserves room for the HUD strip and touch
          controls in portrait orientation) */}
      <div className="relative z-10 w-full h-full flex items-center justify-center portrait:pt-28 portrait:pb-64">
        {/* Game HUD - Show during gameplay and when paused */}
        {(gameState === GameState.PLAYING ||
          gameState === GameState.PAUSED) && (
          <>
            <GameHUD
              timeElapsedMs={timeElapsedMs}
              gameTimeLimit={GAME_CONFIG.timeLimit}
            />
            <PlayersHUD players={getPlayerStats()} />
          </>
        )}

        {/* Game Screen - Show during gameplay and when paused */}
        {(gameState === GameState.PLAYING ||
          gameState === GameState.PAUSED) && <Game />}

        {/* Touch Controls - only rendered on touch-capable devices;
            spectators have no character to steer. */}
        {gameState === GameState.PLAYING && !isSpectator && (
          <TouchControls onMove={handleTouchMove} onBomb={handleTouchBomb} />
        )}

        {/* Start Screen */}
        {gameState === GameState.START && (
          <StartScreen
            onSolo={handleSolo}
            onMultiplayer={handleMultiplayer}
            lobbies={joinableLobbies}
            onJoinLobby={(code) => joinFromDiscordRef.current(code)}
          />
        )}

        {/* Map Select Screen */}
        {gameState === GameState.MAP_SELECT && (
          <MapSelectScreen
            onSelect={handleMapSelect}
            onBack={handleMapSelectBack}
          />
        )}

        {/* Lobby Screen */}
        {gameState === GameState.LOBBY && (
          <LobbyScreen
            roomCode={lobbyState.code}
            players={soloLobby ? SOLO_PLAYERS : lobbyState.players}
            spectators={lobbyState.spectators}
            isHost={soloLobby || lobbyState.isHost}
            isSpectator={isSpectator}
            myName={lobbyState.myName}
            roomMapId={lobbyState.mapId}
            // Solo has no room, so a stale room error ("Host left the game") doesn't apply.
            error={soloLobby ? null : lobbyState.error}
            connecting={lobbyState.connecting}
            initialJoinCode={inviteJoinCode}
            lobbies={joinableLobbies}
            onCreate={handleCreateRoom}
            onJoin={handleJoinRoom}
            onSwitchRole={handleSwitchRole}
            onLeave={handleLeaveRoom}
            bots={lobbyBots}
            onBotsChange={setLobbyBots}
            onStart={soloLobby ? handleSoloStart : handleStartOnlineGame}
            onBack={handleLobbyBack}
            solo={soloLobby}
          />
        )}

        {/* Pause Screen */}
        {gameState === GameState.PAUSED && (
          <PauseScreen
            onReturnToMenu={handleGameRestart}
            onResume={() => {
              resumeGame();
              setGameState(GameState.PLAYING);
            }}
          />
        )}

        {/* End Screen */}
        {(gameState === GameState.GAME_OVER || gameState === GameState.WIN) && (
          <EndScreen
            gameState={gameState}
            winner={getEndWinner()}
            players={getOwnStats()}
            timeLeft={GAME_CONFIG.timeLimit * 1000 - timeElapsedMs}
            gameStats={getEndGameStats()}
            onReturnToMenu={handleGameRestart}
            onPlayAgain={canPlayAgain ? handlePlayAgain : undefined}
            onReturnToLobby={canReturnToLobby ? handleReturnToLobby : undefined}
            returnToLobbyEnabled={hostBackInLobby}
          />
        )}
      </div>
    </main>
  );
}
