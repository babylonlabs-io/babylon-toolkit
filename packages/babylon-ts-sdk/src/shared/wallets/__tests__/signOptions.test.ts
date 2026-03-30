import { describe, expect, it } from "vitest";

import { createTaprootScriptPathSignOptions } from "../signOptions";

const TEST_PUBKEY =
  "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

describe("createTaprootScriptPathSignOptions", () => {
  it("produces a single entry at index 0 for inputCount = 1", () => {
    const opts = createTaprootScriptPathSignOptions(TEST_PUBKEY, 1);

    expect(opts.autoFinalized).toBe(false);
    expect(opts.signInputs).toEqual([
      { index: 0, publicKey: TEST_PUBKEY, disableTweakSigner: true },
    ]);
  });

  it("produces entries at indices 0, 1, 2 for inputCount = 3", () => {
    const opts = createTaprootScriptPathSignOptions(TEST_PUBKEY, 3);

    expect(opts.signInputs).toHaveLength(3);
    expect(opts.signInputs!.map((s) => s.index)).toEqual([0, 1, 2]);
    opts.signInputs!.forEach((s) => {
      expect(s.publicKey).toBe(TEST_PUBKEY);
      expect(s.disableTweakSigner).toBe(true);
    });
  });

  it("throws for inputCount = 0", () => {
    expect(() => createTaprootScriptPathSignOptions(TEST_PUBKEY, 0)).toThrow(
      "inputCount must be a positive integer, got 0",
    );
  });

  it("throws for negative inputCount", () => {
    expect(() => createTaprootScriptPathSignOptions(TEST_PUBKEY, -1)).toThrow(
      "inputCount must be a positive integer, got -1",
    );
  });

  it("throws for NaN", () => {
    expect(() =>
      createTaprootScriptPathSignOptions(TEST_PUBKEY, NaN),
    ).toThrow("inputCount must be a positive integer, got NaN");
  });

  it("throws for non-integer", () => {
    expect(() =>
      createTaprootScriptPathSignOptions(TEST_PUBKEY, 1.5),
    ).toThrow("inputCount must be a positive integer, got 1.5");
  });
});
