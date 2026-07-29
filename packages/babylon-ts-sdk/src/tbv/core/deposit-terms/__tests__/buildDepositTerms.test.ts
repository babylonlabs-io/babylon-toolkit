import { describe, expect, it } from "vitest";
import { buildDepositTerms } from "../buildDepositTerms";
import { supportsDepositApproval } from "../depositTerms";
import type { BitcoinWallet } from "../../../../shared/wallets/interfaces";

// Distinct 64-char x-only keys, in the shape validateOnChainParticipantKeys
// already produces (canonical, sorted) — the builder must not re-sort them.
const KEY_A = "a".repeat(64);
const KEY_B = "b".repeat(64);
const KEY_C = "c".repeat(64);
const KEY_D = "d".repeat(64);
const VP = "f".repeat(64);
const TXID = "1".repeat(64);

const BASE = {
  protocolFeeRate: 2n,
  timelockPegin: 144,
  timelockRefund: 4320,
  prepeginTxid: TXID,
  prepeginMaxFee: 1500n,
  vaultProviderPk: VP,
  keeperPks: [KEY_B, KEY_A],
  challengerPks: [KEY_D, KEY_C],
  commissionBps: 250,
  vaultAmounts: [500_000n, 300_000n],
  depositorClaimValue: 20_000n,
  peginMaxFee: 800n,
};

describe("buildDepositTerms", () => {
  it("projects every field and passes key lists through unchanged", () => {
    const terms = buildDepositTerms(BASE);
    expect(terms.baseFeeRate).toBe(2n);
    expect(terms.peginCsvTimelock).toBe(144);
    expect(terms.payoutTimelock).toBe(144); // same source as peginCsvTimelock by construction
    expect(terms.htlcRefundTimelock).toBe(4320);
    expect(terms.prepeginTxid).toBe(TXID);
    expect(terms.prepeginMaxFee).toBe(1500n);
    expect(terms.keeperPks).toEqual([KEY_B, KEY_A]);
    expect(terms.challengerPks).toEqual([KEY_D, KEY_C]);
    expect(terms.vaults).toEqual([
      { htlcVout: 0, vaultProviderPk: VP, vaultAmount: 500_000n, commissionFee: 12_500n, depositorClaimValue: 20_000n, peginMaxFee: 800n },
      { htlcVout: 1, vaultProviderPk: VP, vaultAmount: 300_000n, commissionFee: 7_500n, depositorClaimValue: 20_000n, peginMaxFee: 800n },
    ]);
  });

  it("floors the commission on odd amounts", () => {
    // 999_999 * 250 / 10_000 = 24_999.975 -> 24_999
    const terms = buildDepositTerms({ ...BASE, vaultAmounts: [999_999n] });
    expect(terms.vaults[0].commissionFee).toBe(24_999n);
  });

  it("throws on malformed txid and empty vault amounts", () => {
    expect(() => buildDepositTerms({ ...BASE, prepeginTxid: "12" })).toThrow(/txid/i);
    // Right length, wrong charset — pins the hex check, not just the length.
    expect(() =>
      buildDepositTerms({ ...BASE, prepeginTxid: "z".repeat(64) }),
    ).toThrow(/txid/i);
    // 0x-prefixed input is rejected, not stripped.
    expect(() =>
      buildDepositTerms({ ...BASE, prepeginTxid: "0x" + "a".repeat(62) }),
    ).toThrow(/txid/i);
    expect(() => buildDepositTerms({ ...BASE, vaultAmounts: [] })).toThrow(/vault/i);
  });

  it("throws on non-positive timelocks", () => {
    expect(() => buildDepositTerms({ ...BASE, timelockPegin: 0 })).toThrow(/timelock/i);
    expect(() => buildDepositTerms({ ...BASE, timelockRefund: -1 })).toThrow(/timelock/i);
  });

  it("throws on a fractional commissionBps", () => {
    expect(() => buildDepositTerms({ ...BASE, commissionBps: 250.5 })).toThrow(/integer/i);
  });

  it("throws on a negative commissionBps", () => {
    expect(() => buildDepositTerms({ ...BASE, commissionBps: -1 })).toThrow(/integer/i);
  });

  it("throws when commissionBps reaches the exclusive upper bound", () => {
    // Closes the drift vs payout.ts, which already rejects >= MAX_VP_COMMISSION_BPS_EXCLUSIVE.
    expect(() => buildDepositTerms({ ...BASE, commissionBps: 10_000 })).toThrow(/integer/i);
  });

});

describe("supportsDepositApproval", () => {
  it("detects the capability by function presence", () => {
    const base = { getAddress: async () => "x" } as unknown as BitcoinWallet;
    expect(supportsDepositApproval(base)).toBe(false);
    const capable = { ...base, approveDepositTerms: async () => {} } as unknown as BitcoinWallet;
    expect(supportsDepositApproval(capable)).toBe(true);
  });
});
