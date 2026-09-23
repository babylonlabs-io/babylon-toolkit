import { Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import type { Hex } from "viem";
import { describe, expect, it } from "vitest";

import { hexToUint8Array } from "../../primitives/utils/bitcoin";
import { calculateBtcTxHash } from "../../utils/transaction/btcTxHash";
import { buildVaultContextInputForClaim } from "../buildVaultContextInputForClaim";
import { buildVaultContext } from "../context";
import { parseFundingOutpointsFromTx } from "../parseFundingOutpoints";

const DEPOSITOR_BTC_PUBKEY =
  "0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798" as Hex;

function fundedTx(): string {
  const tx = new Transaction();
  tx.version = 2;
  tx.addInput(Buffer.alloc(32, 0x11), 3);
  tx.addInput(Buffer.alloc(32, 0x22), 0);
  tx.addOutput(Buffer.from(`5120${"00".repeat(32)}`, "hex"), 1000);
  return tx.toHex();
}

describe("buildVaultContextInputForClaim", () => {
  it("produces the same context bytes as the deposit-time recipe (on-chain key bytes + parsed outpoints)", () => {
    const txHex = fundedTx();

    const input = buildVaultContextInputForClaim({
      depositorBtcPubKey: DEPOSITOR_BTC_PUBKEY,
      fundedPrePeginTxHex: txHex,
      prePeginTxHash: calculateBtcTxHash(txHex),
    });

    const byHand = {
      depositorBtcPubkey: hexToUint8Array(DEPOSITOR_BTC_PUBKEY),
      fundingOutpoints: parseFundingOutpointsFromTx(txHex),
    };
    expect(Buffer.from(buildVaultContext(input))).toEqual(
      Buffer.from(buildVaultContext(byHand)),
    );
    // Input order is the transaction's, not sorted: the commitment depends on it.
    expect(input.fundingOutpoints.map((o) => o.vout)).toEqual([3, 0]);
  });

  it("refuses a Pre-PegIn hex that does not hash to the on-chain prePeginTxHash", () => {
    expect(() =>
      buildVaultContextInputForClaim({
        depositorBtcPubKey: DEPOSITOR_BTC_PUBKEY,
        fundedPrePeginTxHex: fundedTx(),
        prePeginTxHash: `0x${"ff".repeat(32)}` as Hex,
      }),
    ).toThrow(/refusing to derive from it/);
  });

  it("refuses a registered key that is not 32 bytes", () => {
    const txHex = fundedTx();

    expect(() =>
      buildVaultContextInputForClaim({
        depositorBtcPubKey: `0x02${"11".repeat(32)}` as Hex,
        fundedPrePeginTxHex: txHex,
        prePeginTxHash: calculateBtcTxHash(txHex),
      }),
    ).toThrow(/must be 32 bytes \(x-only\), got 33/);
  });
});
