import { fetch, ResponseType } from "@tauri-apps/api/http";
import { error, info } from "tauri-plugin-log-api";

// In-app changelog (#686). The updater ships new versions silently; this decides when a "what's
// new" is due and turns the GitHub release body into a few readable lines. Pure parts are exported
// for tests; the fetch fails to null so the modal can fall back to a plain link.

export type WhatsNewDecision = "show" | "adopt-silently" | "none";

/**
 * Fresh install (nothing recorded) adopts the current version silently — there is nothing "new"
 * to a first-time player. A recorded, different version means an update landed: show the notes.
 */
export function whatsNewDecision(
  lastSeen: string | null,
  current: string | undefined,
): WhatsNewDecision {
  if (!current) return "none";
  if (!lastSeen) return "adopt-silently";
  return lastSeen === current ? "none" : "show";
}

/**
 * Release bodies are markdown written for GitHub; the modal wants short plain lines. Headings
 * become plain text, bold and links unwrap, blanks drop, and the list caps so the modal stays a
 * modal. Exported for tests.
 */
export function simplifyReleaseNotes(body: string): string[] {
  return (
    body
      .split(/\r?\n/)
      .map((line) =>
        line
          .replace(/^#+\s*/, "")
          .replace(/\*\*([^*]+)\*\*/g, "$1")
          .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
          // The auto-generated bullets end with "by @user in https://…/pull/N" — the modal reader
          // cares about the change, not the plumbing.
          .replace(/\s+by @[\w-]+ in https?:\/\/\S+$/, "")
          .trimEnd(),
      )
      .filter((line) => line.trim().length > 0)
      // tauri-action boilerplate and the trailing compare link say nothing about the release.
      .filter((line) => !/^See the assets to download/i.test(line))
      .filter((line) => !/^Full Changelog:/i.test(line))
      .slice(0, 20)
  );
}

export function releaseUrl(version: string): string {
  return "https://github.com/zelytra/BetterFleet/releases/tag/v" + version;
}

/** The release notes for a tag, simplified — or null (missing release, offline, rate-limited). */
export async function fetchReleaseNotes(
  version: string,
): Promise<string[] | null> {
  try {
    const response = await fetch(
      "https://api.github.com/repos/zelytra/BetterFleet/releases/tags/v" +
        version,
      {
        method: "GET",
        responseType: ResponseType.JSON,
        // GitHub's API refuses requests without a User-Agent.
        headers: {
          "User-Agent": "BetterFleet",
          Accept: "application/vnd.github+json",
        },
        timeout: 8,
      },
    );
    if (!response.ok) {
      // GitHub answered but refused (rate limit, missing tag…): name it in the logs instead of
      // failing into the fallback silently — that silence is exactly what made this undebuggable.
      const reason = (response.data as { message?: string } | undefined)
        ?.message;
      error(
        "[WhatsNew] GitHub refused the release notes: HTTP " +
          response.status +
          (reason ? " — " + reason : ""),
      );
      return null;
    }
    const body = (response.data as { body?: string } | undefined)?.body;
    if (!body) {
      error("[WhatsNew] release v" + version + " has no body");
      return null;
    }
    const lines = simplifyReleaseNotes(body);
    info("[WhatsNew] release notes loaded for v" + version);
    return lines.length ? lines : null;
  } catch (e) {
    error("[WhatsNew] release notes fetch failed: " + e);
    return null;
  }
}
