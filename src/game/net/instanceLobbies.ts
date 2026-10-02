import { InstanceLobby, ServerToClientMessage } from "../../types/multiplayer";
import { relayWsUrl } from "./roomClient";

// =========================
// Discord instance lobby watcher
// =========================
// Subscribes to the open lobbies hosted inside one Discord Activity instance
// over its own receive-only socket, separate from roomClient's room socket,
// so watching never interferes with creating or joining a room.

const RECONNECT_DELAY_MS = 5000;

/**
 * Watch the lobbies of a Discord Activity instance. `onLobbies` fires with
 * the full list on subscribe and on every change. Reconnects if the relay
 * drops the socket. Returns an unsubscribe function.
 */
export function watchInstanceLobbies(
  instanceId: string,
  onLobbies: (lobbies: InstanceLobby[]) => void
): () => void {
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const connect = () => {
    ws = new WebSocket(relayWsUrl());
    ws.onopen = () => {
      ws?.send(JSON.stringify({ t: "watch", instanceId }));
    };
    ws.onmessage = (event) => {
      let msg: ServerToClientMessage;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.t === "lobbies") onLobbies(msg.lobbies);
    };
    ws.onclose = () => {
      ws = null;
      if (stopped) return;
      // Stale lobbies would offer joins that can no longer work.
      onLobbies([]);
      reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
    };
  };

  connect();

  return () => {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (ws) {
      ws.onclose = null;
      ws.close();
      ws = null;
    }
  };
}
