import { describe, expect, it } from "vitest";

import { seededBtcWallet, seededEthWallet } from "../seededWallets";

describe("seededBtcWallet", () => {
  it("exposes mempool-wire payloads that sum to the seeded amount", () => {
    const wallet = seededBtcWallet({ amount: 250_000n });
    expect(wallet.balanceSats).toBe(250_000n);
    const totalValue = wallet.mempoolUtxos.reduce((s, u) => s + u.value, 0);
    expect(BigInt(totalValue)).toBe(250_000n);
    expect(wallet.mempoolAddressInfo.isvalid).toBe(true);
    // Default address is signet P2WPKH (`tb1q...`), so the scriptPubKey
    // is 0014 (OP_0 push-20) + 20-byte hash placeholder (40 hex).
    expect(wallet.mempoolAddressInfo.scriptPubKey).toMatch(
      /^0014[0-9a-f]{40}$/,
    );
  });

  it("rejects utxoSplit values that don't sum to amount", () => {
    expect(() =>
      seededBtcWallet({ amount: 100n, utxoSplit: [40n, 50n] }),
    ).toThrow(/sum to 90n, expected 100n/);
  });
});

describe("seededEthWallet", () => {
  it("exposes balanceWeiHex as a valid quantity", () => {
    const wallet = seededEthWallet({ balanceWei: 5n * 10n ** 18n });
    expect(wallet.balanceWeiHex).toBe(`0x${(5n * 10n ** 18n).toString(16)}`);
  });
});
