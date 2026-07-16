import { BoatSize } from "@/objects/fleet/Player.ts";
import boat from "@assets/icons/boat.svg";
import sloop from "@assets/icons/boats/sloop.svg";
import brigantine from "@assets/icons/boats/brigantine.svg";
import galleon from "@assets/icons/boats/galleon.svg";

/**
 * The ship a boat size is drawn as. Shared rather than local to a component — the Settings picker and
 * the player row both draw it, and they have to agree.
 *
 * NONE keeps the old generic hull: "not specified" has no ship to show, and a blank cell would read
 * as a missing icon.
 */
const ICONS: Record<BoatSize, string> = {
  [BoatSize.NONE]: boat,
  [BoatSize.SLOOP]: sloop,
  [BoatSize.BRIGANTINE]: brigantine,
  [BoatSize.GALLEON]: galleon,
};

/**
 * Falls back rather than indexes blind: a player's boat size arrives from the backend or out of
 * localStorage, so by the time it reaches a render it is whatever was stored — an old preference, or
 * anything a client chose to send. An unknown value would resolve to undefined and leave a broken
 * image glyph in the fleet list, which is the bug the "All" filter option already shipped once.
 */
export function boatIcon(size: unknown): string {
  return ICONS[size as BoatSize] ?? boat;
}
