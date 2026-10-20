/**
 * The half of the PegIn-witness checks that needs no browser: what `--inject-pegin-psbt-extras` makes
 * the wallet add to its PegIn answer, and the check every pegin run makes on the PegIn the registry
 * stores.
 *
 * A wallet answers the PegIn signing request with a PSBT, and only the depositor's signature in it is
 * meant to reach the registered PegIn. The vault provider checks the registered bytes' txid and that
 * the witness has three items, and reads only the signature out of them, so a vault that activates
 * says nothing about the leaf script and control block; `assertRegisteredPeginWitness` checks the
 * whole witness. Kept free of Playwright so both halves can be
 * unit-tested on their own (see peginWalletPsbtInjection.ts for the page side).
 */
import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { crypto, initEccLib, payments, Psbt, Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";

/** BIP-341 tapscript leaf version, and the control-block bits that carry it. */
const TAPSCRIPT_LEAF_VERSION = 0xc0;
const LEAF_VERSION_MASK = 0xfe;
const SCHNORR_SIGNATURE_BYTES = 64;
const X_ONLY_PUBKEY_BYTES = 32;
const LEAF_HASH_BYTES = 32;
/** A depositor-only script-path spend: signature, leaf script, control block. */
const SCRIPT_PATH_WITNESS_ITEMS = 3;
/** OP_TRUE: any non-empty scriptSig changes the txid the registry derives the vault id from. */
const EXTRA_SCRIPT_SIG = Buffer.from([0x51]);
/** Largest length a one-byte CompactSize encodes, and the prefix of the three-byte form. */
const COMPACT_SIZE_ONE_BYTE_MAX = 0xfc;
const COMPACT_SIZE_TWO_BYTE_PREFIX = 0xfd;
const COMPACT_SIZE_TWO_BYTE_MAX = 0xffff;

const stripHex = (value: string): string => value.replace(/^0x/i, "");

function compactSize(length: number): Buffer {
  if (length <= COMPACT_SIZE_ONE_BYTE_MAX) return Buffer.from([length]);
  if (length > COMPACT_SIZE_TWO_BYTE_MAX)
    throw new Error(`Length ${length} is too large for a tapscript item.`);
  const encoded = Buffer.alloc(3);
  encoded[0] = COMPACT_SIZE_TWO_BYTE_PREFIX;
  encoded.writeUInt16LE(length, 1);
  return encoded;
}

/** BIP-341 `TapLeaf` hash of `script` under `leafVersion`. */
function tapLeafHash(leafVersion: number, script: Buffer): Buffer {
  return crypto.taggedHash(
    "TapLeaf",
    Buffer.concat([
      Buffer.from([leafVersion]),
      compactSize(script.length),
      script,
    ]),
  );
}

/** A serialized witness stack, as a PSBT's `finalScriptWitness` holds it. */
function serializeWitness(items: readonly Buffer[]): Buffer {
  return Buffer.concat([
    compactSize(items.length),
    ...items.flatMap((item) => [compactSize(item.length), item]),
  ]);
}

/**
 * The wallet's PegIn answer with fields added beside its genuine signature, as a non-conforming wallet
 * might return it: a key-path signature, its own one-item final witness, a scriptSig, and the signature
 * filed under a leaf hash no leaf of the PSBT has. The unsigned transaction and the signature bytes are
 * unchanged, so the dApp's own checks of the answer still pass.
 *
 * @throws If the answer is not an unfinalized one-input PSBT carrying exactly one script-path signature
 *   — then it is not the PegIn answer, and the run must not go on believing it tampered with it.
 */
export function addWalletPsbtExtras(signedPsbtHex: string): string {
  const psbt = Psbt.fromHex(signedPsbtHex);
  if (psbt.data.inputs.length !== 1)
    throw new Error(
      `Expected the PegIn answer to have one input, got ${psbt.data.inputs.length}: this is not the PegIn signature.`,
    );
  const input = psbt.data.inputs[0];
  if (input.tapKeySig || input.finalScriptWitness || input.finalScriptSig)
    throw new Error(
      "The wallet's PegIn answer is already key-signed or finalized; there is no unfinalized answer to add to.",
    );
  const scriptSigs = input.tapScriptSig ?? [];
  if (scriptSigs.length !== 1)
    throw new Error(
      `Expected the PegIn answer to carry one script-path signature, got ${scriptSigs.length}: this is not the PegIn signature.`,
    );

  const [genuine] = scriptSigs;
  input.tapScriptSig = [
    { ...genuine, leafHash: Buffer.alloc(LEAF_HASH_BYTES, 0) },
  ];
  psbt.updateInput(0, {
    tapKeySig: genuine.signature,
    finalScriptWitness: serializeWitness([genuine.signature]),
    finalScriptSig: EXTRA_SCRIPT_SIG,
  });
  return psbt.toHex();
}

/** The registry's record of one vault's PegIn, and the funded Pre-PegIn it spends. */
export interface RegisteredPegin {
  /** `protocol.depositorSignedPeginTx`. */
  depositorSignedPeginTx: string;
  /** `protocol.prePeginTxHash`. */
  prePeginTxHash: string;
  /** `protocol.htlcVout`. */
  htlcVout: number;
  /** `basic.depositorBtcPubKey`: the depositor's x-only key. */
  depositorBtcPubKey: string;
  /** The funded Pre-PegIn whose txid is `prePeginTxHash`. */
  fundedPrePeginTxHex: string;
}

/**
 * Require the registered PegIn to be the depositor's script-path spend of its HTLC output, as the dApp
 * built it: one input spending `prePeginTxHash:htlcVout` with an empty scriptSig, and a three-item
 * witness whose leaf and control block commit to that HTLC output and whose signature verifies for the
 * depositor's key over that leaf.
 */
export function assertRegisteredPeginWitness(pegin: RegisteredPegin): void {
  initEccLib(ecc);
  const prePeginTxid = stripHex(pegin.prePeginTxHash).toLowerCase();
  const prePegin = Transaction.fromHex(stripHex(pegin.fundedPrePeginTxHex));
  if (prePegin.getId() !== prePeginTxid)
    throw new Error(
      `The funded Pre-PegIn has txid ${prePegin.getId()}, but the registry records ${prePeginTxid}.`,
    );
  const htlc = prePegin.outs[pegin.htlcVout];
  if (!htlc)
    throw new Error(
      `The Pre-PegIn ${prePeginTxid} has no output ${pegin.htlcVout} for the vault's HTLC.`,
    );

  const pegIn = Transaction.fromHex(stripHex(pegin.depositorSignedPeginTx));
  if (pegIn.ins.length !== 1)
    throw new Error(
      `The registered PegIn has ${pegIn.ins.length} inputs; it must spend only the HTLC.`,
    );
  const [input] = pegIn.ins;
  const spent = `${Buffer.from(input.hash).reverse().toString("hex")}:${input.index}`;
  if (spent !== `${prePeginTxid}:${pegin.htlcVout}`)
    throw new Error(
      `The registered PegIn spends ${spent}, not the HTLC ${prePeginTxid}:${pegin.htlcVout}.`,
    );
  if (input.script.length !== 0)
    throw new Error(
      `The registered PegIn's input carries a ${input.script.length}-byte scriptSig; it must be empty.`,
    );
  if (input.witness.length !== SCRIPT_PATH_WITNESS_ITEMS)
    throw new Error(
      `The registered PegIn's witness has ${input.witness.length} items; the depositor's script-path spend has ${SCRIPT_PATH_WITNESS_ITEMS} (signature, leaf script, control block).`,
    );

  const [signature, leafScript, controlBlock] = input.witness.map((item) =>
    Buffer.from(item),
  );
  const leafVersion = controlBlock[0] & LEAF_VERSION_MASK;
  if (leafVersion !== TAPSCRIPT_LEAF_VERSION)
    throw new Error(
      `The registered PegIn's control block names leaf version 0x${leafVersion.toString(16)}, not 0x${TAPSCRIPT_LEAF_VERSION.toString(16)}.`,
    );
  let committedOutput: Buffer | undefined;
  try {
    committedOutput = payments.p2tr({
      witness: [signature, leafScript, controlBlock],
    }).output;
  } catch (error) {
    throw new Error(
      `The registered PegIn's leaf script and control block do not form a Taproot script path: ${error}`,
    );
  }
  if (!committedOutput || !committedOutput.equals(htlc.script))
    throw new Error(
      "The registered PegIn's leaf script and control block do not commit to the HTLC output it spends.",
    );

  if (signature.length !== SCHNORR_SIGNATURE_BYTES)
    throw new Error(
      `The registered PegIn's signature is ${signature.length} bytes; the depositor's is ${SCHNORR_SIGNATURE_BYTES} (implicit SIGHASH_DEFAULT).`,
    );
  const depositorKey = Buffer.from(stripHex(pegin.depositorBtcPubKey), "hex");
  if (depositorKey.length !== X_ONLY_PUBKEY_BYTES)
    throw new Error(
      `The registered depositor key is ${depositorKey.length} bytes, not a ${X_ONLY_PUBKEY_BYTES}-byte x-only key.`,
    );
  const sighash = pegIn.hashForWitnessV1(
    0,
    [htlc.script],
    [htlc.value],
    Transaction.SIGHASH_DEFAULT,
    tapLeafHash(leafVersion, leafScript),
  );
  if (!ecc.verifySchnorr(sighash, depositorKey, signature))
    throw new Error(
      "The registered PegIn's signature does not verify for the depositor's key over the leaf it spends.",
    );
}
