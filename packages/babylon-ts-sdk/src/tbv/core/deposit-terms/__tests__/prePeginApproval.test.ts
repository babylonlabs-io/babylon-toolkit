/**
 * Tests for the Pre-PegIn approval ceremony helper. The device layer is
 * abstracted behind the structural PrePeginApprovalWallet, so these pin the
 * orchestration: the capability gate, the txid match, and the strict
 * derive-then-approve order for approval wallets.
 */

import { Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { describe, expect, it, vi } from "vitest";

import {
  hexToUint8Array,
  uint8ArrayToHex,
} from "../../primitives/utils/bitcoin";
import { buildVaultContext, VAULT_APP_NAME } from "../../vault-secrets";
import type { DepositTerms } from "../depositTerms";
import {
  ensurePrePeginTermsApproval,
  type PrePeginApprovalWallet,
} from "../prePeginApproval";

/** A funded Pre-PegIn tx with two inputs, so the funding-outpoint derivation is exercised. */
function makeFundedTx(): { hex: string; txid: string; inputTxids: string[] } {
  const tx = new Transaction();
  tx.version = 2;
  // Non-palindromic on purpose: reverse(txid) !== txid, so a dropped .reverse()
  // anywhere on the derive path changes the funding outpoints — and the context
  // assertion below would then fail instead of passing on a byte-order bug.
  const inputTxids = ["0011".repeat(16), "2233".repeat(16)];
  for (const txid of inputTxids) {
    // input.hash is internal byte order — the reverse of the display txid.
    tx.addInput(Buffer.from(txid, "hex").reverse(), 0);
  }
  tx.addOutput(
    Buffer.from(
      "512000000000000000000000000000000000000000000000000000000000000000",
      "hex",
    ),
    1000,
  );
  return { hex: tx.toHex(), txid: tx.getId(), inputTxids };
}

const DEPOSITOR_PUBKEY = "ab".repeat(32);

function makeTerms(txid: string): DepositTerms {
  return {
    vaultCoreVersion: 2,
    protocolFeeRate: 2n,
    timelockPegin: 684,
    timelockAssert: 684,
    timelockRefund: 2016,
    prepeginTxid: txid,
    prepeginMaxFee: 1500n,
    vaultKeeperBtcPubkeys: ["cc".repeat(32)],
    universalChallengerBtcPubkeys: ["dd".repeat(32)],
    vaults: [
      {
        htlcVout: 0,
        vaultProviderBtcPubkey: "ff".repeat(32),
        peginAmount: 1_000_000n,
        commissionFee: 10_000n,
        depositorClaimValue: 20_000n,
        peginMaxFee: 800n,
      },
    ],
  };
}

describe("ensurePrePeginTermsApproval", () => {
  it("is a no-op for a wallet without approveDepositTerms", async () => {
    const { hex } = makeFundedTx();
    const wallet: PrePeginApprovalWallet = { deriveContextHash: vi.fn() };

    await expect(
      ensurePrePeginTermsApproval({
        wallet,
        depositTerms: undefined,
        fundedPrePeginTxHex: hex,
        depositorBtcPubkey: DEPOSITOR_PUBKEY,
      }),
    ).resolves.toBeUndefined();
    expect(wallet.deriveContextHash).not.toHaveBeenCalled();
  });

  it("validates supplied terms against the txid even for a non-approval wallet", async () => {
    const { hex } = makeFundedTx();
    const wallet: PrePeginApprovalWallet = {};

    await expect(
      ensurePrePeginTermsApproval({
        wallet,
        depositTerms: makeTerms("00".repeat(32)),
        fundedPrePeginTxHex: hex,
        depositorBtcPubkey: DEPOSITOR_PUBKEY,
      }),
    ).rejects.toThrow(/do not match the transaction/);
  });

  it("throws when an approval wallet is given no terms", async () => {
    const { hex } = makeFundedTx();
    const wallet: PrePeginApprovalWallet = {
      deriveContextHash: vi.fn(async () => "ab".repeat(32)),
      approveDepositTerms: vi.fn(),
    };

    await expect(
      ensurePrePeginTermsApproval({
        wallet,
        depositTerms: undefined,
        fundedPrePeginTxHex: hex,
        depositorBtcPubkey: DEPOSITOR_PUBKEY,
      }),
    ).rejects.toThrow(/requires approved deposit terms/);
    expect(wallet.approveDepositTerms).not.toHaveBeenCalled();
  });

  it("throws for an approval wallet that cannot derive", async () => {
    const { hex, txid } = makeFundedTx();
    const wallet: PrePeginApprovalWallet = { approveDepositTerms: vi.fn() };

    await expect(
      ensurePrePeginTermsApproval({
        wallet,
        depositTerms: makeTerms(txid),
        fundedPrePeginTxHex: hex,
        depositorBtcPubkey: DEPOSITOR_PUBKEY,
      }),
    ).rejects.toThrow(/must also implement deriveContextHash/);
  });

  it("rejects terms for a different transaction before any device call", async () => {
    const { hex } = makeFundedTx();
    const wallet: PrePeginApprovalWallet = {
      deriveContextHash: vi.fn(async () => "ab".repeat(32)),
      approveDepositTerms: vi.fn(),
    };

    await expect(
      ensurePrePeginTermsApproval({
        wallet,
        depositTerms: makeTerms("99".repeat(32)),
        fundedPrePeginTxHex: hex,
        depositorBtcPubkey: DEPOSITOR_PUBKEY,
      }),
    ).rejects.toThrow(/do not match the transaction/);
    expect(wallet.deriveContextHash).not.toHaveBeenCalled();
    expect(wallet.approveDepositTerms).not.toHaveBeenCalled();
  });

  it("derives then approves, in that order, for a matching approval wallet", async () => {
    const { hex, txid, inputTxids } = makeFundedTx();
    const order: string[] = [];
    const wallet: PrePeginApprovalWallet = {
      deriveContextHash: vi.fn(async () => {
        order.push("derive");
        return "ab".repeat(32);
      }),
      approveDepositTerms: vi.fn(async () => {
        order.push("approve");
      }),
    };
    const terms = makeTerms(txid);

    await ensurePrePeginTermsApproval({
      wallet,
      depositTerms: terms,
      fundedPrePeginTxHex: hex,
      depositorBtcPubkey: DEPOSITOR_PUBKEY,
    });

    expect(order).toEqual(["derive", "approve"]);
    expect(wallet.approveDepositTerms).toHaveBeenCalledWith(terms);

    // Pin the exact derive input: the funding outpoints must be display-order
    // txids (proving the input.hash reversal), keyed to the depositor pubkey.
    // A dropped reversal or wrong pubkey would change this context hex.
    const expectedContext = uint8ArrayToHex(
      buildVaultContext({
        depositorBtcPubkey: hexToUint8Array(DEPOSITOR_PUBKEY),
        fundingOutpoints: inputTxids.map((t) => ({
          txid: hexToUint8Array(t),
          vout: 0,
        })),
      }),
    );
    expect(wallet.deriveContextHash).toHaveBeenCalledWith(
      VAULT_APP_NAME,
      expectedContext,
    );
  });

  it("accepts a 0x-prefixed prepeginTxid in the terms", async () => {
    const { hex, txid } = makeFundedTx();
    const wallet: PrePeginApprovalWallet = {
      deriveContextHash: vi.fn(async () => "ab".repeat(32)),
      approveDepositTerms: vi.fn(),
    };

    await expect(
      ensurePrePeginTermsApproval({
        wallet,
        depositTerms: makeTerms(`0x${txid}`),
        fundedPrePeginTxHex: hex,
        depositorBtcPubkey: DEPOSITOR_PUBKEY,
      }),
    ).resolves.toBeUndefined();
    expect(wallet.approveDepositTerms).toHaveBeenCalledTimes(1);
  });

  it("runs validateDepositTerms before the derive on the ceremony path", async () => {
    const { hex, txid } = makeFundedTx();
    const order: string[] = [];
    const wallet: PrePeginApprovalWallet = {
      validateDepositTerms: vi.fn(async () => {
        order.push("validate");
      }),
      deriveContextHash: vi.fn(async () => {
        order.push("derive");
        return "ab".repeat(32);
      }),
      approveDepositTerms: vi.fn(async () => {
        order.push("approve");
      }),
    };
    const terms = makeTerms(txid);

    await ensurePrePeginTermsApproval({
      wallet,
      depositTerms: terms,
      fundedPrePeginTxHex: hex,
      depositorBtcPubkey: DEPOSITOR_PUBKEY,
    });

    expect(order).toEqual(["validate", "derive", "approve"]);
    expect(wallet.validateDepositTerms).toHaveBeenCalledWith(terms);
  });

  it("stops before the derive when validateDepositTerms rejects", async () => {
    const { hex, txid } = makeFundedTx();
    const wallet: PrePeginApprovalWallet = {
      validateDepositTerms: vi.fn(async () => {
        throw new Error("Deposit terms outside the device-supported range");
      }),
      deriveContextHash: vi.fn(),
      approveDepositTerms: vi.fn(),
    };

    await expect(
      ensurePrePeginTermsApproval({
        wallet,
        depositTerms: makeTerms(txid),
        fundedPrePeginTxHex: hex,
        depositorBtcPubkey: DEPOSITOR_PUBKEY,
      }),
    ).rejects.toThrow(/device-supported range/);
    expect(wallet.deriveContextHash).not.toHaveBeenCalled();
    expect(wallet.approveDepositTerms).not.toHaveBeenCalled();
  });

  it("skips derive and approve when the wallet still holds the approved terms", async () => {
    const { hex, txid } = makeFundedTx();
    const wallet: PrePeginApprovalWallet = {
      deriveContextHash: vi.fn(),
      approveDepositTerms: vi.fn(),
      holdsApprovedDepositTerms: vi.fn(async () => true),
    };
    const terms = makeTerms(txid);

    await ensurePrePeginTermsApproval({
      wallet,
      depositTerms: terms,
      fundedPrePeginTxHex: hex,
      depositorBtcPubkey: DEPOSITOR_PUBKEY,
    });

    expect(wallet.holdsApprovedDepositTerms).toHaveBeenCalledWith(terms);
    expect(wallet.deriveContextHash).not.toHaveBeenCalled();
    expect(wallet.approveDepositTerms).not.toHaveBeenCalled();
  });

  it("runs the full ceremony when the wallet reports the terms not held", async () => {
    const { hex, txid } = makeFundedTx();
    const order: string[] = [];
    const wallet: PrePeginApprovalWallet = {
      deriveContextHash: vi.fn(async () => {
        order.push("derive");
        return "ab".repeat(32);
      }),
      approveDepositTerms: vi.fn(async () => {
        order.push("approve");
      }),
      holdsApprovedDepositTerms: vi.fn(async () => false),
    };

    await ensurePrePeginTermsApproval({
      wallet,
      depositTerms: makeTerms(txid),
      fundedPrePeginTxHex: hex,
      depositorBtcPubkey: DEPOSITOR_PUBKEY,
    });

    expect(order).toEqual(["derive", "approve"]);
  });

  it("falls back to the full ceremony when the probe throws", async () => {
    const { hex, txid } = makeFundedTx();
    const order: string[] = [];
    const wallet: PrePeginApprovalWallet = {
      deriveContextHash: vi.fn(async () => {
        order.push("derive");
        return "ab".repeat(32);
      }),
      approveDepositTerms: vi.fn(async () => {
        order.push("approve");
      }),
      holdsApprovedDepositTerms: vi.fn(async () => {
        throw new Error("seam-violating probe");
      }),
    };

    await ensurePrePeginTermsApproval({
      wallet,
      depositTerms: makeTerms(txid),
      fundedPrePeginTxHex: hex,
      depositorBtcPubkey: DEPOSITOR_PUBKEY,
    });

    expect(order).toEqual(["derive", "approve"]);
  });

  it("invokes approveDepositTerms with the wallet as `this`", async () => {
    const { hex, txid } = makeFundedTx();
    const calls: unknown[] = [];
    const wallet: PrePeginApprovalWallet & { calls: unknown[] } = {
      calls,
      deriveContextHash: vi.fn(async () => "ab".repeat(32)),
      // Prototype-style method: `this` must be the wallet, not undefined.
      async approveDepositTerms(terms) {
        this.calls.push(terms);
      },
    };
    const terms = makeTerms(txid);

    await ensurePrePeginTermsApproval({
      wallet,
      depositTerms: terms,
      fundedPrePeginTxHex: hex,
      depositorBtcPubkey: DEPOSITOR_PUBKEY,
    });

    expect(calls).toEqual([terms]);
  });

  it("still rejects mismatched-txid terms even when the wallet holds an approval", async () => {
    const { hex } = makeFundedTx();
    const wallet: PrePeginApprovalWallet = {
      deriveContextHash: vi.fn(),
      approveDepositTerms: vi.fn(),
      holdsApprovedDepositTerms: vi.fn(async () => true),
    };

    await expect(
      ensurePrePeginTermsApproval({
        wallet,
        depositTerms: makeTerms("99".repeat(32)),
        fundedPrePeginTxHex: hex,
        depositorBtcPubkey: DEPOSITOR_PUBKEY,
      }),
    ).rejects.toThrow(/do not match the transaction/);
    expect(wallet.holdsApprovedDepositTerms).not.toHaveBeenCalled();
  });
});
