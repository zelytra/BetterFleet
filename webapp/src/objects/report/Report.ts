import { HTTPAxios } from "@/objects/utils/HTTPAxios.ts";
import { info, warn } from "@tauri-apps/plugin-log";

export interface ReportInterface {
  message: string;
  logs: string;
  device: string;
}

// The bug-report message cap. The column is Postgres `text`, so this is only a client-side sanity
// cap, sized (#690) for a player's note plus a couple of diagnostic captures: the previous 500
// filled up the moment one capture was involved.
export const MESSAGE_MAX_LENGTH = 15000;

// Read by whoever triages the report, not by the player, so deliberately not translated.
export const DIAGNOSTIC_HEADER = "\n\n--- auto-diagnostic capture ---\n";
export const DIAGNOSTIC_TRUNCATED =
  "\n[capture truncated to fit the report cap]";

/**
 * Appends a diagnostic capture to the player's message, keeping the result under `limit`.
 *
 * The guided flow (#688) assumed the capture would ride along inside the exported logs (the Rust
 * side logs the full JSON), but `get_logs` keeps the FIRST lines of each log file while a fresh
 * capture lands at the END of the current one: on any session past a few thousand log lines the
 * scan fell outside the export and the report arrived without it. Attaching the capture to the
 * message makes the report self-sufficient. When it cannot fit whole, it is cut at the cap with an
 * explicit marker - the player's own words are never the part sacrificed.
 */
export function attachDiagnostic(
  message: string,
  scan: string,
  limit: number = MESSAGE_MAX_LENGTH,
): string {
  if (!scan) return message;
  const full = message + DIAGNOSTIC_HEADER + scan;
  if (full.length <= limit) return full;
  const room =
    limit -
    message.length -
    DIAGNOSTIC_HEADER.length -
    DIAGNOSTIC_TRUNCATED.length;
  if (room <= 0) return message;
  return (
    message + DIAGNOSTIC_HEADER + scan.slice(0, room) + DIAGNOSTIC_TRUNCATED
  );
}

export class BugReport {
  public report: ReportInterface;

  constructor(report: ReportInterface) {
    this.report = report;
  }

  sendReport() {
    info("[Report.ts] Sending a report");
    // Best effort: HTTPAxios rejects on a non-2xx now, so swallow a failed send rather than leaking an
    // unhandled rejection (the report is fire-and-forget, nothing awaits it).
    new HTTPAxios("report/send").post(this.report).catch(() => {
      warn("[Report.ts] Failed to send the report");
    });
  }
}
