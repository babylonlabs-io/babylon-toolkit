/**
 * Unit tests for PSBT options mapping utilities.
 *
 * Covers the precedence rule between `useTweakedSigner` (canonical) and the
 * deprecated `disableTweakSigner` field, and the "forward both in sync"
 * contract used by the OKX and OneKey providers.
 */

import { test, expect } from "@playwright/test";

import type { SignInputOptions } from "../../src/core/types";
import {
  mapSignInputsToToSignInputs,
  resolveUseTweakedSigner,
} from "../../src/core/utils/psbtOptionsMapper";

// ============================================================================
// resolveUseTweakedSigner
// ============================================================================

test.describe("resolveUseTweakedSigner", () => {
  test("returns true when useTweakedSigner is true", () => {
    expect(resolveUseTweakedSigner({ useTweakedSigner: true })).toBe(true);
  });

  test("returns false when useTweakedSigner is false", () => {
    expect(resolveUseTweakedSigner({ useTweakedSigner: false })).toBe(false);
  });

  test("useTweakedSigner wins over disableTweakSigner when both are set (useTweakedSigner: true, disableTweakSigner: true)", () => {
    expect(
      resolveUseTweakedSigner({
        useTweakedSigner: true,
        disableTweakSigner: true,
      }),
    ).toBe(true);
  });

  test("useTweakedSigner wins over disableTweakSigner when both are set (useTweakedSigner: false, disableTweakSigner: false)", () => {
    expect(
      resolveUseTweakedSigner({
        useTweakedSigner: false,
        disableTweakSigner: false,
      }),
    ).toBe(false);
  });

  test("inverts legacy disableTweakSigner: true to useTweakedSigner: false", () => {
    expect(resolveUseTweakedSigner({ disableTweakSigner: true })).toBe(false);
  });

  test("inverts legacy disableTweakSigner: false to useTweakedSigner: true", () => {
    expect(resolveUseTweakedSigner({ disableTweakSigner: false })).toBe(true);
  });

  test("returns undefined when neither field is set", () => {
    expect(resolveUseTweakedSigner({})).toBeUndefined();
  });
});

// ============================================================================
// mapSignInputsToToSignInputs
// ============================================================================

test.describe("mapSignInputsToToSignInputs", () => {
  test("forwards useTweakedSigner and disableTweakSigner in sync when useTweakedSigner: false", () => {
    const input: SignInputOptions = {
      index: 0,
      useTweakedSigner: false,
    };

    const [mapped] = mapSignInputsToToSignInputs([input]);

    expect(mapped.useTweakedSigner).toBe(false);
    expect(mapped.disableTweakSigner).toBe(true);
  });

  test("forwards useTweakedSigner and disableTweakSigner in sync when useTweakedSigner: true", () => {
    const input: SignInputOptions = {
      index: 0,
      useTweakedSigner: true,
    };

    const [mapped] = mapSignInputsToToSignInputs([input]);

    expect(mapped.useTweakedSigner).toBe(true);
    expect(mapped.disableTweakSigner).toBe(false);
  });

  test("translates legacy disableTweakSigner: true to both fields set", () => {
    const input: SignInputOptions = {
      index: 0,
      disableTweakSigner: true,
    };

    const [mapped] = mapSignInputsToToSignInputs([input]);

    expect(mapped.useTweakedSigner).toBe(false);
    expect(mapped.disableTweakSigner).toBe(true);
  });

  test("omits both tweak fields when neither is provided", () => {
    const input: SignInputOptions = {
      index: 0,
    };

    const [mapped] = mapSignInputsToToSignInputs([input]);

    expect(mapped).not.toHaveProperty("useTweakedSigner");
    expect(mapped).not.toHaveProperty("disableTweakSigner");
  });

  test("preserves index, publicKey, address, and sighashTypes", () => {
    const input: SignInputOptions = {
      index: 3,
      publicKey: "0123456789abcdef",
      address: "bc1qexample",
      sighashTypes: [1],
      useTweakedSigner: false,
    };

    const [mapped] = mapSignInputsToToSignInputs([input]);

    expect(mapped.index).toBe(3);
    expect(mapped.publicKey).toBe("0123456789abcdef");
    expect(mapped.address).toBe("bc1qexample");
    expect(mapped.sighashTypes).toEqual([1]);
  });

  test("honors useTweakedSigner precedence when both are provided", () => {
    const input: SignInputOptions = {
      index: 0,
      useTweakedSigner: false,
      disableTweakSigner: false, // contradictory; useTweakedSigner should win
    };

    const [mapped] = mapSignInputsToToSignInputs([input]);

    expect(mapped.useTweakedSigner).toBe(false);
    expect(mapped.disableTweakSigner).toBe(true);
  });
});
