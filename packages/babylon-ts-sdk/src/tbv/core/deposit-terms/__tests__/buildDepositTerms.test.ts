import { describe, expect, it } from "vitest";
import type { BitcoinWallet } from "../../../../shared/wallets/interfaces";
import { buildDepositTerms } from "../buildDepositTerms";
import { supportsDepositApproval } from "../depositTerms";

// Distinct 64-char x-only keys, in the shape validateOnChainParticipantKeys
// already produces (canonical, sorted) — the builder must not re-sort them.
const KEY_A = "a".repeat(64);
const KEY_B = "b".repeat(64);
const KEY_C = "c".repeat(64);
const KEY_D = "d".repeat(64);
const VP = "f".repeat(64);
const TXID = "1".repeat(64);

const BASE = {
  vaultCoreVersion: 2,
  protocolFeeRate: 2n,
  timelockPegin: 144,
  timelockAssert: 210,
  timelockRefund: 4320,
  prepeginTxid: TXID,
  prepeginMaxFee: 1500n,
  vaultProviderBtcPubkey: VP,
  vaultKeeperBtcPubkeys: [KEY_B, KEY_A],
  universalChallengerBtcPubkeys: [KEY_D, KEY_C],
  maxAcceptableCommissionBps: 250,
  peginAmounts: [500_000n, 300_000n],
  depositorClaimValue: 20_000n,
  peginMaxFee: 800n,
};

describe("buildDepositTerms", () => {
  it("projects every field and passes key lists through unchanged", () => {
    const terms = buildDepositTerms(BASE);
    expect(terms.vaultCoreVersion).toBe(2);
    expect(terms.protocolFeeRate).toBe(2n);
    expect(terms.timelockPegin).toBe(144);
    // Distinct fixture values: a derivation from timelockPegin would fail here.
    expect(terms.timelockAssert).toBe(210);
    expect(terms.timelockRefund).toBe(4320);
    expect(terms.prepeginTxid).toBe(TXID);
    expect(terms.prepeginMaxFee).toBe(1500n);
    expect(terms.vaultKeeperBtcPubkeys).toEqual([KEY_B, KEY_A]);
    expect(terms.universalChallengerBtcPubkeys).toEqual([KEY_D, KEY_C]);
    expect(terms.vaults).toEqual([
      {
        htlcVout: 0,
        vaultProviderBtcPubkey: VP,
        peginAmount: 500_000n,
        commissionFee: 12_500n,
        depositorClaimValue: 20_000n,
        peginMaxFee: 800n,
      },
      {
        htlcVout: 1,
        vaultProviderBtcPubkey: VP,
        peginAmount: 300_000n,
        commissionFee: 7_500n,
        depositorClaimValue: 20_000n,
        peginMaxFee: 800n,
      },
    ]);
  });

  it("carries the graph version so an approving wallet knows the PegIn shape", () => {
    // v1 = 2 outputs, no anchor; v2 = TRUC nVersion 3 with a 240-sat P2A
    // anchor. A provider that supports only one shape must be able to tell.
    expect(
      buildDepositTerms({ ...BASE, vaultCoreVersion: 1 }).vaultCoreVersion,
    ).toBe(1);
    expect(
      buildDepositTerms({ ...BASE, vaultCoreVersion: 2 }).vaultCoreVersion,
    ).toBe(2);
  });

  it("floors the commission on odd amounts", () => {
    // 999_999 * 250 / 10_000 = 24_999.975 -> 24_999
    const terms = buildDepositTerms({ ...BASE, peginAmounts: [999_999n] });
    expect(terms.vaults[0].commissionFee).toBe(24_999n);
  });

  it("throws on malformed txid and empty vault amounts", () => {
    expect(() => buildDepositTerms({ ...BASE, prepeginTxid: "12" })).toThrow(
      /txid/i,
    );
    // Right length, wrong charset — pins the hex check, not just the length.
    expect(() =>
      buildDepositTerms({ ...BASE, prepeginTxid: "z".repeat(64) }),
    ).toThrow(/txid/i);
    // 0x-prefixed input is rejected, not stripped.
    expect(() =>
      buildDepositTerms({ ...BASE, prepeginTxid: "0x" + "a".repeat(62) }),
    ).toThrow(/txid/i);
    expect(() => buildDepositTerms({ ...BASE, peginAmounts: [] })).toThrow(
      /pegin amount/i,
    );
  });

  it("throws on non-positive timelocks", () => {
    expect(() => buildDepositTerms({ ...BASE, timelockPegin: 0 })).toThrow(
      /timelock/i,
    );
    expect(() => buildDepositTerms({ ...BASE, timelockRefund: -1 })).toThrow(
      /timelock/i,
    );
  });

  it("throws on a fractional maxAcceptableCommissionBps", () => {
    expect(() =>
      buildDepositTerms({ ...BASE, maxAcceptableCommissionBps: 250.5 }),
    ).toThrow(/integer/i);
  });

  it("computes commissionFee from the ceiling bps, flooring", () => {
    // The input IS the ceiling (quote + headroom applied by the caller);
    // the builder just floors peginAmount * bps / 10_000.
    const terms = buildDepositTerms({
      ...BASE,
      maxAcceptableCommissionBps: 275,
      peginAmounts: [999_999n],
    });
    // floor(999_999 * 275 / 10_000) = floor(27_499.9725)
    expect(terms.vaults[0].commissionFee).toBe(27_499n);
  });

  it("throws on a negative maxAcceptableCommissionBps", () => {
    expect(() =>
      buildDepositTerms({ ...BASE, maxAcceptableCommissionBps: -1 }),
    ).toThrow(/integer/i);
  });

  it("copies the key lists — mutating the inputs afterwards must not mutate built terms", () => {
    const vaultKeeperBtcPubkeys = [KEY_A, KEY_B];
    const universalChallengerBtcPubkeys = [KEY_C, KEY_D];
    const terms = buildDepositTerms({
      ...BASE,
      vaultKeeperBtcPubkeys,
      universalChallengerBtcPubkeys,
    });
    vaultKeeperBtcPubkeys.push(VP);
    universalChallengerBtcPubkeys[0] = VP;
    expect(terms.vaultKeeperBtcPubkeys).toEqual([KEY_A, KEY_B]);
    expect(terms.universalChallengerBtcPubkeys).toEqual([KEY_C, KEY_D]);
  });

  it("throws when maxAcceptableCommissionBps reaches the exclusive upper bound", () => {
    // Closes the drift vs payout.ts, which already rejects >= MAX_VP_COMMISSION_BPS_EXCLUSIVE.
    expect(() =>
      buildDepositTerms({ ...BASE, maxAcceptableCommissionBps: 10_000 }),
    ).toThrow(/integer/i);
  });
});

describe("supportsDepositApproval", () => {
  it("detects the capability by function presence", () => {
    const base = { getAddress: async () => "x" } as unknown as BitcoinWallet;
    expect(supportsDepositApproval(base)).toBe(false);
    const capable = {
      ...base,
      approveDepositTerms: async () => {},
      getChangeAddress: async () => "tb1pchange",
    } as unknown as BitcoinWallet;
    expect(supportsDepositApproval(capable)).toBe(true);
  });
});
