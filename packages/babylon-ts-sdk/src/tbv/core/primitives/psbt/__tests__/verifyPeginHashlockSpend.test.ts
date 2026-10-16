/**
 * verifyPeginHashlockSpend — a served PegIn counts as a valid spend of its
 * vault's HTLC only when its witness would pass Bitcoin's own checks. The real cases
 * replay a PegIn the vault provider broadcast on signet (the Rust finalizer's
 * output); the synthetic cases build the HTLC taptree and sign it with test keys
 * to reach the shapes a real deposit never shows.
 */

import { Buffer } from "buffer";

import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import {
  Transaction,
  crypto as bcrypto,
  script as bscript,
  opcodes,
  payments,
} from "bitcoinjs-lib";
import { describe, expect, it } from "vitest";

import { verifyPeginHashlockSpend } from "../verifyPeginHashlockSpend";
import {
  SIGNET_HASHLOCK,
  SIGNET_HTLC_VOUT,
  SIGNET_PEGIN_TXID,
  SIGNET_PEGIN_TX_HEX,
  SIGNET_PRE_PEGIN_TXID,
  SIGNET_PRE_PEGIN_TX_HEX,
} from "./signetPeginHashlockSpend.fixture";

const SIGNET_PARAMS = {
  peginTxHex: SIGNET_PEGIN_TX_HEX,
  prePeginTxHex: SIGNET_PRE_PEGIN_TX_HEX,
  peginTxid: SIGNET_PEGIN_TXID,
  prePeginTxid: SIGNET_PRE_PEGIN_TXID,
  htlcVout: SIGNET_HTLC_VOUT,
  hashlock: SIGNET_HASHLOCK,
};

/** The signet PegIn with its HTLC input's witness replaced. */
function signetPeginWithWitness(
  rewrite: (witness: Buffer[]) => Buffer[],
): string {
  const tx = Transaction.fromHex(SIGNET_PEGIN_TX_HEX);
  tx.setWitness(0, rewrite(tx.ins[0].witness.map((item) => Buffer.from(item))));
  return tx.toHex();
}

// Witness layout of the signet PegIn: 4 challenger and 4 keeper signatures,
// then the vault provider's and the depositor's, the preimage, the leaf script
// and the control block.
const SIGNET_PREIMAGE_INDEX = 10;
const SIGNET_DEPOSITOR_SIG_INDEX = 9;
const SIGNET_VAULT_PROVIDER_SIG_INDEX = 8;
const SIGNET_FIRST_CHALLENGER_SIG_INDEX = 0;

describe("verifyPeginHashlockSpend — a real signet PegIn", () => {
  it("accepts the PegIn the vault provider broadcast", () => {
    expect(verifyPeginHashlockSpend(SIGNET_PARAMS)).toEqual({ valid: true });
  });

  it("refuses the depositor-signed PegIn the registry publishes, which has the same txid but no preimage", () => {
    const depositorSigned = signetPeginWithWitness((w) => [
      w[SIGNET_DEPOSITOR_SIG_INDEX],
      w[w.length - 2],
      w[w.length - 1],
    ]);

    expect(
      verifyPeginHashlockSpend({
        ...SIGNET_PARAMS,
        peginTxHex: depositorSigned,
      }),
    ).toEqual({
      valid: false,
      reason: "the witness does not hold one item per check of the leaf",
    });
  });

  it("refuses a witness that is only the secret, as a forger who read it from a reverted activation could build", () => {
    const secretOnly = signetPeginWithWitness((w) => [
      w[SIGNET_PREIMAGE_INDEX],
    ]);

    expect(
      verifyPeginHashlockSpend({ ...SIGNET_PARAMS, peginTxHex: secretOnly }),
    ).toEqual({
      valid: false,
      reason: "the HTLC input has no script-path witness",
    });
  });

  it("refuses the full witness shape built from the secret with signatures that do not verify", () => {
    const forged = signetPeginWithWitness((w) =>
      w.map((item, i) =>
        i < SIGNET_PREIMAGE_INDEX ? Buffer.alloc(item.length, 1) : item,
      ),
    );

    expect(
      verifyPeginHashlockSpend({ ...SIGNET_PARAMS, peginTxHex: forged }),
    ).toEqual({
      valid: false,
      reason: "the depositor's signature does not verify",
    });
  });

  it("refuses the PegIn when one challenger's signature is altered", () => {
    const tampered = signetPeginWithWitness((w) => {
      const signature = Buffer.from(w[SIGNET_FIRST_CHALLENGER_SIG_INDEX]);
      signature[0] ^= 1;
      return [signature, ...w.slice(1)];
    });

    expect(
      verifyPeginHashlockSpend({ ...SIGNET_PARAMS, peginTxHex: tampered }),
    ).toEqual({ valid: false, reason: "a multisig signature does not verify" });
  });

  it("refuses the PegIn against a hashlock that is not the vault's", () => {
    expect(
      verifyPeginHashlockSpend({
        ...SIGNET_PARAMS,
        hashlock: `0x${"ab".repeat(32)}`,
      }),
    ).toEqual({
      valid: false,
      reason: "the leaf's hashlock is not the vault's",
    });
  });

  it("refuses a PegIn whose txid is not the on-chain signed PegIn's", () => {
    expect(
      verifyPeginHashlockSpend({
        ...SIGNET_PARAMS,
        peginTxid: "cd".repeat(32),
      }),
    ).toEqual({
      valid: false,
      reason: "the served PegIn is not the on-chain signed PegIn",
    });
  });

  it("refuses a Pre-PegIn that is not the registered one", () => {
    const otherPrePegin = Transaction.fromHex(SIGNET_PRE_PEGIN_TX_HEX);
    otherPrePegin.locktime += 1;

    expect(
      verifyPeginHashlockSpend({
        ...SIGNET_PARAMS,
        prePeginTxHex: otherPrePegin.toHex(),
      }),
    ).toEqual({
      valid: false,
      reason: "the served Pre-PegIn is not the registered one",
    });
  });

  it("refuses bytes that do not parse as a transaction", () => {
    expect(
      verifyPeginHashlockSpend({ ...SIGNET_PARAMS, peginTxHex: "deadbeef" }),
    ).toEqual({ valid: false, reason: "a served transaction does not parse" });
  });

  it("refuses every real signature around a 32-byte preimage that is not the secret, as an API without the secret could build", () => {
    // The signatures are public and do not commit to the witness, so they
    // still verify: the preimage is all that stands in the way.
    const wrongPreimage = signetPeginWithWitness((w) =>
      w.map((item, i) =>
        i === SIGNET_PREIMAGE_INDEX ? Buffer.alloc(32, 0x42) : item,
      ),
    );

    expect(
      verifyPeginHashlockSpend({ ...SIGNET_PARAMS, peginTxHex: wrongPreimage }),
    ).toEqual({
      valid: false,
      reason: "the witness does not open the hashlock",
    });
  });

  it("refuses the PegIn when the vault provider's signature is altered", () => {
    const tampered = signetPeginWithWitness((w) =>
      w.map((item, i) => {
        if (i !== SIGNET_VAULT_PROVIDER_SIG_INDEX) return item;
        const signature = Buffer.from(item);
        signature[0] ^= 1;
        return signature;
      }),
    );

    expect(
      verifyPeginHashlockSpend({ ...SIGNET_PARAMS, peginTxHex: tampered }),
    ).toEqual({
      valid: false,
      reason: "the vault provider's signature does not verify",
    });
  });

  it("refuses a challenger signature left empty, short of the challengers' threshold", () => {
    const abstaining = signetPeginWithWitness((w) =>
      w.map((item, i) =>
        i === SIGNET_FIRST_CHALLENGER_SIG_INDEX ? Buffer.alloc(0) : item,
      ),
    );

    expect(
      verifyPeginHashlockSpend({ ...SIGNET_PARAMS, peginTxHex: abstaining }),
    ).toEqual({
      valid: false,
      reason: "a multisig block is short of its threshold",
    });
  });

  it("refuses a 65-byte signature with an explicit SIGHASH_DEFAULT, which BIP-341 only allows implicitly", () => {
    const explicitDefault = signetPeginWithWitness((w) =>
      w.map((item, i) =>
        i === SIGNET_DEPOSITOR_SIG_INDEX
          ? Buffer.concat([item, Buffer.from([0x00])])
          : item,
      ),
    );

    expect(
      verifyPeginHashlockSpend({
        ...SIGNET_PARAMS,
        peginTxHex: explicitDefault,
      }),
    ).toEqual({
      valid: false,
      reason: "the depositor's signature does not verify",
    });
  });

  it("refuses a witness carrying an annex", () => {
    const withAnnex = signetPeginWithWitness((w) => [
      ...w,
      Buffer.from([0x50, 0x01]),
    ]);

    expect(
      verifyPeginHashlockSpend({ ...SIGNET_PARAMS, peginTxHex: withAnnex }),
    ).toEqual({
      valid: false,
      reason: "the HTLC input's witness carries an annex",
    });
  });

  it("refuses a truncated control block", () => {
    const truncated = signetPeginWithWitness((w) => [
      ...w.slice(0, -1),
      w[w.length - 1].subarray(0, 40),
    ]);

    expect(
      verifyPeginHashlockSpend({ ...SIGNET_PARAMS, peginTxHex: truncated }),
    ).toEqual({ valid: false, reason: "the control block is malformed" });
  });

  it("refuses a PegIn with a second input, whose prevout the check cannot authenticate", () => {
    const tx = Transaction.fromHex(SIGNET_PEGIN_TX_HEX);
    tx.addInput(Buffer.alloc(32, 7), 0);

    expect(
      verifyPeginHashlockSpend({
        ...SIGNET_PARAMS,
        peginTxHex: tx.toHex(),
        peginTxid: tx.getId(),
      }),
    ).toEqual({
      valid: false,
      reason: "the PegIn does not have exactly one input",
    });
  });

  it("refuses a PegIn spending another output of the registered Pre-PegIn", () => {
    const tx = Transaction.fromHex(SIGNET_PEGIN_TX_HEX);
    tx.ins[0].index = SIGNET_HTLC_VOUT + 1;

    expect(
      verifyPeginHashlockSpend({
        ...SIGNET_PARAMS,
        peginTxHex: tx.toHex(),
        peginTxid: tx.getId(),
      }),
    ).toEqual({
      valid: false,
      reason: "the PegIn does not spend the vault's HTLC output",
    });
  });

  it("refuses an HTLC index the registered Pre-PegIn has no output at", () => {
    const missingVout = 9;
    const tx = Transaction.fromHex(SIGNET_PEGIN_TX_HEX);
    tx.ins[0].index = missingVout;

    expect(
      verifyPeginHashlockSpend({
        ...SIGNET_PARAMS,
        peginTxHex: tx.toHex(),
        peginTxid: tx.getId(),
        htlcVout: missingVout,
      }),
    ).toEqual({
      valid: false,
      reason: "the Pre-PegIn has no output at the HTLC index",
    });
  });
});

// ── Synthetic HTLCs ──────────────────────────────────────────────────────────

/** BIP-341's provably unspendable internal key, as the HTLC uses. */
const NUMS_INTERNAL_KEY = Buffer.from(
  "50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0",
  "hex",
);
const PREIMAGE = Buffer.alloc(32, 0x42);
const HTLC_VALUE = 1_040_610;
const REFUND_TIMELOCK = 144;
const FUNDING_TXID = Buffer.alloc(32, 0x99);

interface Signer {
  priv: Buffer;
  xOnly: Buffer;
}

function signer(seed: number): Signer {
  const priv = Buffer.alloc(32, seed);
  return { priv, xOnly: Buffer.from(ecc.xOnlyPointFromScalar(priv)) };
}

function sortedSigners(seeds: number[]): Signer[] {
  return seeds.map(signer).sort((a, b) => Buffer.compare(a.xOnly, b.xOnly));
}

/** `<k_1> OP_CHECKSIG <k_2..n> OP_CHECKSIGADD <n> OP_NUMEQUAL[VERIFY]`. */
function multisigChunks(keys: Signer[], verify: boolean): (number | Buffer)[] {
  return [
    ...keys.flatMap((key, i) => [
      key.xOnly,
      i === 0 ? opcodes.OP_CHECKSIG : opcodes.OP_CHECKSIGADD,
    ]),
    bscript.number.encode(keys.length),
    verify ? opcodes.OP_NUMEQUALVERIFY : opcodes.OP_NUMEQUAL,
  ];
}

interface Htlc {
  depositor: Signer;
  vaultProvider: Signer;
  keepers: Signer[];
  challengers: Signer[];
  hashlockLeaf: Buffer;
  refundLeaf: Buffer;
}

function htlc(keeperSeeds: number[], challengerSeeds: number[]): Htlc {
  const depositor = signer(1);
  const vaultProvider = signer(2);
  const keepers = sortedSigners(keeperSeeds);
  const challengers = sortedSigners(challengerSeeds);
  const hashlockLeaf = bscript.compile([
    opcodes.OP_SIZE,
    bscript.number.encode(32),
    opcodes.OP_EQUALVERIFY,
    opcodes.OP_SHA256,
    bcrypto.sha256(PREIMAGE),
    opcodes.OP_EQUALVERIFY,
    depositor.xOnly,
    opcodes.OP_CHECKSIGVERIFY,
    vaultProvider.xOnly,
    opcodes.OP_CHECKSIGVERIFY,
    ...multisigChunks(keepers, challengers.length > 0),
    ...(challengers.length > 0 ? multisigChunks(challengers, false) : []),
  ]);
  const refundLeaf = bscript.compile([
    depositor.xOnly,
    opcodes.OP_CHECKSIGVERIFY,
    bscript.number.encode(REFUND_TIMELOCK),
    opcodes.OP_CHECKSEQUENCEVERIFY,
  ]);
  return {
    depositor,
    vaultProvider,
    keepers,
    challengers,
    hashlockLeaf,
    refundLeaf,
  };
}

/** BIP-341 TapLeaf hash; a leaf of 253 bytes or more needs the 3-byte length. */
function tapLeafHash(leaf: Buffer): Buffer {
  const length =
    leaf.length < 0xfd
      ? Buffer.from([leaf.length])
      : Buffer.from([0xfd, leaf.length & 0xff, leaf.length >> 8]);
  return bcrypto.taggedHash(
    "TapLeaf",
    Buffer.concat([Buffer.from([0xc0]), length, leaf]),
  );
}

interface Spend {
  leaf: Buffer;
  /** Signs the PegIn's sighash for a key; return an empty buffer to abstain. */
  sign: (who: Signer, sighash: Buffer) => Buffer;
}

/** Fund the HTLC in a Pre-PegIn and spend it from a one-input PegIn. */
function buildSpend(h: Htlc, spend: Spend) {
  const scriptTree: [{ output: Buffer }, { output: Buffer }] = [
    { output: h.hashlockLeaf },
    { output: h.refundLeaf },
  ];
  const htlcPayment = payments.p2tr({
    internalPubkey: NUMS_INTERNAL_KEY,
    scriptTree,
    redeem: { output: spend.leaf, redeemVersion: 0xc0 },
  });
  const htlcScript = htlcPayment.output as Buffer;
  const [, controlBlock] = htlcPayment.witness as Buffer[];

  const prePegin = new Transaction();
  prePegin.version = 2;
  prePegin.addInput(FUNDING_TXID, 0);
  prePegin.addOutput(htlcScript, HTLC_VALUE);

  const pegin = new Transaction();
  pegin.version = 3;
  pegin.addInput(Buffer.from(prePegin.getHash()), 0, 0xfffffffe);
  pegin.addOutput(Buffer.from(`5120${"11".repeat(32)}`, "hex"), 1_000_000);

  const leafHash = tapLeafHash(spend.leaf);
  const sighash = pegin.hashForWitnessV1(
    0,
    [htlcScript],
    [HTLC_VALUE],
    Transaction.SIGHASH_DEFAULT,
    leafHash,
  );
  const sign = (who: Signer) => spend.sign(who, sighash);
  // Evaluation order reversed: challengers, keepers, VP, depositor, preimage.
  const stack = [
    PREIMAGE,
    sign(h.depositor),
    sign(h.vaultProvider),
    ...h.keepers.map(sign),
    ...h.challengers.map(sign),
  ].reverse();
  pegin.setWitness(0, [...stack, spend.leaf, controlBlock]);

  return {
    peginTxHex: pegin.toHex(),
    prePeginTxHex: prePegin.toHex(),
    peginTxid: pegin.getId(),
    prePeginTxid: prePegin.getId(),
    htlcVout: 0,
    hashlock: bcrypto.sha256(PREIMAGE).toString("hex"),
  };
}

const schnorr = (who: Signer, sighash: Buffer) =>
  Buffer.from(ecc.signSchnorr(sighash, who.priv));

describe("verifyPeginHashlockSpend — synthetic HTLCs", () => {
  it("accepts a hashlock spend every party signed", () => {
    const h = htlc([11, 12], [21, 22, 23]);

    expect(
      verifyPeginHashlockSpend(
        buildSpend(h, { leaf: h.hashlockLeaf, sign: schnorr }),
      ),
    ).toEqual({ valid: true });
  });

  it("accepts a vault with no universal challengers, whose keeper block is the final check", () => {
    const h = htlc([11, 12, 13], []);

    expect(
      verifyPeginHashlockSpend(
        buildSpend(h, { leaf: h.hashlockLeaf, sign: schnorr }),
      ),
    ).toEqual({ valid: true });
  });

  it("refuses a spend one keeper abstained from, short of the keepers' N-of-N", () => {
    const h = htlc([11, 12], [21]);
    const abstaining = h.keepers[1];

    expect(
      verifyPeginHashlockSpend(
        buildSpend(h, {
          leaf: h.hashlockLeaf,
          sign: (who, sighash) =>
            who === abstaining ? Buffer.alloc(0) : schnorr(who, sighash),
        }),
      ),
    ).toEqual({
      valid: false,
      reason: "a multisig block is short of its threshold",
    });
  });

  it("refuses a spend through the refund leaf", () => {
    const h = htlc([11], [21]);
    const refund = buildSpend(h, { leaf: h.refundLeaf, sign: schnorr });
    // A refund witness is `[depositor sig, script, control block]`.
    const tx = Transaction.fromHex(refund.peginTxHex);
    const [, , , , , script, controlBlock] = tx.ins[0].witness;
    tx.setWitness(0, [Buffer.alloc(64, 1), script, controlBlock]);

    expect(
      verifyPeginHashlockSpend({
        ...refund,
        peginTxHex: tx.toHex(),
        peginTxid: tx.getId(),
      }),
    ).toEqual({
      valid: false,
      reason: "the spent leaf is not the hashlock leaf",
    });
  });

  it("refuses a correctly signed hashlock leaf committed to a different HTLC output", () => {
    const h = htlc([11], [21]);
    const spend = buildSpend(h, { leaf: h.hashlockLeaf, sign: schnorr });
    const other = htlc([31], [41]);
    const otherSpend = buildSpend(other, {
      leaf: other.hashlockLeaf,
      sign: schnorr,
    });
    // The first PegIn, signed under its own HTLC, against the other Pre-PegIn.
    const tx = Transaction.fromHex(spend.peginTxHex);
    tx.ins[0].hash = Buffer.from(
      Transaction.fromHex(otherSpend.prePeginTxHex).getHash(),
    );

    expect(
      verifyPeginHashlockSpend({
        ...spend,
        peginTxHex: tx.toHex(),
        peginTxid: tx.getId(),
        prePeginTxHex: otherSpend.prePeginTxHex,
        prePeginTxid: otherSpend.prePeginTxid,
      }),
    ).toEqual({
      valid: false,
      reason: "the leaf is not committed to the vault's HTLC output",
    });
  });

  it("accepts a signature carrying an explicit SIGHASH_ALL", () => {
    const h = htlc([11], [21]);
    const spend = buildSpend(h, { leaf: h.hashlockLeaf, sign: schnorr });
    const tx = Transaction.fromHex(spend.peginTxHex);
    const prePegin = Transaction.fromHex(spend.prePeginTxHex);
    const leafHash = tapLeafHash(h.hashlockLeaf);
    const sighashAll = tx.hashForWitnessV1(
      0,
      [prePegin.outs[0].script],
      [HTLC_VALUE],
      Transaction.SIGHASH_ALL,
      leafHash,
    );
    const witness = tx.ins[0].witness;
    // The depositor's signature sits just under the preimage.
    const depositorIndex = witness.length - 4;
    witness[depositorIndex] = Buffer.concat([
      schnorr(h.depositor, sighashAll),
      Buffer.from([Transaction.SIGHASH_ALL]),
    ]);
    tx.setWitness(0, witness);

    expect(
      verifyPeginHashlockSpend({ ...spend, peginTxHex: tx.toHex() }),
    ).toEqual({ valid: true });
  });

  it("refuses a signature made over a sighash type BIP-341 does not define", () => {
    const undefinedHashType = 0x04;
    const h = htlc([11], [21]);
    const spend = buildSpend(h, { leaf: h.hashlockLeaf, sign: schnorr });
    const tx = Transaction.fromHex(spend.peginTxHex);
    const prePegin = Transaction.fromHex(spend.prePeginTxHex);
    // bitcoinjs hashes any type byte, so this signature verifies against the
    // sighash its type names: only the type check refuses it.
    const sighash = tx.hashForWitnessV1(
      0,
      [prePegin.outs[0].script],
      [HTLC_VALUE],
      undefinedHashType,
      tapLeafHash(h.hashlockLeaf),
    );
    const witness = tx.ins[0].witness;
    // The depositor's signature sits just under the preimage.
    const depositorIndex = witness.length - 4;
    witness[depositorIndex] = Buffer.concat([
      schnorr(h.depositor, sighash),
      Buffer.from([undefinedHashType]),
    ]);
    tx.setWitness(0, witness);

    expect(
      verifyPeginHashlockSpend({ ...spend, peginTxHex: tx.toHex() }),
    ).toEqual({
      valid: false,
      reason: "the depositor's signature does not verify",
    });
  });

  it("refuses a signature longer than 65 bytes, though its first 64 bytes verify", () => {
    const h = htlc([11], [21]);
    const spend = buildSpend(h, { leaf: h.hashlockLeaf, sign: schnorr });
    const tx = Transaction.fromHex(spend.peginTxHex);
    const witness = tx.ins[0].witness;
    // The depositor's signature sits just under the preimage.
    const depositorIndex = witness.length - 4;
    witness[depositorIndex] = Buffer.concat([
      witness[depositorIndex],
      Buffer.from([0x00, 0x00]),
    ]);
    tx.setWitness(0, witness);

    expect(
      verifyPeginHashlockSpend({ ...spend, peginTxHex: tx.toHex() }),
    ).toEqual({
      valid: false,
      reason: "the depositor's signature does not verify",
    });
  });

  it("refuses a preimage of the leaf's hashlock that is not 32 bytes long, as the leaf's OP_SIZE check does", () => {
    const longPreimage = Buffer.alloc(33, 0x42);
    const hashlock = bcrypto.sha256(longPreimage);
    const h = htlc([11], [21]);
    const chunks = bscript.decompile(h.hashlockLeaf) as (number | Buffer)[];
    // The hashlock is the push after OP_SHA256.
    chunks[chunks.indexOf(opcodes.OP_SHA256) + 1] = hashlock;
    const leaf = bscript.compile(chunks);
    const spend = buildSpend({ ...h, hashlockLeaf: leaf }, { leaf, sign: schnorr });
    const tx = Transaction.fromHex(spend.peginTxHex);
    const witness = tx.ins[0].witness;
    // The preimage sits just under the leaf script and the control block; the
    // signatures do not commit to it.
    witness[witness.length - 3] = longPreimage;
    tx.setWitness(0, witness);

    expect(
      verifyPeginHashlockSpend({
        ...spend,
        peginTxHex: tx.toHex(),
        hashlock: hashlock.toString("hex"),
      }),
    ).toEqual({
      valid: false,
      reason: "the witness does not open the hashlock",
    });
  });

  it("refuses a committed hashlock leaf with an operation after its last multisig block", () => {
    const h = htlc([11], [21]);
    const leaf = Buffer.concat([h.hashlockLeaf, Buffer.from([opcodes.OP_1])]);

    expect(
      verifyPeginHashlockSpend(
        buildSpend({ ...h, hashlockLeaf: leaf }, { leaf, sign: schnorr }),
      ),
    ).toEqual({
      valid: false,
      reason: "the spent leaf is not the hashlock leaf",
    });
  });

  it("refuses a committed hashlock leaf with a third multisig block", () => {
    const h = htlc([11], [21]);
    const chunks = bscript.decompile(h.hashlockLeaf) as (number | Buffer)[];
    // The challengers' closing OP_NUMEQUAL becomes a VERIFY, and a third
    // block closes the leaf instead.
    chunks[chunks.length - 1] = opcodes.OP_NUMEQUALVERIFY;
    const leaf = bscript.compile([
      ...chunks,
      ...multisigChunks([signer(31)], false),
    ]);

    expect(
      verifyPeginHashlockSpend(
        buildSpend({ ...h, hashlockLeaf: leaf }, { leaf, sign: schnorr }),
      ),
    ).toEqual({
      valid: false,
      reason: "the spent leaf is not the hashlock leaf",
    });
  });
});
