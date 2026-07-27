import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import { useDelayedLoading } from "@/objects/DelayedLoading.ts";

// The composable reads Date.now() to work out how long it has been visible, so the clock has to be
// faked alongside the timers or the minimum-duration branch measures real elapsed time (~0ms).
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** Runs the composable inside a scope, the way a component would. */
function mount(busy: ReturnType<typeof ref<boolean>>) {
  const scope = effectScope();
  const visible = scope.run(() => useDelayedLoading(busy as never))!;
  return { visible, stop: () => scope.stop() };
}

describe("useDelayedLoading", () => {
  it("stays hidden while the work finishes inside the delay", async () => {
    const busy = ref(true);
    const { visible } = mount(busy);

    vi.advanceTimersByTime(390);
    busy.value = false;
    await nextTick();
    vi.advanceTimersByTime(2000);

    // The fast path is the one that must not flicker.
    expect(visible.value).toBe(false);
  });

  it("appears once the work outlasts the delay", async () => {
    const busy = ref(true);
    const { visible } = mount(busy);

    vi.advanceTimersByTime(399);
    expect(visible.value).toBe(false);

    vi.advanceTimersByTime(1);
    expect(visible.value).toBe(true);
  });

  it("holds for the minimum duration rather than blinking", async () => {
    const busy = ref(true);
    const { visible } = mount(busy);

    vi.advanceTimersByTime(400);
    expect(visible.value).toBe(true);

    // Work lands 50ms after the indicator committed to the screen.
    vi.advanceTimersByTime(50);
    busy.value = false;
    await nextTick();
    expect(visible.value).toBe(true);

    vi.advanceTimersByTime(349);
    expect(visible.value).toBe(true);
    vi.advanceTimersByTime(1);
    expect(visible.value).toBe(false);
  });

  it("hides immediately when it has already been up long enough", async () => {
    const busy = ref(true);
    const { visible } = mount(busy);

    vi.advanceTimersByTime(400 + 400);
    expect(visible.value).toBe(true);

    busy.value = false;
    await nextTick();
    expect(visible.value).toBe(false);
  });

  it("restarts the delay when the work starts again", async () => {
    const busy = ref(true);
    const { visible } = mount(busy);

    vi.advanceTimersByTime(400 + 400);
    busy.value = false;
    await nextTick();
    expect(visible.value).toBe(false);

    busy.value = true;
    await nextTick();
    vi.advanceTimersByTime(399);
    expect(visible.value).toBe(false);
    vi.advanceTimersByTime(1);
    expect(visible.value).toBe(true);
  });

  it("drops its pending timers when the scope goes away", async () => {
    const busy = ref(true);
    const { visible, stop } = mount(busy);

    stop();
    vi.advanceTimersByTime(2000);

    // A component unmounted mid-request must not flip a ref nobody is watching any more.
    expect(visible.value).toBe(false);
  });
});
