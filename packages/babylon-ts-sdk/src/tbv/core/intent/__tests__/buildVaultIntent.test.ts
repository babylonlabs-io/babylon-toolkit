import { describe, expect, it } from "vitest";
import { buildVaultIntent } from "../buildVaultIntent";
import { supportsVaultIntent } from "../vaultIntent";
import type { BitcoinWallet } from "../../../../shared/wallets/interfaces";

// Distinct 64-char x-only keys; deliberately UNSORTED where lists are built.
const KEY_A = "a".repeat(64);
const KEY_B = "b".repeat(64);
const KEY_C = "c".repeat(64);
const KEY_D = "d".repeat(64);
const DEPOSITOR = "e".repeat(64);
const VP = "f".repeat(64);
const TXID = "1".repeat(64);

const BASE = {
  network: "signet" as const,
  protocolFeeRate: 2n,
  timelockPegin: 144,
  timelockRefund: 4320,
  prepeginTxid: TXID,
  prepeginMaxFee: 1500n,
  depositorPk: DEPOSITOR,
  vaultProviderPk: VP,
  keeperPks: [KEY_B, KEY_A], // unsorted on purpose
  challengerPks: [KEY_D, KEY_C], // unsorted on purpose
  commissionBps: 250,
  vaultAmounts: [500_000n, 300_000n],
  depositorClaimValue: 20_000n,
  peginMaxFee: 800n,
};

describe("buildVaultIntent", () => {
  it("projects every field and sorts key lists ascending", () => {
    const intent = buildVaultIntent(BASE);
    expect(intent.version).toBe(1);
    expect(intent.coinType).toBe(1); // signet -> SLIP-44 testnet
    expect(intent.baseFeeRate).toBe(2n);
    expect(intent.peginCsvTimelock).toBe(144);
    expect(intent.payoutTimelock).toBe(144); // same source as P by construction
    expect(intent.htlcRefundTimelock).toBe(4320);
    expect(intent.prepeginTxid).toBe(TXID);
    expect(intent.prepeginMaxFee).toBe(1500n);
    expect(intent.keeperPks).toEqual([KEY_A, KEY_B]);
    expect(intent.challengerPks).toEqual([KEY_C, KEY_D]);
    expect(intent.vaults).toEqual([
      { htlcVout: 0, vaultProviderPk: VP, vaultAmount: 500_000n, commissionFee: 12_500n, depositorClaimValue: 20_000n, peginMaxFee: 800n },
      { htlcVout: 1, vaultProviderPk: VP, vaultAmount: 300_000n, commissionFee: 7_500n, depositorClaimValue: 20_000n, peginMaxFee: 800n },
    ]);
  });

  it("maps mainnet to coin type 0", () => {
    expect(buildVaultIntent({ ...BASE, network: "bitcoin" }).coinType).toBe(0);
  });

  it("floors the commission on odd amounts", () => {
    // 999_999 * 250 / 10_000 = 24_999.975 -> 24_999
    const intent = buildVaultIntent({ ...BASE, vaultAmounts: [999_999n] });
    expect(intent.vaults[0].commissionFee).toBe(24_999n);
  });

  it("normalizes 0x-prefixed uppercase keys", () => {
    const intent = buildVaultIntent({ ...BASE, keeperPks: [`0x${KEY_A.toUpperCase()}`, KEY_B] });
    expect(intent.keeperPks).toEqual([KEY_A, KEY_B]);
  });

  it("throws on duplicate keys within a list", () => {
    expect(() => buildVaultIntent({ ...BASE, keeperPks: [KEY_A, KEY_A] })).toThrow(/duplicate/i);
  });

  it("throws when roles overlap", () => {
    expect(() => buildVaultIntent({ ...BASE, keeperPks: [KEY_A, VP] })).toThrow(/vault provider/i);
    expect(() => buildVaultIntent({ ...BASE, challengerPks: [KEY_A, KEY_C] })).toThrow(/both/i);
    expect(() => buildVaultIntent({ ...BASE, keeperPks: [KEY_A, DEPOSITOR] })).toThrow(/depositor/i);
  });

  it("throws on malformed txid and empty inputs", () => {
    expect(() => buildVaultIntent({ ...BASE, prepeginTxid: "12" })).toThrow(/txid/i);
    expect(() => buildVaultIntent({ ...BASE, vaultAmounts: [] })).toThrow(/vault/i);
    expect(() => buildVaultIntent({ ...BASE, keeperPks: [] })).toThrow(/keeper/i);
  });

  it("throws on a fractional commissionBps", () => {
    expect(() => buildVaultIntent({ ...BASE, commissionBps: 250.5 })).toThrow(/integer/i);
  });

  it("throws on a negative commissionBps", () => {
    expect(() => buildVaultIntent({ ...BASE, commissionBps: -1 })).toThrow(/non-negative/i);
  });

  it("throws on a negative vaultAmount, naming the field", () => {
    expect(() => buildVaultIntent({ ...BASE, vaultAmounts: [-1n] })).toThrow(/vaultAmounts\[0\]/);
  });
});

describe("supportsVaultIntent", () => {
  it("detects the capability by function presence", () => {
    const base = { getAddress: async () => "x" } as unknown as BitcoinWallet;
    expect(supportsVaultIntent(base)).toBe(false);
    const capable = { ...base, approveVaultIntent: async () => {} } as unknown as BitcoinWallet;
    expect(supportsVaultIntent(capable)).toBe(true);
  });
});
