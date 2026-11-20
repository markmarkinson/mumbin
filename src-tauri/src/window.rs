//! The main window remembers where it was and comes back there.

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::settings::{self, WindowState};

/// Smallest part of a remembered window that must lie on a screen, in pixels:
/// enough to grab the title bar.
const NEEDED_WIDTH: i64 = 120;
const NEEDED_HEIGHT: i64 = 60;

/// Where a window that was maximized before it was ever moved returns to.
const FIRST_NORMAL_STATE: WindowState = WindowState {
    x: 60,
    y: 60,
    width: 1280,
    height: 800,
    maximized: true,
};

/// Remembers the window's place and size, at most once a second while it
/// moves; the close request (`closing`) writes the final state.
pub(crate) fn remember(window: &tauri::Window, closing: bool) {
    static LAST: AtomicU64 = AtomicU64::new(0);
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |elapsed| {
            u64::try_from(elapsed.as_millis()).unwrap_or(u64::MAX)
        });
    if !closing && now.saturating_sub(LAST.load(Ordering::Relaxed)) < 1000 {
        return;
    }
    LAST.store(now, Ordering::Relaxed);
    if window.is_minimized().unwrap_or(false) || window.is_fullscreen().unwrap_or(false) {
        return;
    }
    let previous = settings::window_state();
    let state = if window.is_maximized().unwrap_or(false) {
        // Keep the size the window has when it is not maximized.
        previous.map_or(FIRST_NORMAL_STATE, |normal| WindowState {
            maximized: true,
            ..normal
        })
    } else {
        let (Ok(position), Ok(size)) = (window.outer_position(), window.inner_size()) else {
            return;
        };
        WindowState {
            x: position.x,
            y: position.y,
            width: size.width,
            height: size.height,
            maximized: false,
        }
    };
    if previous != Some(state) {
        settings::set_window_state(state);
    }
}

/// Puts the window where it was last time, if that place can still be reached.
pub(crate) fn restore(window: &tauri::WebviewWindow) {
    let Some(state) = settings::window_state() else {
        return;
    };
    let screens: Vec<(i32, i32, u32, u32)> = window
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|monitor| {
            let (position, size) = (monitor.position(), monitor.size());
            (position.x, position.y, size.width, size.height)
        })
        .collect();
    if !is_reachable(&state, &screens) {
        return;
    }
    let _ = window.set_size(tauri::PhysicalSize::new(state.width, state.height));
    let _ = window.set_position(tauri::PhysicalPosition::new(state.x, state.y));
    if state.maximized {
        let _ = window.maximize();
    }
}

/// A remembered window is only restored when enough of it lies on a screen
/// that is still connected. `screens` are `(x, y, width, height)`.
fn is_reachable(state: &WindowState, screens: &[(i32, i32, u32, u32)]) -> bool {
    screens.iter().any(|&(sx, sy, sw, sh)| {
        let left = i64::from(state.x).max(i64::from(sx));
        let top = i64::from(state.y).max(i64::from(sy));
        let right =
            (i64::from(state.x) + i64::from(state.width)).min(i64::from(sx) + i64::from(sw));
        let bottom =
            (i64::from(state.y) + i64::from(state.height)).min(i64::from(sy) + i64::from(sh));
        right - left >= NEEDED_WIDTH && bottom - top >= NEEDED_HEIGHT
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const ONE: [(i32, i32, u32, u32); 1] = [(0, 0, 1920, 1080)];
    const TWO: [(i32, i32, u32, u32); 2] = [(0, 0, 1920, 1080), (1920, 0, 1920, 1080)];

    fn at(x: i32, y: i32) -> WindowState {
        WindowState {
            x,
            y,
            width: 1280,
            height: 800,
            maximized: false,
        }
    }

    #[test]
    fn a_window_is_restored_only_where_it_can_be_reached() {
        assert!(is_reachable(&at(100, 100), &ONE));
        assert!(is_reachable(&at(-1100, 10), &ONE), "180 px still show");
        assert!(!is_reachable(&at(-1200, 10), &ONE), "80 px are too little");
        assert!(!is_reachable(&at(1850, 100), &ONE), "70 px are too little");
        assert!(
            !is_reachable(&at(100, 1050), &ONE),
            "30 px high are too little"
        );
        // A second screen that is gone takes its windows with it.
        assert!(is_reachable(&at(2500, 100), &TWO));
        assert!(!is_reachable(&at(2500, 100), &ONE));
        assert!(!is_reachable(&at(100, 100), &[]));
    }
}
