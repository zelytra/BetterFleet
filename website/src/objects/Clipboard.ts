/**
 * Copies text to the clipboard, returning whether it worked. Tries the async Clipboard API first,
 * then falls back to a hidden textarea + execCommand("copy") - the legacy path still honoured by
 * every browser inside a user gesture. The fallback matters in the field: the async API rejects
 * with NotAllowedError in several real configurations (Firefox with dom.events.asyncClipboard
 * restrictions, "document is not focused" races, embedded webviews), which is exactly the "copy
 * shows an error" report this file exists to close out.
 */
export async function copyText(text: string): Promise<boolean> {
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
    // Off-viewport but not display:none - a hidden element cannot be selected.
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
