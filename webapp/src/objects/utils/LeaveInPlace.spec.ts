import { describe, expect, it } from "vitest";
import { leaveInPlace } from "@/objects/utils/LeaveInPlace.ts";

// happy-dom does not lay anything out, so the offsets a browser would report are set by hand.
function row(box: {
  top: number;
  left: number;
  width: number;
  height: number;
}) {
  const el = document.createElement("div");
  el.style.margin = "0 8px";
  Object.defineProperties(el, {
    offsetTop: { value: box.top },
    offsetLeft: { value: box.left },
    offsetWidth: { value: box.width },
    offsetHeight: { value: box.height },
  });
  return el;
}

describe("leaveInPlace", () => {
  it("pins a leaving row on the exact box it occupied", () => {
    const el = row({ top: 118, left: 16, width: 912, height: 48 });

    leaveInPlace(el);

    expect(el.style.position).toBe("absolute");
    expect(el.style.top).toBe("118px");
    expect(el.style.left).toBe("16px");
    // Out of the flow a grid row shrinks to its content: the size has to be held as well.
    expect(el.style.width).toBe("912px");
    expect(el.style.height).toBe("48px");
  });

  it("drops the margin its offsets already include", () => {
    const el = row({ top: 0, left: 16, width: 912, height: 48 });

    leaveInPlace(el);

    expect(el.style.margin).toBe("0px");
  });

  it("lets clicks through to the row sliding into its place", () => {
    const el = row({ top: 0, left: 0, width: 100, height: 48 });

    leaveInPlace(el);

    expect(el.style.pointerEvents).toBe("none");
  });

  it("ignores anything that is not an HTML element", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "g");

    expect(() => leaveInPlace(svg)).not.toThrow();
  });
});
