/**
 * peginWitnessRevealsSecret — proving from the PegIn transaction itself, not
 * the mempool API's word, that the HTLC secret is already public before the
 * redeem reveals it. Transactions are built with bitcoinjs-lib in the shape of
 * the hashlock-leaf spend: `[sigs…, preimage, leaf script, control block]`.
 */

import { Transaction } from "bitcoinjs-lib";
import { describe, expect, it } from "vitest";

import { peginWitnessRevealsSecret } from "../outspend";

// secret = 32-byte 0x…01, hashlock = sha256 of that preimage.
const PREIMAGE = Buffer.from(`${"00".repeat(31)}01`, "hex");
const HASHLOCK =
  "0xec4916dd28fc4c10d78e287ca5d9cc51ee1ae73cbfde08c6b37324cbfaac8bc5";
const HTLC_TXID = "ab".repeat(32);
const SIGNATURE = Buffer.alloc(64, 7);
const LEAF_SCRIPT = Buffer.alloc(120, 9);
const CONTROL_BLOCK = Buffer.alloc(65, 3);
const VAULT_OUTPUT_SCRIPT = Buffer.from(`5120${"11".repeat(32)}`, "hex");

function pegin(witness: Buffer[], spentVout = 0): Transaction {
  const tx = new Transaction();
  tx.version = 2;
  tx.addInput(Buffer.from(HTLC_TXID, "hex").reverse(), spentVout, 0xfffffffe);
  tx.addOutput(VAULT_OUTPUT_SCRIPT, 1_000_000);
  tx.setWitness(0, witness);
  return tx;
}

function expectedFor(tx: Transaction) {
  return {
    peginTxid: tx.getId(),
    prePeginTxHash: `0x${HTLC_TXID}`,
    htlcVout: 0,
    hashlock: HASHLOCK,
  };
}

describe("peginWitnessRevealsSecret", () => {
  it("proves the secret is public when the PegIn's HTLC input carries the hashlock preimage", () => {
    const tx = pegin([
      SIGNATURE,
      SIGNATURE,
      PREIMAGE,
      LEAF_SCRIPT,
      CONTROL_BLOCK,
    ]);

    expect(peginWitnessRevealsSecret(tx.toHex(), expectedFor(tx))).toBe(true);
  });

  it("rejects the depositor-signed PegIn, whose witness carries no preimage", () => {
    const tx = pegin([SIGNATURE, LEAF_SCRIPT, CONTROL_BLOCK]);

    expect(peginWitnessRevealsSecret(tx.toHex(), expectedFor(tx))).toBe(false);
  });

  it("rejects a 32-byte witness item that does not hash to the hashlock", () => {
    const tx = pegin([
      SIGNATURE,
      Buffer.alloc(32, 5),
      LEAF_SCRIPT,
      CONTROL_BLOCK,
    ]);

    expect(peginWitnessRevealsSecret(tx.toHex(), expectedFor(tx))).toBe(false);
  });

  it("rejects a transaction whose txid is not the on-chain PegIn's", () => {
    const tx = pegin([SIGNATURE, PREIMAGE, LEAF_SCRIPT, CONTROL_BLOCK]);

    expect(
      peginWitnessRevealsSecret(tx.toHex(), {
        ...expectedFor(tx),
        peginTxid: "cd".repeat(32),
      }),
    ).toBe(false);
  });

  it("rejects a PegIn that spends a different outpoint than the vault's HTLC", () => {
    const tx = pegin([SIGNATURE, PREIMAGE, LEAF_SCRIPT, CONTROL_BLOCK], 1);

    expect(peginWitnessRevealsSecret(tx.toHex(), expectedFor(tx))).toBe(false);
  });

  it("rejects bytes that do not parse as a transaction", () => {
    expect(
      peginWitnessRevealsSecret("deadbeef", {
        peginTxid: "cd".repeat(32),
        prePeginTxHash: HTLC_TXID,
        htlcVout: 0,
        hashlock: HASHLOCK,
      }),
    ).toBe(false);
  });
});
