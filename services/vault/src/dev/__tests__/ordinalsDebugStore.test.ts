import { describe, expect, it, vi } from "vitest";

// The package's real entrypoint pulls in the whole widget tree; every other
// vault test stubs it the same way. 10_000 mirrors the real threshold.
vi.mock("@babylonlabs-io/wallet-connector", () => ({
  LOW_VALUE_UTXO_THRESHOLD: 10_000,
}));

import {
  ORDINALS_DEBUG_UTXOS,
  resolveOrdinalsDebugOverride,
} from "../ordinalsDebugStore";

/**
 * The panel states an expected outcome per scenario. These pin the inputs those
 * outcomes are derived from, so the two can't drift apart silently.
 */
describe("resolveOrdinalsDebugOverride", () => {
  it("leaves the live wallet and classifier alone on auto", () => {
    expect(resolveOrdinalsDebugOverride("auto")).toBeNull();
  });

  it("reports both inscriptions as classified in the good scenario", () => {
    const override = resolveOrdinalsDebugOverride("good");

    expect(override?.isLoadingOrdinals).toBe(false);
    expect(override?.ordinalsError).toBeNull();
    expect(override?.inscriptions.map((i) => i.txid)).toEqual([
      "dbg-inscription-dust",
      "dbg-inscription-large",
    ]);
    expect(override?.spendFloorSats).toBe(10_000);
  });

  it("reports the check as still running in the checking scenario", () => {
    const override = resolveOrdinalsDebugOverride("checking");

    expect(override?.isLoadingOrdinals).toBe(true);
    expect(override?.inscriptions).toEqual([]);
    expect(override?.ordinalsError).toBeNull();
  });

  it("errors with the floor still in force in the bad scenario", () => {
    const override = resolveOrdinalsDebugOverride("bad");

    expect(override?.ordinalsError).toBeInstanceOf(Error);
    expect(override?.inscriptions).toEqual([]);
    expect(override?.spendFloorSats).toBe(10_000);
  });

  it("drops the floor to reproduce the pre-fix behaviour", () => {
    const override = resolveOrdinalsDebugOverride("before");

    expect(override?.ordinalsError).toBeInstanceOf(Error);
    expect(override?.spendFloorSats).toBe(0);
  });

  it("covers inscribed and plain outputs on both sides of the floor", () => {
    // The scenarios are only illustrative if the synthetic wallet spans all
    // four combinations — in particular the inscription ABOVE the floor, which
    // is the case only the classifier can catch.
    const combinations = ORDINALS_DEBUG_UTXOS.map(
      ({ utxo, hasInscription }) => [hasInscription, utxo.value > 10_000],
    );

    expect(combinations).toEqual([
      [true, false],
      [false, false],
      [true, true],
      [false, true],
    ]);
  });
});
