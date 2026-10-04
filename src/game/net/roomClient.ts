import { getDiscordInstanceId, isDiscordActivity } from "../../discord/client";
import {
  ClientToServerMessage,
  GamePayload,
  RoomPlayer,
  RoomRole,
  RoomSpectator,
  ServerToClientMessage,
} from "../../types/multiplayer";
import { DISCORD_CONFIG, getServerUrl } from "../core/config";

// =========================
// Room client (singleton)
// =========================
// Thin wrapper around a WebSocket connection to the relay server. Handles
// the connection-management protocol (create/join/setRole/leave/lock/relay)
// and exposes event setters the UI and host/guest layers subscribe to.

/**
 * The URL the WebSocket should dial. Inside Discord's sandboxed iframe
 * (*.discordsays.com) external sockets are CSP-blocked, so the connection
 * must go through the activity's own origin via the /ws URL mapping —
 * always wss:// with an implicit port or it never reaches the proxy. The
 * portal's /ws mapping decides where the traffic lands, so the configured
 * server URL doesn't apply there. Under a dev "Application URL Override"
 * the origin isn't discordsays.com; dial the configured server directly.
 */
export function relayWsUrl(): string {
  if (
    typeof window !== "undefined" &&
    isDiscordActivity() &&
    window.location.host.endsWith(".discordsays.com")
  ) {
    return `wss://${window.location.host}${DISCORD_CONFIG.wsProxyPrefix}`;
  }
  return getServerUrl();
}

type RoomHandler = (
  code: string,
  players: RoomPlayer[],
  spectators: RoomSpectator[],
  mapId: string | null
) => void;
type RelayHandler = (from: number, payload: GamePayload) => void;
type ErrorHandler = (message: string) => void;
type HostLeftHandler = () => void;
type ReadyHandler = () => void;
type SpectatorJoinedHandler = () => void;

class RoomClient {
  private static instance: RoomClient;
  private ws: WebSocket | null = null;
  private code: string | null = null;
  private slot: number | null = null;
  private name: string = "";
  private spectator = false;
  private mapId: string | null = null;

  private onReady: ReadyHandler | null = null;
  private onRoom: RoomHandler | null = null;
  private onRelay: RelayHandler | null = null;
  private onError: ErrorHandler | null = null;
  private onHostLeft: HostLeftHandler | null = null;
  private onSpectatorJoined: SpectatorJoinedHandler | null = null;

  private constructor() {}

  public static getInstance(): RoomClient {
    if (!RoomClient.instance) {
      RoomClient.instance = new RoomClient();
    }
    return RoomClient.instance;
  }

  // =========================
  // Event setters
  // =========================
  public setOnReady(handler: ReadyHandler | null) {
    this.onReady = handler;
  }
  public setOnRoom(handler: RoomHandler | null) {
    this.onRoom = handler;
  }
  public setOnRelay(handler: RelayHandler | null) {
    this.onRelay = handler;
  }
  public setOnError(handler: ErrorHandler | null) {
    this.onError = handler;
  }
  public setOnHostLeft(handler: HostLeftHandler | null) {
    this.onHostLeft = handler;
  }
  public setOnSpectatorJoined(handler: SpectatorJoinedHandler | null) {
    this.onSpectatorJoined = handler;
  }

  // =========================
  // Connection
  // =========================
  private connectPromise: Promise<void> | null = null;

  /** Open a WebSocket to the relay server. Resolves once connected. */
  public connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }
    // Reuse an in-flight connection attempt instead of opening a second
    // socket that would leak the first (its onclose would also clobber
    // this.ws while the new socket is live).
    if (this.connectPromise) {
      return this.connectPromise;
    }

    const connectAttempt = new Promise<void>((resolve, reject) => {
      const url = relayWsUrl();
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.onopen = () => {
        this.onReady?.();
        resolve();
      };
      ws.onerror = () => {
        reject(new Error("Could not connect to the relay server"));
      };
      ws.onclose = () => {
        this.ws = null;
      };
      ws.onmessage = (event) => this.handleMessage(event.data);
    }).finally(() => {
      this.connectPromise = null;
    });

    this.connectPromise = connectAttempt;
    return connectAttempt;
  }

  private handleMessage(raw: string) {
    let msg: ServerToClientMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.t) {
      case "created":
        this.code = msg.code;
        this.slot = msg.slot;
        this.spectator = false;
        this.onRoom?.(msg.code, [
          { slot: msg.slot, name: this.name, isHost: true },
        ], [], this.mapId);
        break;
      case "joined":
        this.code = msg.code;
        this.slot = msg.slot;
        this.spectator = false;
        break;
      case "spectating":
        this.code = msg.code;
        this.slot = null;
        this.spectator = true;
        break;
      case "room":
        this.onRoom?.(
          msg.code,
          msg.players,
          msg.spectators ?? [],
          msg.mapId ?? this.mapId
        );
        break;
      case "error":
        this.onError?.(msg.message);
        break;
      case "hostLeft":
        this.onHostLeft?.();
        this.reset();
        break;
      case "spectatorJoined":
        this.onSpectatorJoined?.();
        break;
      case "relay":
        this.onRelay?.(msg.from, msg.payload);
        break;
    }
  }

  // =========================
  // Outgoing messages
  // =========================
  private send(msg: ClientToServerMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  public createRoom(
    name: string,
    isPublic = true,
    roomName?: string,
    mapId?: string
  ) {
    this.name = name;
    this.mapId = mapId ?? null;
    // Tag Discord-hosted rooms with the Activity instance so everyone in
    // the same Activity sees a "Join <host>'s Lobby" button.
    const instanceId = getDiscordInstanceId();
    this.send(
      instanceId
        ? { t: "create", name, instanceId, isPublic, roomName, mapId }
        : { t: "create", name, isPublic, roomName, mapId }
    );
  }

  /**
   * Join a room. When no player slot is free (room full or game already
   * started) the server lands the join as a spectator instead of failing.
   */
  public joinRoom(code: string, name: string) {
    this.name = name;
    this.send({ t: "join", code, name });
  }

  /**
   * Switch between player and spectator while in a room lobby. The server
   * confirms with a `joined`/`spectating` message followed by a room
   * broadcast, so no local state changes here.
   */
  public setRole(role: RoomRole) {
    this.send({ t: "setRole", role });
  }

  public leaveRoom() {
    this.send({ t: "leave" });
    this.reset();
  }

  public lockRoom() {
    this.send({ t: "lock" });
  }

  /** Unlock the room so new players can join (host only, between matches). */
  public unlockRoom() {
    this.send({ t: "unlock" });
  }

  /** Send a game payload to the host (guest -> host). */
  public sendToHost(payload: GamePayload) {
    // Spectators are receive-only; the relay would drop this anyway.
    if (this.spectator) return;
    this.send({ t: "relay", to: "host", payload });
  }

  /** Send a game payload to all guests (host -> guests). */
  public sendToGuests(payload: GamePayload) {
    this.send({ t: "relay", to: "guests", payload });
  }

  // =========================
  // Accessors
  // =========================
  public getRoomCode(): string | null {
    return this.code;
  }
  public getSlot(): number | null {
    return this.slot;
  }
  public getName(): string {
    return this.name;
  }
  public isSpectator(): boolean {
    return this.spectator;
  }

  /** Close the connection and clear local state. */
  public reset() {
    this.code = null;
    this.slot = null;
    this.spectator = false;
    this.mapId = null;
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }
}

export const roomClient = RoomClient.getInstance();
