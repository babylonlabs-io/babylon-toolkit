/**
 * Shared helpers for cards whose body acts as a button (opening the deposit
 * multistepper) while still hosting their own interactive children (Copy
 * buttons, explorer links, a hoisted Broadcast button).
 */

import type { KeyboardEvent, MouseEvent } from "react";

/**
 * True when the event originated on an interactive descendant (a `<button>` or
 * `<a>`), so the card-level click/keydown handler should defer to it instead of
 * opening the multistepper. `closest` walks up from the event target, so a
 * click on the inner SVG of a Copy button still resolves to its button parent.
 */
export function isInteractiveEventTarget(
  event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>,
): boolean {
  const target = event.target as HTMLElement;
  return Boolean(target.closest("button, a"));
}
