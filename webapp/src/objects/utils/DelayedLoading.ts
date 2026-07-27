import { onScopeDispose, ref, Ref, watch } from "vue";

/**
 * When a loading indicator is allowed on screen.
 *
 * Binding a spinner straight to "is this request in flight?" is what makes an interface feel cheap.
 * Two things go wrong, and they are opposites:
 *
 *  - **It appears when it was not needed.** Work that finishes in 150ms still flashes a spinner. The
 *    eye reads the flicker as a stutter, so the fast path is the one that looks broken.
 *  - **It disappears the instant it arrived.** The request lands 30ms after the spinner shows and
 *    the user gets a blink they cannot resolve into anything.
 *
 * So the indicator waits, and once it has committed, it stays:
 *
 *  - `delay` — nothing is shown for this long. Under ~0.1s a result reads as instantaneous and needs
 *    no feedback at all; up to ~1s the user is still following their own train of thought and does
 *    not yet doubt the click (Nielsen's response-time limits). 400ms sits between the two: past the
 *    point where "instant" stops being believable, well before the point where silence worries.
 *  - `minDuration` — once shown, it holds for this long even if the work is already done. Below
 *    roughly this, an appearance is a blink rather than an event.
 *
 * Worst case — work that finishes just after the delay elapses — the indicator holds the screen for
 * `delay + minDuration`, which is why the two together stay under the 1s flow limit.
 *
 * @param busy   whether the work is in flight
 * @param delay  ms of silence before the indicator may appear
 * @param minDuration ms it stays once it has appeared
 * @returns whether the indicator should be rendered
 */
export function useDelayedLoading(
  busy: Ref<boolean>,
  delay = 400,
  minDuration = 400,
): Ref<boolean> {
  const visible = ref(false);
  let appearTimer: ReturnType<typeof setTimeout> | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let shownAt = 0;

  const clear = () => {
    clearTimeout(appearTimer);
    clearTimeout(hideTimer);
    appearTimer = undefined;
    hideTimer = undefined;
  };

  watch(
    busy,
    (isBusy) => {
      clear();
      if (isBusy) {
        // Not visible yet: the work has `delay` to finish before anyone is told about it.
        appearTimer = setTimeout(() => {
          shownAt = Date.now();
          visible.value = true;
        }, delay);
        return;
      }
      if (!visible.value) {
        return; // finished inside the delay — the user never knew there was a wait
      }
      const left = minDuration - (Date.now() - shownAt);
      if (left <= 0) {
        visible.value = false;
      } else {
        hideTimer = setTimeout(() => (visible.value = false), left);
      }
    },
    { immediate: true },
  );

  onScopeDispose(clear);

  return visible;
}
