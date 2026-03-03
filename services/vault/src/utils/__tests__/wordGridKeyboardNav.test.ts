import { describe, expect, it } from "vitest";

import { getNextFocusIndex } from "../wordGridKeyboardNav";

const WORD_COUNT = 12;

describe("getNextFocusIndex", () => {
  describe("Space key", () => {
    it("moves forward from a middle field", () => {
      const result = getNextFocusIndex(
        3,
        { key: " ", shiftKey: false },
        WORD_COUNT,
        false,
      );
      expect(result).toEqual({ focusIndex: 4, preventDefault: true });
    });

    it("does not move past the last field", () => {
      const result = getNextFocusIndex(
        11,
        { key: " ", shiftKey: false },
        WORD_COUNT,
        false,
      );
      expect(result).toEqual({ focusIndex: null, preventDefault: true });
    });

    it("moves forward from the first field", () => {
      const result = getNextFocusIndex(
        0,
        { key: " ", shiftKey: false },
        WORD_COUNT,
        false,
      );
      expect(result).toEqual({ focusIndex: 1, preventDefault: true });
    });
  });

  describe("Tab key", () => {
    it("moves forward on Tab", () => {
      const result = getNextFocusIndex(
        5,
        { key: "Tab", shiftKey: false },
        WORD_COUNT,
        false,
      );
      expect(result).toEqual({ focusIndex: 6, preventDefault: true });
    });

    it("moves backward on Shift+Tab", () => {
      const result = getNextFocusIndex(
        5,
        { key: "Tab", shiftKey: true },
        WORD_COUNT,
        false,
      );
      expect(result).toEqual({ focusIndex: 4, preventDefault: true });
    });

    it("lets browser handle Tab at the last field", () => {
      const result = getNextFocusIndex(
        11,
        { key: "Tab", shiftKey: false },
        WORD_COUNT,
        false,
      );
      expect(result).toEqual({ focusIndex: null, preventDefault: false });
    });

    it("lets browser handle Shift+Tab at the first field", () => {
      const result = getNextFocusIndex(
        0,
        { key: "Tab", shiftKey: true },
        WORD_COUNT,
        false,
      );
      expect(result).toEqual({ focusIndex: null, preventDefault: false });
    });
  });

  describe("Backspace key", () => {
    it("moves backward when the current field is empty", () => {
      const result = getNextFocusIndex(
        4,
        { key: "Backspace", shiftKey: false },
        WORD_COUNT,
        true,
      );
      expect(result).toEqual({ focusIndex: 3, preventDefault: false });
    });

    it("does nothing when the current field has text", () => {
      const result = getNextFocusIndex(
        4,
        { key: "Backspace", shiftKey: false },
        WORD_COUNT,
        false,
      );
      expect(result).toEqual({ focusIndex: null, preventDefault: false });
    });

    it("does nothing at the first field even if empty", () => {
      const result = getNextFocusIndex(
        0,
        { key: "Backspace", shiftKey: false },
        WORD_COUNT,
        true,
      );
      expect(result).toEqual({ focusIndex: null, preventDefault: false });
    });
  });

  describe("other keys", () => {
    it("returns null for unrelated keys", () => {
      const result = getNextFocusIndex(
        3,
        { key: "a", shiftKey: false },
        WORD_COUNT,
        false,
      );
      expect(result).toEqual({ focusIndex: null, preventDefault: false });
    });
  });
});
