/**
 * A TransitionGroup `before-leave` hook that takes the leaving element out of the flow without
 * moving it on screen.
 *
 * A leaving row otherwise keeps its slot until its fade ends, then vanishes, and every row under it
 * jumps up at once. Pinned absolutely at the exact box it occupied, it fades where it stood while
 * the rows below slide into the gap through the group's `-move` transition (Vue's FLIP), which is
 * what makes a player leaving the lobby look smooth rather than abrupt.
 *
 * The box is read from the element's offsets, so it is relative to its offsetParent: whatever
 * absolutely positions it there, the same parent, keeps it where it was. Width and height are
 * pinned too, because an absolutely positioned grid row would otherwise shrink to its content.
 */
export function leaveInPlace(el: Element): void {
  if (!(el instanceof HTMLElement)) return;
  const { offsetTop, offsetLeft, offsetWidth, offsetHeight } = el;
  el.style.position = "absolute";
  el.style.top = `${offsetTop}px`;
  el.style.left = `${offsetLeft}px`;
  el.style.width = `${offsetWidth}px`;
  el.style.height = `${offsetHeight}px`;
  el.style.margin = "0";
  el.style.boxSizing = "border-box";
  // A row on its way out must not catch the right-click meant for the one sliding under it.
  el.style.pointerEvents = "none";
}
