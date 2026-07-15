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
 * The backend sends the session list and the connected-players count together, so both stay in
 * sync whether the snapshot arrives by REST or over the SSE stream.
 */
function applySnapshot(snapshot: any): void {
  if (!snapshot) {
    return;
  }
  if (Array.isArray(snapshot.sessions)) {
    state.sessions = snapshot.sessions as PublicSession[];
  }
  if (typeof snapshot.connectedPlayers === "number") {
    state.connectedPlayers = snapshot.connectedPlayers;
  }
}

/**
 * REST snapshot: the guaranteed path (goes through the Tauri http plugin, like every other backend
 * call). Used on mount and by the Refresh button; the last known snapshot is kept on failure.
 */
async function refresh(): Promise<void> {
  state.loading = true;
  try {
    const response = await new HTTPAxios("public-sessions").get();
    applySnapshot(response.data);
  } catch {
    /* keep the last known snapshot */
  }
  state.loading = false;
}

/**
 * Live updates: the backend pushes a fresh snapshot — the list *and* the connected-players count —
 * on every structural change (issue #599), so the counter moves as players come and go instead of
 * only on Refresh. The webview already opens direct WebSocket connections to the backend, so an
 * EventSource to the same origin is allowed; if it ever fails, refresh() keeps the browser usable.
 */
function connectStream(): void {
  disconnect();
  try {
    stream = new EventSource(
      import.meta.env.VITE_BACKEND_HOST + "/public-sessions/stream",
    );
    stream.onmessage = (event: MessageEvent) => {
      try {
        applySnapshot(JSON.parse(event.data));
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
