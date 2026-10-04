import { useCallback, useEffect, useRef, useState } from "react";
import { NET_CONFIG } from "../game/core/config";
import { fetchPublicLobbies } from "../game/net/publicLobbies";
import { PublicLobby } from "../types/multiplayer";

// =========================
// Public lobby list hook
// =========================
// Pages through the relay's public lobby list. Refreshes on an interval so
// latency readings and full/in-game badges stay current while the lobby
// screen is open. Disabled while inside a room — the list is irrelevant then
// and the browse sockets would leak.

export const PUBLIC_LOBBY_PAGE_SIZE = 10;

export interface PublicLobbyState {
  lobbies: PublicLobby[];
  page: number;
  pageSize: number;
  total: number;
  loading: boolean;
  error: string | null;
}

export function usePublicLobbies(enabled: boolean) {
  const [state, setState] = useState<PublicLobbyState>({
    lobbies: [],
    page: 0,
    pageSize: PUBLIC_LOBBY_PAGE_SIZE,
    total: 0,
    loading: false,
    error: null,
  });
  const pageRef = useRef(0);

  const load = useCallback(async (page: number) => {
    pageRef.current = page;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const result = await fetchPublicLobbies(page, PUBLIC_LOBBY_PAGE_SIZE);
      setState({
        lobbies: result.lobbies,
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        loading: false,
        error: null,
      });
    } catch {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: "Could not load the server list",
      }));
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    load(0);
    const timer = setInterval(
      () => load(pageRef.current),
      NET_CONFIG.publicLobbyRefreshMs
    );
    return () => clearInterval(timer);
  }, [enabled, load]);

  return {
    ...state,
    setPage: load,
    refresh: () => load(pageRef.current),
  };
}
