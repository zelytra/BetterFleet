/**
 * True when the app is running in the Linux desktop shell (WebKitGTK). Windows and macOS run on
 * WebView2 / WKWebView instead, neither of which reports "Linux" here.
 *
 * Drives the raise-anchor auto-click gate: KDE/GNOME Wayland compositors block the synthetic click
 * (XTEST) the macro relies on, so the feature stays Windows/macOS-only and Linux players are told to
 * click "Set sail" themselves.
 */
export function isLinux(): boolean {
  return /linux/i.test(navigator.userAgent);
}
