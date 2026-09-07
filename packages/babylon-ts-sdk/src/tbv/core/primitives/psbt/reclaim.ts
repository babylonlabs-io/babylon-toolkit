/**
 * Reclaim PSBT Builder Primitive
 *
 * Builds an unsigned PSBT that sweeps the depositor-claim reserve — PegIn
 * vout 1 — back to the depositor's own BIP-86 address.
 *
 * The reserve funds the depositor's `claim_tx`, their recourse if the vault
 * provider fails during peg-out. When the vault provider claims instead and
 * the depositor withdraws normally, nothing ever spends it. This primitive is
 * the only thing in the repository that can.
 *
 * Spend path: the single `<depositor> OP_CHECKSIG` tapleaf (see
 * ./depositorClaim). No timelock, no counterparty signature — the depositor's
 * Schnorr signature alone. That is also why the *caller* must gate: this
 * builder will happily sweep a reserve whose vault is still live, which would
 * permanently void the depositor's pre-signed recourse graph. Eligibility is
 * enforced upstream, in the service.
 *
 * @module primitives/psbt/reclaim
 */

import { Buffer } from "buffer";
import { Psbt, Transaction } from "bitcoinjs-lib";

import { DUST_THRESHOLD } from "../../utils/fee/constants";
import {
  TAPSCRIPT_LEAF_VERSION,
  deriveBip86ScriptPubKeyHex,
  hexToUint8Array,
  stripHexPrefix,
  uint8ArrayToHex,
} from "../utils/bitcoin";
import {
  PEGIN_DEPOSITOR_CLAIM_VOUT,
  deriveDepositorClaimDescriptor,
} from "./depositorClaim";

/**
 * nVersion for the reclaim transaction. Plain v2, not TRUC: the reserve is only
 * offered once its PegIn is deeply confirmed, so the v2/v3 PegIn's nVersion-3
 * topology limits no longer constrain its children.
 */
const RECLAIM_TX_VERSION = 2;

/**
 * nSequence for every reclaim input: RBF-enabled, no relative timelock. The
 * claim leaf carries no CSV, so this is a fee-bumping signal only.
 */
const RECLAIM_INPUT_SEQUENCE = 0xfffffffd;

/**
 * Weight units of the reclaim transaction's skeleton — everything except the
 * inputs. Non-witness `version(4) + inCount(1) + outCount(1) + locktime(4) +
 * output(8 + 1 + 34)` = 53 B × 4, plus the 2 WU SegWit marker and flag.
 */
const RECLAIM_SKELETON_WEIGHT_UNITS = 214;

/**
 * Weight units each script-path input adds. Non-witness `outpoint(36) +
 * scriptSigLen(1) + sequence(4)` = 41 B × 4 = 164, plus a witness of
 * `stackCount(1) + sig(1 + 64) + leafScript(1 + 34) + controlBlock(1 + 33)` =
 * 135 WU.
 *
 * Exact rather than conservative: every element is fixed-length here — a
 * 64-byte BIP-340 signature under SIGHASH_DEFAULT, the 34-byte leaf, and a
 * 33-byte control block with no merkle path.
 */
const RECLAIM_INPUT_WEIGHT_UNITS = 299;

/** Weight units per virtual byte. */
const WEIGHT_UNITS_PER_VBYTE = 4;

/**
 * Virtual size of an N-in/1-out reclaim transaction.
 *
 * `REFUND_VSIZE = 160` does not generalise to N inputs, and
 * `computePeginBaseFeeSats` is wrong for this shape entirely — its
 * `P2TR_INPUT_SIZE = 58` is a *key-path* input and under-fees a script-path
 * spend by roughly a quarter.
 *
 * N=1 → 129 vB; each additional input adds 75 vB.
 */
export function reclaimVsize(numInputs: number): number {
  if (!Number.isInteger(numInputs) || numInputs < 1) {
    throw new Error(
      `Reclaim input count must be a positive integer, got ${numInputs}.`,
    );
  }
  return Math.ceil(
    (RECLAIM_SKELETON_WEIGHT_UNITS +
      RECLAIM_INPUT_WEIGHT_UNITS * numInputs) /
      WEIGHT_UNITS_PER_VBYTE,
  );
}

/** Absolute fee in satoshis for an N-in/1-out reclaim at a given rate. */
export function estimateReclaimFeeSats(
  feeRateSatsVb: number,
  numInputs: number,
): bigint {
  if (!Number.isFinite(feeRateSatsVb) || feeRateSatsVb <= 0) {
    throw new Error(
      `Reclaim fee rate must be a positive number, got ${feeRateSatsVb}.`,
    );
  }
  return BigInt(Math.ceil(feeRateSatsVb * reclaimVsize(numInputs)));
}

/** One depositor-claim reserve to sweep, with the material to bind it. */
export interface ReclaimReserve {
  /**
   * The contract's own copy of the depositor-signed PegIn transaction
   * (`VaultProtocolInfo.depositorSignedPeginTx`). Authoritative: its SegWit
   * txid equals the broadcast PegIn's, and its `outs[1]` carries the reserve's
   * script and value at no extra RPC cost.
   */
  depositorSignedPeginTxHex: string;
  /** Independent chain observation of `peginTxid:1` (esplora UTXO lookup). */
  observed: {
    /**
     * The outpoint the caller actually issued its chain lookup against, so the
     * observation below can be tied to the input this builder adds.
     *
     * Without it the script and value binds prove only that *some* UTXO has
     * this shape — the claim script is a pure function of the depositor key and
     * so is byte-identical across every vault they own, and the value is a pure
     * function of protocol parameters. Neither distinguishes one of the
     * depositor's vaults from another.
     *
     * Txid in display order, 64 hex chars, with or without `0x` prefix.
     */
    txid: string;
    /** Vout the lookup was issued against. Must be the claim vout. */
    vout: number;
    /** scriptPubKey hex, with or without `0x` prefix. */
    scriptPubKey: string;
    /** Output value in satoshis. */
    value: bigint;
  };
  /**
   * The reserve value recomputed from this vault's protocol parameters via
   * `computeMinClaimValue`. Bound so a doctored PegIn that agrees with itself
   * and with a compromised indexer still fails.
   */
  expectedValue: bigint;
}

export interface BuildReclaimPsbtParams {
  /**
   * The **connected wallet's live** x-only pubkey, 64-char hex. Never the
   * indexer's `depositorBtcPubkey`: re-deriving from the live key is what
   * proves the wallet about to sign is the wallet that can spend, and rejects
   * the wrong-wallet case with an error instead of an unspendable broadcast.
   */
  depositorPubkey: string;
  /**
   * Reserves to sweep. An array so batching several vaults into one
   * transaction is a later change rather than a rewrite; today the app passes
   * exactly one.
   */
  inputs: ReclaimReserve[];
  /** Absolute fee in satoshis. The caller sizes it; see `reclaimVsize`. */
  feeSats: bigint;
}

export interface BuildReclaimPsbtResult {
  /** PSBT hex ready for depositor signing. */
  psbtHex: string;
  /** Value of the single output — what the depositor actually receives. */
  outputValue: bigint;
  /** Sum of the swept reserves, before fee. */
  totalInputValue: bigint;
}

/**
 * Build the N-in/1-out reclaim PSBT.
 *
 * Every input is bound three ways before it reaches the PSBT: the contract's
 * PegIn bytes, the chain observation, and a JS re-derivation from the live
 * wallet key must agree on both script and value. Any disagreement throws.
 * The observation must also name the outpoint it was taken from, since script
 * and value alone repeat across all of a depositor's vaults.
 *
 * Binding the input to the *vault* that was asked for is a further step, and
 * it belongs to the service: it needs the vault id derivation, which is async.
 * See `services/reclaim/buildAndBroadcastReclaim`.
 *
 * @throws If `inputs` is empty, the fee is non-positive, any input fails its
 *   outpoint, script or value bind, or the resulting output would be at or
 *   below dust.
 */
export function buildReclaimPsbt(
  params: BuildReclaimPsbtParams,
): BuildReclaimPsbtResult {
  const { depositorPubkey, inputs, feeSats } = params;

  if (inputs.length === 0) {
    throw new Error("Reclaim requires at least one input; got none.");
  }
  if (feeSats <= 0n) {
    throw new Error(
      `Reclaim fee must be positive, got ${feeSats} sat. Refusing to build a ` +
        `transaction that would not relay.`,
    );
  }

  // One derivation, reused for every input's bind and for the destination.
  const descriptor = deriveDepositorClaimDescriptor(depositorPubkey);
  const expectedScriptPubKey = uint8ArrayToHex(
    new Uint8Array(descriptor.scriptPubKey),
  ).toLowerCase();

  const psbt = new Psbt();
  psbt.setVersion(RECLAIM_TX_VERSION);
  psbt.setLocktime(0);

  let totalInputValue = 0n;
  const seenOutpoints = new Set<string>();

  inputs.forEach((input, i) => {
    const peginTx = Transaction.fromHex(
      stripHexPrefix(input.depositorSignedPeginTxHex),
    );
    const peginTxid = peginTx.getId();

    const claimOut = peginTx.outs[PEGIN_DEPOSITOR_CLAIM_VOUT];
    if (!claimOut) {
      throw new Error(
        `PegIn ${peginTxid} has no output at vout ` +
          `${PEGIN_DEPOSITOR_CLAIM_VOUT} (tx has ${peginTx.outs.length}); ` +
          `there is no depositor-claim reserve to reclaim.`,
      );
    }

    // Bind 0: the observation is of *this* outpoint. Everything below compares
    // a script and a value, both of which repeat across every vault this
    // depositor owns under the same protocol parameters — so without this the
    // remaining binds cannot tell one of their vaults from another, and a
    // caller that resolved the wrong vault would sweep it with every check
    // passing. The independent source is the PegIn the PSBT is built from; the
    // esplora response cannot serve here because `getUtxoInfo` echoes back the
    // txid and vout it was called with rather than reading them from the body.
    const observedTxid = stripHexPrefix(input.observed.txid).toLowerCase();
    if (observedTxid !== peginTxid) {
      throw new Error(
        `Input ${i}: the observation is of ${observedTxid}, but this input ` +
          `spends PegIn ${peginTxid}. Reclaim refused — the reserve that was ` +
          `looked up is not the one being swept.`,
      );
    }
    if (input.observed.vout !== PEGIN_DEPOSITOR_CLAIM_VOUT) {
      throw new Error(
        `Input ${i}: the observation is of vout ${input.observed.vout}, but ` +
          `the depositor-claim reserve is at vout ` +
          `${PEGIN_DEPOSITOR_CLAIM_VOUT}. Reclaim refused.`,
      );
    }

    // Bind 1: the contract's PegIn bytes against the JS re-derivation from the
    // live wallet key. This is the assertion that proves the connected wallet
    // can actually spend the output we are about to sign for.
    const contractScriptPubKey = uint8ArrayToHex(
      new Uint8Array(claimOut.script),
    ).toLowerCase();
    if (contractScriptPubKey !== expectedScriptPubKey) {
      throw new Error(
        `Input ${i}: PegIn ${peginTxid} vout ${PEGIN_DEPOSITOR_CLAIM_VOUT} pays ` +
          `${contractScriptPubKey}, but the connected wallet's depositor-claim ` +
          `script is ${expectedScriptPubKey}. Reclaim refused — this reserve ` +
          `belongs to a different wallet.`,
      );
    }

    // Bind 2: the independent chain observation must agree with both.
    const observedScriptPubKey = stripHexPrefix(
      input.observed.scriptPubKey,
    ).toLowerCase();
    if (observedScriptPubKey !== expectedScriptPubKey) {
      throw new Error(
        `Input ${i}: the observed UTXO ${peginTxid}:${PEGIN_DEPOSITOR_CLAIM_VOUT} ` +
          `pays ${observedScriptPubKey}, expected ${expectedScriptPubKey}. ` +
          `Reclaim refused — chain state disagrees with the contract's PegIn.`,
      );
    }

    // Value bind, same three ways.
    const contractValue = BigInt(claimOut.value);
    if (contractValue !== input.observed.value) {
      throw new Error(
        `Input ${i}: PegIn ${peginTxid} vout ${PEGIN_DEPOSITOR_CLAIM_VOUT} ` +
          `carries ${contractValue} sat, but the observed UTXO carries ` +
          `${input.observed.value} sat. Reclaim refused.`,
      );
    }
    if (contractValue !== input.expectedValue) {
      throw new Error(
        `Input ${i}: PegIn ${peginTxid} vout ${PEGIN_DEPOSITOR_CLAIM_VOUT} ` +
          `carries ${contractValue} sat, but this vault's parameters compute a ` +
          `depositor-claim value of ${input.expectedValue} sat. Reclaim refused.`,
      );
    }

    // A batch that names the same vault twice would otherwise double-count the
    // swept total and then fail deep inside bitcoinjs. Reject it here, where
    // the message can say which input is the duplicate.
    const outpoint = `${peginTxid}:${PEGIN_DEPOSITOR_CLAIM_VOUT}`;
    if (seenOutpoints.has(outpoint)) {
      throw new Error(
        `Input ${i} repeats outpoint ${outpoint}, which is already being ` +
          `swept by an earlier input. Reclaim refused.`,
      );
    }
    seenOutpoints.add(outpoint);

    totalInputValue += contractValue;

    psbt.addInput({
      hash: peginTxid,
      index: PEGIN_DEPOSITOR_CLAIM_VOUT,
      sequence: RECLAIM_INPUT_SEQUENCE,
      witnessUtxo: { script: claimOut.script, value: claimOut.value },
      tapLeafScript: [
        {
          leafVersion: TAPSCRIPT_LEAF_VERSION,
          script: descriptor.leafScript,
          controlBlock: descriptor.controlBlock,
        },
      ],
      tapInternalKey: descriptor.internalKey,
    });
  });

  if (feeSats >= totalInputValue) {
    throw new Error(
      `Reclaim fee ${feeSats} sat is not less than the swept total ` +
        `${totalInputValue} sat. Refusing to build a transaction with no output.`,
    );
  }

  const outputValue = totalInputValue - feeSats;
  if (outputValue <= DUST_THRESHOLD) {
    throw new Error(
      `Reclaim output ${outputValue} sat is at or below the dust threshold ` +
        `${DUST_THRESHOLD} sat. The reserve is not at risk — it stays where it ` +
        `is until fee rates fall.`,
    );
  }

  const destination = stripHexPrefix(
    deriveBip86ScriptPubKeyHex(depositorPubkey),
  );
  psbt.addOutput({
    script: Buffer.from(hexToUint8Array(destination)),
    value: Number(outputValue),
  });

  return { psbtHex: psbt.toHex(), outputValue, totalInputValue };
}
