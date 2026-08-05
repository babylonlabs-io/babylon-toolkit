/**
 * Unit tests for the payout implicit-fee band (floor + ceiling) and its
 * input-domain guard, exercised directly with plain numbers — the e2e wiring
 * through buildPayoutPsbt is covered in payout.test.ts.
 */

import { computePayoutFeeFloor } from "@babylonlabs-io/babylon-tbv-rust-wasm";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type PayoutFeeBandParams,
  assertPayoutFeeBandDomain,
  assertPayoutFeeInBand,
} from "../assertPayoutFeeBand";
import { initializeWasmForTests } from "./helpers";

/** Canonical N=M=1 shape at 10 sat/vB; device ceiling = 10 * 610 = 6_100. */
const BASE_PARAMS: PayoutFeeBandParams = {
  vaultCoreVersion: 1,
  numVaultKeepers: 1,
  numUniversalChallengers: 1,
  councilSize: 3,
  protocolFeeRate: 10n,
};

/** P2WPKH script length used by the floor fixtures. */
const P2WPKH_LEN = 22;

describe("assertPayoutFeeBandDomain", () => {
  it("rejects a rate of zero, above u32 max, or not a bigint", () => {
    expect(() =>
      assertPayoutFeeBandDomain({ ...BASE_PARAMS, protocolFeeRate: 0n }),
    ).toThrow(/protocolFeeRate must be in/);
    expect(() =>
      assertPayoutFeeBandDomain({
        ...BASE_PARAMS,
        protocolFeeRate: 0x1_0000_0000n,
      }),
    ).toThrow(/protocolFeeRate must be in/);
    expect(() =>
      assertPayoutFeeBandDomain({
        ...BASE_PARAMS,
        protocolFeeRate: 10 as unknown as bigint,
      }),
    ).toThrow(/protocolFeeRate must be in/);
  });

  it("accepts the device-range rate boundaries 1 and u32 max", () => {
    expect(() =>
      assertPayoutFeeBandDomain({ ...BASE_PARAMS, protocolFeeRate: 1n }),
    ).not.toThrow();
    expect(() =>
      assertPayoutFeeBandDomain({
        ...BASE_PARAMS,
        protocolFeeRate: 0xffffffffn,
      }),
    ).not.toThrow();
  });

  it("rejects participant counts of 0 and 33 for either role", () => {
    expect(() =>
      assertPayoutFeeBandDomain({ ...BASE_PARAMS, numVaultKeepers: 0 }),
    ).toThrow(/device range/);
    expect(() =>
      assertPayoutFeeBandDomain({ ...BASE_PARAMS, numVaultKeepers: 33 }),
    ).toThrow(/device range/);
    expect(() =>
      assertPayoutFeeBandDomain({
        ...BASE_PARAMS,
        numUniversalChallengers: 0,
      }),
    ).toThrow(/device range/);
    expect(() =>
      assertPayoutFeeBandDomain({
        ...BASE_PARAMS,
        numUniversalChallengers: 33,
      }),
    ).toThrow(/device range/);
  });

  it("rejects non-integer participant counts", () => {
    expect(() =>
      assertPayoutFeeBandDomain({ ...BASE_PARAMS, numVaultKeepers: 1.5 }),
    ).toThrow(/device range/);
    expect(() =>
      assertPayoutFeeBandDomain({
        ...BASE_PARAMS,
        numUniversalChallengers: NaN,
      }),
    ).toThrow(/device range/);
  });

  it("accepts the device-range count boundaries 1 and 32", () => {
    expect(() =>
      assertPayoutFeeBandDomain({
        ...BASE_PARAMS,
        numVaultKeepers: 32,
        numUniversalChallengers: 32,
      }),
    ).not.toThrow();
    expect(() => assertPayoutFeeBandDomain(BASE_PARAMS)).not.toThrow();
  });

  it("rejects a councilSize of 0 or a non-integer", () => {
    expect(() =>
      assertPayoutFeeBandDomain({ ...BASE_PARAMS, councilSize: 0 }),
    ).toThrow(/councilSize must be an integer/);
    expect(() =>
      assertPayoutFeeBandDomain({ ...BASE_PARAMS, councilSize: 2.5 }),
    ).toThrow(/councilSize must be an integer/);
    expect(() =>
      assertPayoutFeeBandDomain({ ...BASE_PARAMS, councilSize: NaN }),
    ).toThrow(/councilSize must be an integer/);
  });

  it("accepts any positive integer councilSize", () => {
    expect(() =>
      assertPayoutFeeBandDomain({ ...BASE_PARAMS, councilSize: 1 }),
    ).not.toThrow();
    expect(() =>
      assertPayoutFeeBandDomain({ ...BASE_PARAMS, councilSize: 100 }),
    ).not.toThrow();
  });
});

describe("assertPayoutFeeInBand", () => {
  beforeAll(async () => {
    await initializeWasmForTests();
  });

  it("accepts a fee exactly at the floor and rejects one sat below", async () => {
    const floor = await computePayoutFeeFloor(
      1,
      1,
      1,
      1,
      BASE_PARAMS.councilSize,
      P2WPKH_LEN,
      P2WPKH_LEN,
      BASE_PARAMS.protocolFeeRate,
    );
    const measured = { out0Len: P2WPKH_LEN, out1Len: P2WPKH_LEN };

    await expect(
      assertPayoutFeeInBand(BASE_PARAMS, {
        ...measured,
        implicitFeeSats: Number(floor),
      }),
    ).resolves.toBeUndefined();
    await expect(
      assertPayoutFeeInBand(BASE_PARAMS, {
        ...measured,
        implicitFeeSats: Number(floor) - 1,
      }),
    ).rejects.toThrow(/below the floor/);
  });

  it("accepts a fee exactly at the device ceiling and rejects one sat above", async () => {
    const measured = { out0Len: P2WPKH_LEN, out1Len: P2WPKH_LEN };

    await expect(
      assertPayoutFeeInBand(BASE_PARAMS, {
        ...measured,
        implicitFeeSats: 6_100,
      }),
    ).resolves.toBeUndefined();
    await expect(
      assertPayoutFeeInBand(BASE_PARAMS, {
        ...measured,
        implicitFeeSats: 6_101,
      }),
    ).rejects.toThrow(/exceeds the safety cap/);
  });

  it("extends the ceiling by pinned out0 script excess over the 34-byte assumption", async () => {
    // 128-byte out0: ceiling = 10 * (610 + (128 - 34)) = 7_040.
    const measured = { out0Len: 128, out1Len: P2WPKH_LEN };

    await expect(
      assertPayoutFeeInBand(BASE_PARAMS, {
        ...measured,
        implicitFeeSats: 7_040,
      }),
    ).resolves.toBeUndefined();
    await expect(
      assertPayoutFeeInBand(BASE_PARAMS, {
        ...measured,
        implicitFeeSats: 7_041,
      }),
    ).rejects.toThrow(/exceeds the safety cap/);
  });

  it("does not widen the ceiling for the commission script length", async () => {
    // out1 is VP-controlled; a 128-byte pad must buy zero extra headroom —
    // the ceiling stays at the flat 10 * 610 = 6_100.
    const measured = { out0Len: P2WPKH_LEN, out1Len: 128 };

    await expect(
      assertPayoutFeeInBand(BASE_PARAMS, {
        ...measured,
        implicitFeeSats: 6_100,
      }),
    ).resolves.toBeUndefined();
    await expect(
      assertPayoutFeeInBand(BASE_PARAMS, {
        ...measured,
        implicitFeeSats: 6_101,
      }),
    ).rejects.toThrow(/exceeds the safety cap/);
  });

  // 324 WASM floor calls (~4s alone; longer under a parallel full-repo run).
  it(
    "keeps the band non-empty (floor <= ceiling) across the domain corners",
    { timeout: 30_000 },
    async () => {
      // The floor moves with VAULT_WASM_COMMIT (pinned Rust model set) while
      // the ceiling constants are local — a pin bump that lifts the floor
      // above the ceiling would brick every payout of that shape with CI
      // green. Both ends scale linearly with rate, so rate 1 covers all rates.
      const params = { ...BASE_PARAMS, protocolFeeRate: 1n };
      for (const vaultCoreVersion of [1, 2]) {
        for (const n of [1, 2, 32]) {
          for (const m of [1, 2, 32]) {
            for (const out0Len of [1, 34, 128]) {
              for (const out1Len of [34, 128, undefined]) {
                for (const councilSize of [1, 100]) {
                  const shape = {
                    ...params,
                    vaultCoreVersion,
                    numVaultKeepers: n,
                    numUniversalChallengers: m,
                    councilSize,
                  };
                  const floor = await computePayoutFeeFloor(
                    vaultCoreVersion,
                    n,
                    m,
                    n,
                    councilSize,
                    out0Len,
                    out1Len,
                    1n,
                  );
                  // A floor above the ceiling would throw here.
                  await expect(
                    assertPayoutFeeInBand(shape, {
                      implicitFeeSats: Number(floor),
                      out0Len,
                      out1Len,
                    }),
                  ).resolves.toBeUndefined();
                }
              }
            }
          }
        }
      }
    },
  );

  it("floors the no-commission (2-output) shape with out1Len undefined", async () => {
    const floor = await computePayoutFeeFloor(
      1,
      1,
      1,
      1,
      BASE_PARAMS.councilSize,
      P2WPKH_LEN,
      undefined,
      BASE_PARAMS.protocolFeeRate,
    );
    const measured = { out0Len: P2WPKH_LEN, out1Len: undefined };

    await expect(
      assertPayoutFeeInBand(BASE_PARAMS, {
        ...measured,
        implicitFeeSats: Number(floor),
      }),
    ).resolves.toBeUndefined();
    await expect(
      assertPayoutFeeInBand(BASE_PARAMS, {
        ...measured,
        implicitFeeSats: Number(floor) - 1,
      }),
    ).rejects.toThrow(/below the floor/);
  });

  it("passes the keeper count as the local-challenger count to the floor", async () => {
    // N=2, M=1: the floor call must be (N, M, local=N) — a swap shifts it.
    const params = { ...BASE_PARAMS, numVaultKeepers: 2 };
    const floor = await computePayoutFeeFloor(
      1,
      2,
      1,
      2,
      params.councilSize,
      P2WPKH_LEN,
      P2WPKH_LEN,
      params.protocolFeeRate,
    );
    const measured = { out0Len: P2WPKH_LEN, out1Len: P2WPKH_LEN };

    await expect(
      assertPayoutFeeInBand(params, {
        ...measured,
        implicitFeeSats: Number(floor),
      }),
    ).resolves.toBeUndefined();
    await expect(
      assertPayoutFeeInBand(params, {
        ...measured,
        implicitFeeSats: Number(floor) - 1,
      }),
    ).rejects.toThrow(/below the floor/);
  });
});
