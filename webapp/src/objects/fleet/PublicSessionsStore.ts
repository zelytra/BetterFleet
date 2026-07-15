import { reactive } from "vue";
import { HTTPAxios } from "@/objects/utils/HTTPAxios.ts";
import { PublicSession } from "@/objects/fleet/PublicSessions.ts";
import {
  applyFilter,
  SessionFilter,
} from "@/objects/fleet/PublicSessionsFilter.ts";

interface PublicSessionsState {
  sessions: PublicSession[];
  connectedPlayers: number;
  filter: SessionFilter;
  query: string;
  loading: boolean;
}

const state = reactive<PublicSessionsState>({
  sessions: [],
  connectedPlayers: 0,
  filter: "all",
  query: "",
  loading: false,
});

let stream: EventSource | undefined;

/**
 * REST snapshot: the guaranteed path (goes through the Tauri http plugin, like every other
 * backend call). Loads the public list + the global connected-players count. Used on mount and
 * by the Refresh button; the last known list is kept on failure.
 */
async function refresh(): Promise<void> {
  state.loading = true;
  try {
    const list = await new HTTPAxios("public-sessions").get();
    if (Array.isArray(list.data)) {
      state.sessions = list.data as PublicSession[];
    }
  } catch {
    /* keep the last known list */
  }
  try {
    const online = await new HTTPAxios("stats/online-users").get();
    state.connectedPlayers = Number(online.data) || 0;
  } catch {
    /* keep the last known count */
  }
  state.loading = false;
}

/**
 * Live updates: the backend pushes a fresh public-sessions snapshot on every structural change
 * (issue #599). The webview already opens direct WebSocket connections to the backend, so an
 * EventSource to the same origin is allowed; if it ever fails, refresh()/the Refresh button keep
 * the list usable.
 */
function connectStream(): void {
  disconnect();
  try {
    stream = new EventSource(
      import.meta.env.VITE_BACKEND_HOST + "/public-sessions/stream",
    );
    stream.onmessage = (event: MessageEvent) => {
      try {
        const snapshot = JSON.parse(event.data);
        if (Array.isArray(snapshot)) {
          state.sessions = snapshot as PublicSession[];
        }
      } catch {
        /* ignore a malformed frame */
      }
    };
  } catch {
    /* EventSource unavailable -> rely on refresh() */
  }
}

function disconnect(): void {
  if (stream) {
    stream.close();
    stream = undefined;
  }
}

export const PublicSessionsStore = {
  state,
  refresh,
  connectStream,
  disconnect,
  get visible(): PublicSession[] {
    return applyFilter(state.sessions, state.filter, state.query);
  },
};
