/**
 * Tests for the one-shot getMnemonic pattern in useDepositPageFlow.
 *
 * The hook itself requires many context providers, so these tests verify
 * the closure behaviour directly — the same logic used inside useMemo.
 */

import { describe, expect, it } from "vitest";

describe("one-shot getMnemonic pattern", () => {
  /**
   * Simulates the closure created by the useMemo in useDepositPageFlow.
   * Mirrors the production code:
   *   mnemonicRef.current
   *     ? async () => { const v = mnemonicRef.current; mnemonicRef.current = undefined; if (!v) throw ...; return v; }
   *     : undefined
   */
  function createOneShotGetter(ref: { current: string | undefined }) {
    if (!ref.current) return undefined;
    return async () => {
      const value = ref.current;
      ref.current = undefined;
      if (!value) {
        throw new Error("Mnemonic has already been consumed");
      }
      return value;
    };
  }

  it("returns the mnemonic and clears the ref on first call", async () => {
    const ref = { current: "test mnemonic" };
    const getMnemonic = createOneShotGetter(ref)!;

    const result = await getMnemonic();

    expect(result).toBe("test mnemonic");
    expect(ref.current).toBeUndefined();
  });

  it("throws on second call after mnemonic was consumed", async () => {
    const ref = { current: "test mnemonic" };
    const getMnemonic = createOneShotGetter(ref)!;

    await getMnemonic(); // consume

    await expect(getMnemonic()).rejects.toThrow(
      "Mnemonic has already been consumed",
    );
  });

  it("returns undefined when ref has no mnemonic", () => {
    const ref = { current: undefined };
    const getMnemonic = createOneShotGetter(ref);

    expect(getMnemonic).toBeUndefined();
  });
});
