/**
 * Keyboard navigation helpers for the mnemonic word grid.
 *
 * Determines which input to focus next based on keypress:
 * - Space → move forward
 * - Tab → move forward (Shift+Tab → move backward)
 * - Backspace on empty field → move backward
 *
 * Returns the index to focus, or `null` when the browser default
 * should be preserved (e.g. Tab at the last field).
 */

export interface WordGridKeyEvent {
  key: string;
  shiftKey: boolean;
}

export function getNextFocusIndex(
  index: number,
  event: WordGridKeyEvent,
  wordCount: number,
  isCurrentEmpty: boolean,
): { focusIndex: number | null; preventDefault: boolean } {
  if (event.key === " ") {
    return {
      focusIndex: index < wordCount - 1 ? index + 1 : null,
      preventDefault: true,
    };
  }

  if (event.key === "Tab") {
    if (event.shiftKey && index > 0) {
      return { focusIndex: index - 1, preventDefault: true };
    }
    if (!event.shiftKey && index < wordCount - 1) {
      return { focusIndex: index + 1, preventDefault: true };
    }
    // First/last field — let browser handle Tab normally
    return { focusIndex: null, preventDefault: false };
  }

  if (event.key === "Backspace" && isCurrentEmpty && index > 0) {
    return { focusIndex: index - 1, preventDefault: false };
  }

  return { focusIndex: null, preventDefault: false };
}
