import { PublicLobby, ServerToClientMessage } from "../../types/multiplayer";
import { relayWsUrl } from "./roomClient";

// =========================
// Public lobby browser
// =========================
// Fetches the relay's public lobby list (rooms the host didn't mark private)
// over a one-shot socket, separate from roomClient's room socket, so browsing
// never interferes with creating or joining a room. The relay answers one
// `browse` message with a `lobbyList` page sorted by host latency.

export interface PublicLobbyPage {
  lobbies: PublicLobby[];
  page: number;
  pageSize: number;
  total: number;
}

// A relay that accepts the socket but never answers `browse` would leave
// the request (and socket) open forever — the list refresh interval would
// keep stacking them. Give each fetch a deadline.
const BROWSE_TIMEOUT_MS = 10000;

/**
 * Fetch one page of the public lobby list.
 * `page` is 0-based; the relay clamps it into range and echoes the applied
 * page/pageSize back. `pageSize` is capped by the relay at 50.
 */
export function fetchPublicLobbies(
  page: number,
  pageSize: number
): Promise<PublicLobbyPage> {
  return new Promise<PublicLobbyPage>((resolve, reject) => {
    let settled = false;
    const ws = new WebSocket(relayWsUrl());
    const timeout = setTimeout(
      () => settle(() => reject(new Error("Lobby list request timed out"))),
      BROWSE_TIMEOUT_MS
    );
    const settle = (finish: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;
      ws.close();
      finish();
    };
    ws.onopen = () => {
      ws.send(JSON.stringify({ t: "browse", page, pageSize }));
    };
    ws.onmessage = (event) => {
      let msg: ServerToClientMessage;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.t === "lobbyList") {
        settle(() =>
          resolve({
            lobbies: msg.lobbies,
            page: msg.page,
            pageSize: msg.pageSize,
            total: msg.total,
          })
        );
      } else if (msg.t === "error") {
        settle(() => reject(new Error(msg.message)));
      }
    };
    ws.onerror = () => {
      settle(() => reject(new Error("Could not connect to the relay server")));
    };
    ws.onclose = () => {
      settle(() =>
        reject(new Error("Connection closed before the lobby list arrived"))
      );
    };
  });
}
