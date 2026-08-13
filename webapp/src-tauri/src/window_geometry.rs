//! Where the synchronized set-sail click lands inside the game window.
//!
//! One implementation for both platforms: the Windows path had it inline and Linux had its own copy
//! of the same formula, so it now lives here and they both call it. The click works in the field
//! today, multi-monitor included, so these tests exist to keep it that way - de-elevating the GUI
//! (#732) must not move it, and a regression here is otherwise invisible, since a mis-placed click
//! lands somewhere harmless and nothing reports it (#815).

/// The game's forced main-menu aspect ratio; everything else is black bars.
pub(crate) const GAME_ASPECT_RATIO: f32 = 16.0 / 9.0;

/// Where a proportional point on the game's 16:9 content lands inside a window of the given size,
/// black bars accounted for.
///
/// The main menu is always rendered at 16:9 whatever the window's shape, so the content sits centred
/// inside bars: on a taller window they are above and below, on a wider one left and right. A point
/// given in content proportions therefore has to be scaled to the content, then pushed past the bar.
pub(crate) fn content_click_point(
    window_width: f32,
    window_height: f32,
    x_prop: f32,
    y_prop: f32,
) -> (f32, f32) {
    let window_aspect_ratio = window_width / window_height;
    let (game_content_width, game_content_height, black_bar_width, black_bar_height) =
        if window_aspect_ratio < GAME_ASPECT_RATIO {
            // Black bars top and bottom.
            let game_content_height = window_width * 9.0 / 16.0;
            let black_bar_height = (window_height - game_content_height) / 2.0;
            (window_width, game_content_height, 0.0, black_bar_height)
        } else {
            // Black bars left and right.
            let game_content_width = window_height * 16.0 / 9.0;
            let black_bar_width = (window_width - game_content_width) / 2.0;
            (game_content_width, window_height, black_bar_width, 0.0)
        };

    (
        x_prop * game_content_width + black_bar_width,
        y_prop * game_content_height + black_bar_height,
    )
}

/// The same point in whole pixels, as the Win32 click needs it. Truncating, exactly as the `as
/// c_int` cast it replaced did.
// Only the Windows click calls it; the module stays platform-neutral so its tests run everywhere.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn letterboxed_point(
    window_width: i32,
    window_height: i32,
    x_prop: f32,
    y_prop: f32,
) -> (i32, i32) {
    let (x, y) = content_click_point(
        window_width as f32,
        window_height as f32,
        x_prop,
        y_prop,
    );
    (x as i32, y as i32)
}

#[cfg(test)]
mod tests {
    use super::letterboxed_point;

    // 700;750 on a 1920x1080 reference is the middle of the "Set sail" button; every case below
    // asks for that same proportional point and checks where it lands.
    const X_PROP: f32 = 700.0 / 1920.0;
    const Y_PROP: f32 = 750.0 / 1080.0;

    #[test]
    fn a_16_9_window_needs_no_bars() {
        assert_eq!(letterboxed_point(1920, 1080, X_PROP, Y_PROP), (700, 750));
        // Same ratio, half the size: the point scales with it.
        assert_eq!(letterboxed_point(960, 540, X_PROP, Y_PROP), (350, 375));
    }

    #[test]
    fn a_taller_window_gets_bars_above_and_below() {
        // 16:10. The content is 1920x1080 centred in 1920x1200, so 60px of bar on top.
        assert_eq!(letterboxed_point(1920, 1200, X_PROP, Y_PROP), (700, 810));
    }

    #[test]
    fn a_wider_window_gets_bars_left_and_right() {
        // 21:9 (2560x1080): the content stays 1920 wide, centred, so 320px of bar on the left.
        assert_eq!(letterboxed_point(2560, 1080, X_PROP, Y_PROP), (1020, 750));
    }

    #[test]
    fn the_corners_stay_inside_the_content_area() {
        // The bar offsets are what keep a corner click on the game rather than on a black band.
        assert_eq!(letterboxed_point(2560, 1080, 0.0, 0.0), (320, 0));
        assert_eq!(letterboxed_point(2560, 1080, 1.0, 1.0), (2240, 1080));
    }
}
