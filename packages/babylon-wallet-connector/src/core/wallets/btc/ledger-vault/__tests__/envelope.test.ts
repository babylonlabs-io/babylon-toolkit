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
    vaults: [
      {
        htlcVout: 0,
        vaultProviderBtcPubkey: VP,
        peginAmount: 1_000_000n,
        commissionFee: 10_000n,
        depositorClaimValue: 20_000n,
        peginMaxFee: 800n,
      },
    ],
    ...over,
  };
}

describe("assertDepositTermsDeviceCompatible", () => {
  it("accepts the live Sepolia shape", () => {
    expect(() => assertDepositTermsDeviceCompatible(makeTerms())).not.toThrow();
  });

  it("throws the shape the SDK matches on — name AND reason", () => {
    try {
      assertDepositTermsDeviceCompatible(makeTerms({ vaultCoreVersion: 1 }));
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(DepositTermsRejectedError);
      expect((error as Error).name).toBe(DEPOSIT_TERMS_REJECTED_ERROR_NAME);
      expect((error as DepositTermsRejectedError).reason).toBe("device-envelope");
    }
  });

  it("refuses tx-graph v1 before any device I/O", () => {
    // The intent would LOAD on-device and only fail at PSBT time, i.e. after
    // the depositor has physically approved.
    expect(() => assertDepositTermsDeviceCompatible(makeTerms({ vaultCoreVersion: 1 }))).toThrow(
      /vaultCoreVersion 1 is below 2/,
    );
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

  it("accepts the payout timelock at both inclusive bounds", () => {
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
