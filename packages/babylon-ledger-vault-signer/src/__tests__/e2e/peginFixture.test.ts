/**
 * Ungated (no Speculos) guards for the e2e fixtures — regressions here must
 * fail in CI without the emulator.
 *
 * @module ledger-vault-signer/__tests__/e2e/peginFixture.test
 */

import { describe, expect, it } from "vitest";

import { assertBip86Path } from "../../bip86Path";
import { DEPOSITOR_PATH } from "./peginFixture";

describe("peginFixture DEPOSITOR_PATH", () => {
  it("passes the production BIP-86 path gate (assertBip86Path)", () => {
    // Rot-catcher for the `HARDENED | 86` class of bug: bitwise OR yields
    // negative int32 levels, which the production gate rejects and which made
    // e2e stages 5/6/10 unrunnable from #2281 until the 2026-08-25 fix.
    expect(() => assertBip86Path("DEPOSITOR_PATH", DEPOSITOR_PATH)).not.toThrow();
  });
});
