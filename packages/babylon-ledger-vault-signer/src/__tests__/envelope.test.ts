/**
 * Boundary tests for the Ledger device envelope. Every bound is exercised at
 * accept/reject on both sides, because an off-by-one here means the depositor
 * discovers the limit mid-ceremony with an opaque status word.
 */

import { describe, expect, it } from "vitest";

import {
  DEVICE_MAX_PARTICIPANTS_PER_ROLE,
  DEVICE_PAYOUT_TIMELOCK_MAX_BLOCKS,
  DEVICE_PAYOUT_TIMELOCK_MIN_BLOCKS,
  DEVICE_PEGIN_CSV_TIMELOCK_MAX_BLOCKS,
} from "../deviceCaps";
import { assertDepositTermsDeviceCompatible } from "../envelope";
import { DEPOSIT_TERMS_REJECTED_ERROR_NAME, DepositTermsRejectedError, type DepositTerms } from "../types";

// Distinct per role: the firmware enforces global key uniqueness across both
// rosters and rejects any key equal to the vault provider's.
const KEEPER_KEY = "a".repeat(64);
const CHALLENGER_KEY = "b".repeat(64);
const VP = "f".repeat(64);
// Distinct byte per key AND a per-role offset, so keeper and challenger sets
// never collide — the device enforces global uniqueness.
const keys = (n: number, offset = 0) =>
  Array.from({ length: n }, (_, i) => (i + offset).toString(16).padStart(2, "0").repeat(32));

const BASE_VAULT = {
  htlcVout: 0,
  vaultProviderBtcPubkey: VP,
  peginAmount: 1_000_000n,
  commissionFee: 10_000n,
  depositorClaimValue: 20_000n,
  peginMaxFee: 800n,
};

function makeTerms(over: Partial<DepositTerms> = {}): DepositTerms {
  return {
    vaultCoreVersion: 2,
    protocolFeeRate: 2n,
    timelockPegin: 684,
    timelockAssert: 684,
    timelockRefund: 2016,
    prepeginTxid: "1".repeat(64),
    prepeginMaxFee: 1500n,
    vaultKeeperBtcPubkeys: [KEEPER_KEY],
    universalChallengerBtcPubkeys: [CHALLENGER_KEY],
    vaults: [{ ...BASE_VAULT }],
    ...over,
  };
}

describe("assertDepositTermsDeviceCompatible", () => {
  it("accepts the live Sepolia shape", () => {
    expect(() => assertDepositTermsDeviceCompatible(makeTerms())).not.toThrow();
  });

  it("throws the shape the SDK matches on — name AND reason", () => {
    try {
      assertDepositTermsDeviceCompatible(makeTerms({ protocolFeeRate: 0n }));
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(DepositTermsRejectedError);
      expect((error as Error).name).toBe(DEPOSIT_TERMS_REJECTED_ERROR_NAME);
      expect((error as DepositTermsRejectedError).reason).toBe("device-envelope");
    }
  });

  it("does not gate on the tx-graph version — that axis belongs to the WASM capability gate", () => {
    // 2026-08-23 decision: unconstructable versions never get here, and a
    // device-incompatible shape fails closed on-device.
    for (const vaultCoreVersion of [1, 2, 3, 4]) {
      expect(() => assertDepositTermsDeviceCompatible(makeTerms({ vaultCoreVersion }))).not.toThrow();
    }
  });

  it("accepts multiple vault groups — v0.9.3 auto-detects the group by htlc_vout", () => {
    const vault = makeTerms().vaults[0];
    expect(() =>
      assertDepositTermsDeviceCompatible(makeTerms({ vaults: [vault, { ...vault, htlcVout: 1 }] })),
    ).not.toThrow();
  });

  it("rejects one vault group past the firmware maximum", () => {
    const vault = makeTerms().vaults[0];
    const eleven = Array.from({ length: 11 }, (_, i) => ({ ...vault, htlcVout: i }));
    expect(() => assertDepositTermsDeviceCompatible(makeTerms({ vaults: eleven }))).toThrow(
      /vault count 11 not in \[1, 10\]/,
    );
  });

  it("accepts the coupled timelock band at both inclusive bounds", () => {
    // Both timelocks carry the SAME on-chain value, so the band is the
    // intersection [91, 1008] — not the payout range [91, 4031], which the
    // dedicated payout test below covers at its own upper bound.
    for (const t of [DEVICE_PAYOUT_TIMELOCK_MIN_BLOCKS, DEVICE_PEGIN_CSV_TIMELOCK_MAX_BLOCKS]) {
      expect(() =>
        assertDepositTermsDeviceCompatible(makeTerms({ timelockPegin: t, timelockAssert: t })),
      ).not.toThrow();
    }
  });

  it("rejects one block outside each end of the coupled timelock band", () => {
    // btc-vault sets timelockPegin := timelockAssert, so the single on-chain
    // value must satisfy BOTH device ranges — the band is [91, 1008].
    for (const t of [DEVICE_PAYOUT_TIMELOCK_MIN_BLOCKS - 1, DEVICE_PEGIN_CSV_TIMELOCK_MAX_BLOCKS + 1]) {
      expect(() => assertDepositTermsDeviceCompatible(makeTerms({ timelockPegin: t, timelockAssert: t }))).toThrow(
        /timelock/,
      );
    }
  });

  it("accepts a payout timelock above the PegIn cap only when uncoupled", () => {
    // Guards the constant, not a reachable state: production couples them, so
    // 4031 alone can never occur. Pinned so a future decoupling is deliberate.
    expect(() =>
      assertDepositTermsDeviceCompatible(
        makeTerms({
          timelockPegin: 1008,
          timelockAssert: DEVICE_PAYOUT_TIMELOCK_MAX_BLOCKS,
        }),
      ),
    ).not.toThrow();
  });

  it("accepts rosters at the cap and rejects one past it", () => {
    const n = DEVICE_MAX_PARTICIPANTS_PER_ROLE;
    expect(() =>
      assertDepositTermsDeviceCompatible(
        makeTerms({
          vaultKeeperBtcPubkeys: keys(n),
          universalChallengerBtcPubkeys: keys(n, n),
        }),
      ),
    ).not.toThrow();
    expect(() => assertDepositTermsDeviceCompatible(makeTerms({ vaultKeeperBtcPubkeys: keys(n + 1) }))).toThrow(
      /keeper count 33 not in \[1, 32\]/,
    );
  });

  it("rejects an empty roster on either axis", () => {
    expect(() => assertDepositTermsDeviceCompatible(makeTerms({ vaultKeeperBtcPubkeys: [] }))).toThrow(
      /keeper count 0/,
    );
    expect(() => assertDepositTermsDeviceCompatible(makeTerms({ universalChallengerBtcPubkeys: [] }))).toThrow(
      /challenger count 0/,
    );
  });

  it("rejects vault groups that are not in strictly ascending htlcVout order", () => {
    // The device advances a per-group cursor and kills the session mid-ceremony
    // on a non-ascending vout.
    const vault = makeTerms().vaults[0];
    expect(() =>
      assertDepositTermsDeviceCompatible(
        makeTerms({
          vaults: [
            { ...vault, htlcVout: 1 },
            { ...vault, htlcVout: 0 },
          ],
        }),
      ),
    ).toThrow(/strictly ascending htlcVout/);
  });

  it("rejects an htlcVout that cannot fit the u8 wire field", () => {
    const vault = makeTerms().vaults[0];
    expect(() => assertDepositTermsDeviceCompatible(makeTerms({ vaults: [{ ...vault, htlcVout: 256 }] }))).toThrow(
      /htlcVout 256 not in \[0, 255\]/,
    );
  });

  it("rejects a key repeated across roles — uniqueness is global, not per role", () => {
    // approve_vault_intent_core.h: VAULT_KEY_ERR_DUPLICATE is "global uniqueness
    // across all previously stored keys". Ordering is per-role; uniqueness is not.
    expect(() =>
      assertDepositTermsDeviceCompatible(
        makeTerms({
          vaultKeeperBtcPubkeys: [KEEPER_KEY],
          universalChallengerBtcPubkeys: [KEEPER_KEY],
        }),
      ),
    ).toThrow(/duplicate participant key/);
  });

  it("rejects a participant key equal to the vault provider's", () => {
    // VAULT_KEY_ERR_ROLE_COLLISION.
    expect(() => assertDepositTermsDeviceCompatible(makeTerms({ vaultKeeperBtcPubkeys: [VP] }))).toThrow(
      /vault provider's own key/,
    );
  });

  it("rejects a zero fee rate and a zero prepegin max fee", () => {
    expect(() => assertDepositTermsDeviceCompatible(makeTerms({ protocolFeeRate: 0n }))).toThrow(/protocolFeeRate/);
    expect(() => assertDepositTermsDeviceCompatible(makeTerms({ prepeginMaxFee: 0n }))).toThrow(/prepeginMaxFee/);
  });

  it.each([
    ["prepeginMaxFee", { prepeginMaxFee: 1n << 64n }],
    ["peginAmount", { vaults: [{ ...BASE_VAULT, peginAmount: 1n << 64n }] }],
    ["commissionFee", { vaults: [{ ...BASE_VAULT, commissionFee: 1n << 64n }] }],
    ["depositorClaimValue", { vaults: [{ ...BASE_VAULT, depositorClaimValue: 1n << 64n }] }],
    ["peginMaxFee", { vaults: [{ ...BASE_VAULT, peginMaxFee: 1n << 64n }] }],
  ])("rejects an oversized %s with the seam's shape, not a raw encoder Error", (_field, overrides) => {
    // The wire is u64; without this gate the value reaches the TLV encoder
    // mid-ceremony and throws a plain Error the SDK cannot map.
    expect(() => assertDepositTermsDeviceCompatible(makeTerms(overrides as Parameters<typeof makeTerms>[0]))).toThrow(
      /does not fit in an unsigned 64-bit field/,
    );
  });

  it("rejects a negative prepeginMaxFee as a u64 violation, not a floor violation", () => {
    expect(() => assertDepositTermsDeviceCompatible(makeTerms({ prepeginMaxFee: -1n }))).toThrow(
      /does not fit in an unsigned 64-bit field/,
    );
  });

  it("rejects a negative peginMaxFee with the seam's shape", () => {
    expect(() =>
      assertDepositTermsDeviceCompatible(makeTerms({ vaults: [{ ...BASE_VAULT, peginMaxFee: -1n }] })),
    ).toThrow(/does not fit in an unsigned 64-bit field/);
  });

  it("accepts peginMaxFee 0 — the firmware accepts any u64 for the group fee", () => {
    expect(() =>
      assertDepositTermsDeviceCompatible(makeTerms({ vaults: [{ ...BASE_VAULT, peginMaxFee: 0n }] })),
    ).not.toThrow();
  });

  it("accepts timelockRefund at both device bounds and rejects one block past each", () => {
    expect(() => assertDepositTermsDeviceCompatible(makeTerms({ timelockRefund: 72 }))).not.toThrow();
    expect(() => assertDepositTermsDeviceCompatible(makeTerms({ timelockRefund: 4320 }))).not.toThrow();
    expect(() => assertDepositTermsDeviceCompatible(makeTerms({ timelockRefund: 71 }))).toThrow(/timelockRefund/);
    expect(() => assertDepositTermsDeviceCompatible(makeTerms({ timelockRefund: 4321 }))).toThrow(/timelockRefund/);
  });

  it("rejects a protocolFeeRate above the device u32 ceiling", () => {
    expect(() => assertDepositTermsDeviceCompatible(makeTerms({ protocolFeeRate: 0x1_0000_0000n }))).toThrow(
      /protocolFeeRate/,
    );
  });

  it("rejects a commission or claim value below the device dust floor", () => {
    const vault = makeTerms().vaults[0];
    expect(() =>
      assertDepositTermsDeviceCompatible(makeTerms({ vaults: [{ ...vault, commissionFee: 545n }] })),
    ).toThrow(/commissionFee 545 below/);
    expect(() =>
      assertDepositTermsDeviceCompatible(makeTerms({ vaults: [{ ...vault, depositorClaimValue: 545n }] })),
    ).toThrow(/depositorClaimValue 545 below/);
  });

  it("enforces the cross-field peginAmount floor at its exact boundary", () => {
    const vault = makeTerms().vaults[0];
    const commission = 10_000n;
    const floor = commission + 1_092n; // commissionFee + 2 * 546
    expect(() =>
      assertDepositTermsDeviceCompatible(
        makeTerms({
          vaults: [{ ...vault, commissionFee: commission, peginAmount: floor }],
        }),
      ),
    ).toThrow(/must exceed commissionFee/);
    expect(() =>
      assertDepositTermsDeviceCompatible(
        makeTerms({
          vaults: [{ ...vault, commissionFee: commission, peginAmount: floor + 1n }],
        }),
      ),
    ).not.toThrow();
  });
});
