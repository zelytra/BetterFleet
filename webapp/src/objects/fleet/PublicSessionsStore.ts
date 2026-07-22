import { reactive } from "vue";
import { error } from "tauri-plugin-log-api";
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
let poll: number | undefined;
// When the last SSE frame arrived. A stream that is working keeps this fresh and the poll idles.
let lastFrameAt = 0;

// Slow enough to be free (the browser is only open while picking a session), fast enough that a
// session appearing or closing does not feel missed.
const POLL_INTERVAL_MS = 5000;

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
 * on every structural change (issue #599), so the list moves as sessions come and go instead of
 * only on Refresh.
 *
 * The stream is an optimisation, not the mechanism. It cannot be relied on: every other backend
 * call goes through Tauri's HTTP plugin — i.e. through Rust — while EventSource is a webview API
 * and takes a completely different route out of the app (its own CORS, whatever proxy sits in
 * front, no Tauri involvement). That asymmetry is invisible from here and it is exactly what
 * "the list only updates when I press Refresh" looks like. So {@link POLL_INTERVAL_MS} backstops
 * it, and the poll skips itself whenever the stream is doing its job — costing nothing when it
 * works, and keeping the list live when it doesn't.
 */
function connectStream(): void {
  disconnect();
  const url = import.meta.env.VITE_BACKEND_HOST + "/public-sessions/stream";
  // EventSource is a webview API — unlike our REST calls, which tunnel through Rust — so from the
  // app's secure origin (https://tauri.localhost on Windows) it cannot open an http:// backend: the
  // webview blocks it as mixed content before a single frame arrives. That is the whole of local dev,
  // where the backend is plain http, and it produced nothing but a recurring console error. Skip the
  // doomed attempt and let the poll carry the list; production is https end to end, so the stream is
  // still used there. (See POLL_INTERVAL_MS.)
  const blockedAsMixedContent =
    window.location.protocol === "https:" && url.startsWith("http://");
  if (!blockedAsMixedContent) {
    try {
      stream = new EventSource(url);
      stream.onmessage = (event: MessageEvent) => {
        lastFrameAt = Date.now();
        try {
          applySnapshot(JSON.parse(event.data));
        } catch {
          /* ignore a malformed frame */
        }
      };
      // A stream that connects and later drops still deserves a breadcrumb; the poll has it covered.
      stream.onerror = () => {
        error(
          "[PublicSessionsStore] SSE stream failed, falling back to polling: " +
            url,
        );
      };
    } catch (e) {
      error(
        "[PublicSessionsStore] EventSource unavailable, polling instead: " + e,
      );
    }
  }
  startPolling();
}

/**
 * Refreshes only while the stream is silent. A live stream keeps lastFrameAt moving, so this
 * costs one comparison per tick and no request at all.
 */
function startPolling(): void {
  stopPolling();
  poll = setInterval(() => {
    if (Date.now() - lastFrameAt < POLL_INTERVAL_MS) {
      return; // the stream is delivering; nothing to do
    }
    void refresh();
  }, POLL_INTERVAL_MS) as unknown as number;
}

function stopPolling(): void {
  if (poll !== undefined) {
    clearInterval(poll);
    poll = undefined;
  }
}

function disconnect(): void {
  stopPolling();
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
