//! Shared X11 plumbing for the Linux native integration (#731): a display connection, predicate-based
//! top-level window discovery (title, `WM_CLASS`, owning PID), and EWMH client-message sends. Both the
//! synchronized set-sail
//! auto-click (`window_interaction_linux`) and the in-game overlay stacking fix (`overlay_x11`)
//! build on it.
//!
//! **X11-first** (the Linux port, #350). Everything here needs a running X server. Under Wayland it
//! reaches XWayland clients when `$DISPLAY` is set (so a Proton/Wine game or the GTK overlay are
//! still addressable) and returns `None`/errors cleanly otherwise, letting callers degrade to their
//! manual / best-effort path instead of failing.

use log::warn;
use x11rb::connection::Connection;
use x11rb::protocol::xproto::{
    Atom, AtomEnum, ClientMessageData, ClientMessageEvent, ConnectionExt as _, EventMask, Window,
    CLIENT_MESSAGE_EVENT,
};
use x11rb::rust_connection::RustConnection;

/// A live X11 connection paired with the root window of its default screen.
pub(crate) struct X11Context {
    pub conn: RustConnection,
    pub root: Window,
}

/// Opens the X11 display named by `$DISPLAY`. Returns `None` (with a log line) when there is no
/// reachable X server - e.g. a pure-Wayland session with no XWayland - so callers fall back
/// gracefully rather than erroring.
pub(crate) fn connect() -> Option<X11Context> {
    match x11rb::connect(None) {
        Ok((conn, screen_num)) => {
            let root = conn.setup().roots[screen_num].root;
            Some(X11Context { conn, root })
        }
        Err(e) => {
            warn!("[x11] no X11 display ({e}); native integration unavailable (native Wayland?)");
            None
        }
    }
}

impl X11Context {
    /// Interns an atom, returning `None` when the request fails or (with `only_if_exists`) the atom
    /// is not defined on the server.
    pub fn intern(&self, name: &[u8], only_if_exists: bool) -> Option<Atom> {
        let atom = self
            .conn
            .intern_atom(only_if_exists, name)
            .ok()?
            .reply()
            .ok()?
            .atom;
        (atom != 0).then_some(atom)
    }

    /// Finds a top-level window satisfying `predicate`. Prefers EWMH's `_NET_CLIENT_LIST` - the true
    /// client windows, independent of how the WM reparents them - and falls back to a depth-bounded
    /// tree walk for non-EWMH window managers. Callers supply the predicate (title/class substring,
    /// an owning-PID cross-reference, ...) so this stays free of any single app's matching rules.
    pub(crate) fn find_window(
        &self,
        predicate: &dyn Fn(&X11Context, Window) -> bool,
    ) -> Option<Window> {
        if let Some(window) = self.find_in_client_list(predicate) {
            return Some(window);
        }
        self.find_in_tree(self.root, predicate, 0)
    }

    fn find_in_client_list(
        &self,
        predicate: &dyn Fn(&X11Context, Window) -> bool,
    ) -> Option<Window> {
        let atom = self.intern(b"_NET_CLIENT_LIST", true)?;
        let reply = self
            .conn
            .get_property(false, self.root, atom, AtomEnum::WINDOW, 0, u32::MAX)
            .ok()?
            .reply()
            .ok()?;
        let windows: Vec<Window> = reply.value32()?.collect();
        windows.into_iter().find(|&window| predicate(self, window))
    }

    fn find_in_tree(
        &self,
        window: Window,
        predicate: &dyn Fn(&X11Context, Window) -> bool,
        depth: u8,
    ) -> Option<Window> {
        if depth > 6 {
            return None;
        }
        if predicate(self, window) {
            return Some(window);
        }
        let tree = self.conn.query_tree(window).ok()?.reply().ok()?;
        tree.children
            .into_iter()
            .find_map(|child| self.find_in_tree(child, predicate, depth + 1))
    }

    /// The window's human title: `_NET_WM_NAME` (UTF-8, what modern WMs and Wine set) with a fallback
    /// to the legacy `WM_NAME`.
    pub(crate) fn window_title(&self, window: Window) -> Option<String> {
        if let Some(atom) = self.intern(b"_NET_WM_NAME", true) {
            if let Some(title) = self.read_text_property(window, atom) {
                if !title.is_empty() {
                    return Some(title);
                }
            }
        }
        self.read_text_property(window, AtomEnum::WM_NAME.into())
    }

    /// The window's `WM_CLASS` (its NUL-separated instance/class), as a lossy UTF-8 string.
    pub(crate) fn wm_class(&self, window: Window) -> Option<String> {
        self.read_text_property(window, AtomEnum::WM_CLASS.into())
    }

    /// The PID that owns `window`, from EWMH `_NET_WM_PID` (a `CARDINAL`). `None` when the window
    /// advertises no PID - not every window sets it - so callers must read "no PID" as "unknown",
    /// never as "not a match".
    pub(crate) fn read_wm_pid(&self, window: Window) -> Option<u32> {
        let atom = self.intern(b"_NET_WM_PID", true)?;
        let reply = self
            .conn
            .get_property(false, window, atom, AtomEnum::CARDINAL, 0, 1)
            .ok()?
            .reply()
            .ok()?;
        // Bind before returning so the value32() iterator, which borrows `reply`, is dropped at this
        // semicolon rather than after `reply` at the end of the block (E0597).
        let pid = reply.value32()?.next();
        pid
    }

    /// Reads a text window-property as a lossy UTF-8 string. `WM_CLASS` comes back NUL-separated; the
    /// caller only substring-matches it, so the embedded NUL is harmless.
    fn read_text_property(&self, window: Window, property: Atom) -> Option<String> {
        let reply = self
            .conn
            .get_property(false, window, property, AtomEnum::ANY, 0, 1024)
            .ok()?
            .reply()
            .ok()?;
        if reply.value.is_empty() {
            return None;
        }
        Some(String::from_utf8_lossy(&reply.value).into_owned())
    }

    /// Sends a 32-bit-format client message about `window` to the root window, with the substructure
    /// masks EWMH requires (`_NET_ACTIVE_WINDOW`, `_NET_WM_STATE`, ...). Errors bubble up for the
    /// caller to log.
    pub fn send_client_message(
        &self,
        window: Window,
        type_: Atom,
        data: [u32; 5],
    ) -> Result<(), Box<dyn std::error::Error>> {
        let event = ClientMessageEvent {
            response_type: CLIENT_MESSAGE_EVENT,
            format: 32,
            sequence: 0,
            window,
            type_,
            data: ClientMessageData::from(data),
        };
        self.conn.send_event(
            false,
            self.root,
            EventMask::SUBSTRUCTURE_NOTIFY | EventMask::SUBSTRUCTURE_REDIRECT,
            event,
        )?;
        self.conn.flush()?;
        Ok(())
    }
}
