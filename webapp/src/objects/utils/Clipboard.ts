import { warn } from "@tauri-apps/plugin-log";

/**
 * Copies text to the clipboard, returning whether it worked. The Tauri clipboard plugin goes first:
 * it writes through Rust and is immune to webview quirks - WebKitGTK's async Clipboard API rejects
 * on Linux (field report: every copy button failed there while Windows was fine), which is exactly
 * the failure this helper exists to absorb. The webview APIs remain as fallbacks so the helper also
 * works outside the shell (vitest, a plain browser).
 *
 * Callers show their "copied" confirmation only when this returns true: confirming a copy that
 * never happened is how the Linux breakage stayed invisible.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    const { writeText } = await import("@tauri-apps/plugin-clipboard-manager");
    await writeText(text);
    return true;
  } catch (e) {
    // Not in a Tauri shell, or the plugin call failed: fall through to the webview APIs.
    warn("[Clipboard] plugin write failed, falling back: " + e);
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fall through to the legacy path.
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "-1000px";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    const copied = document.execCommand("copy");
    area.remove();
    return copied;
  } catch {
    return false;
  }
}
