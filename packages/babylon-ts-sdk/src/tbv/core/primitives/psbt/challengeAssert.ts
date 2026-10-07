/**
 * ChallengeAssert PSBT Builder
 *
 * Builds an unsigned PSBT for a ChallengeAssert transaction. ChallengeAssert
 * is split across two single-input transactions — ChallengeAssertX (spends the
 * challenger's ConnectorX Assert output) and ChallengeAssertY (spends
 * ConnectorY). This builder handles one such transaction.
 *
 * The protocol collects no claimer signature on ChallengeAssert — the
 * challenger signs it at broadcast (btc-vault `tx_graph/challenger.rs`). The
 * PSBT builder exists for tooling that reconstructs the graph; it is not on
 * the depositor presign path (`signDepositorGraph` signs Payout + NoPayout
 * only). {@link assertChallengeAssertIsCanonical} is on that path: NoPayout
 * spends output 0 of both ChallengeAsserts, so they are bound before signing.
 *
 * @module primitives/psbt/challengeAssert
 * @see btc-vault crates/vault/docs/btc-transactions-spec.md — ChallengeAssertX / ChallengeAssertY
 */

import {
  type ChallengeAssertConnectorParams,
  getChallengeAssertScriptInfo,
  tapInternalPubkey,
} from "../../wasm";
import { Buffer } from "buffer";
import { Psbt, Transaction } from "bitcoinjs-lib";

import {
  TAPSCRIPT_LEAF_VERSION,
  deriveBip86ScriptPubKeyHex,
  hexToUint8Array,
  inputTxidHex,
  stripHexPrefix,
} from "../utils/bitcoin";
import {
  ASSERT_FIRST_CHALLENGER_CONNECTOR_VOUT,
  CHALLENGE_ASSERT_ANCHOR_VALUE_SATS,
  CHALLENGE_ASSERT_INPUT_SEQUENCE,
  CHALLENGE_ASSERT_TX_LOCKTIME,
  CHALLENGE_ASSERT_TX_VERSION,
} from "./constants";

/**
 * Parameters for building a ChallengeAssert PSBT
 */
export interface ChallengeAssertParams {
  /** ChallengeAssert transaction hex (unsigned) */
  challengeAssertTxHex: string;
  /** Authoritative Assert transaction hex — every input must spend an Assert output */
  assertTxHex: string;
  /** Per-input connector params (one per input/segment, determines the taproot script) */
  connectorParamsPerInput: ChallengeAssertConnectorParams[];
}

/**
 * Build unsigned ChallengeAssert PSBT.
 *
 * Each input has its own taproot script derived from its connector params; the
 * number of connector params must match the transaction's input count.
 * Every prevout is derived from the authoritative
 * Assert transaction, never trusted from external input.
 *
 * @param params - ChallengeAssert parameters
 * @returns Unsigned PSBT hex ready for signing
 *
 * @throws If the number of connector params does not match the number of inputs
 * @throws If any input does not reference assertTxHex
 * @throws If any referenced Assert output is missing
 * @throws If two inputs reference the same Assert output index
 */
export async function buildChallengeAssertPsbt(
  params: ChallengeAssertParams,
): Promise<string> {
  const challengeAssertTx = Transaction.fromHex(
    stripHexPrefix(params.challengeAssertTxHex),
  );
  const assertTx = Transaction.fromHex(stripHexPrefix(params.assertTxHex));
  const assertTxid = assertTx.getId();

  if (params.connectorParamsPerInput.length !== challengeAssertTx.ins.length) {
    throw new Error(
      `Expected ${challengeAssertTx.ins.length} connector params, got ${params.connectorParamsPerInput.length}`,
    );
  }

  const seenAssertOutputs = new Set<number>();
  for (let i = 0; i < challengeAssertTx.ins.length; i++) {
    const input = challengeAssertTx.ins[i];
    const inputTxid = inputTxidHex(input);
    if (inputTxid !== assertTxid) {
      throw new Error(
        `ChallengeAssert input ${i} must spend an Assert output. ` +
          `Expected txid ${assertTxid}, got ${inputTxid}`,
      );
    }
    if (!assertTx.outs[input.index]) {
      throw new Error(
        `Assert output ${input.index} not found for ChallengeAssert input ${i} (txid: ${assertTxid})`,
      );
    }
    if (seenAssertOutputs.has(input.index)) {
      throw new Error(
        `ChallengeAssert input ${i} duplicates Assert output index ${input.index}`,
      );
    }
    seenAssertOutputs.add(input.index);
  }

  const scriptInfos = await Promise.all(
    params.connectorParamsPerInput.map((cp) => getChallengeAssertScriptInfo(cp)),
  );

  const psbt = new Psbt();
  psbt.setVersion(challengeAssertTx.version);
  psbt.setLocktime(challengeAssertTx.locktime);

  for (let i = 0; i < challengeAssertTx.ins.length; i++) {
    const input = challengeAssertTx.ins[i];
    const assertPrevOut = assertTx.outs[input.index];

    const { script, controlBlock } = scriptInfos[i];
    const scriptBytes = hexToUint8Array(script);
    const controlBlockBytes = hexToUint8Array(controlBlock);

    psbt.addInput({
      hash: input.hash,
      index: input.index,
      sequence: input.sequence,
      witnessUtxo: {
        script: assertPrevOut.script,
        value: assertPrevOut.value,
      },
      tapLeafScript: [
        {
          leafVersion: TAPSCRIPT_LEAF_VERSION,
          script: Buffer.from(scriptBytes),
          controlBlock: Buffer.from(controlBlockBytes),
        },
      ],
      tapInternalKey: Buffer.from(tapInternalPubkey),
    });
  }

  for (const output of challengeAssertTx.outs) {
    psbt.addOutput({
      script: output.script,
      value: output.value,
    });
  }

  return psbt.toHex();
}

/** Which of a challenger's two ChallengeAssert transactions. */
export type ChallengeAssertHalf = "X" | "Y";

/**
 * Parameters for {@link assertChallengeAssertIsCanonical}
 */
export interface AssertChallengeAssertIsCanonicalParams {
  /** The ChallengeAssertX or ChallengeAssertY transaction the VP supplied */
  challengeAssertTx: Transaction;
  /** Authoritative Assert transaction, already bound to the depositor's Claim */
  assertTx: Transaction;
  /** Which half `challengeAssertTx` claims to be */
  half: ChallengeAssertHalf;
  /** The challenger's index in the hex-sorted local ∪ universal challenger set */
  challengerIndex: number;
  /** Number of local plus universal challengers (K) */
  challengerCount: number;
  /** The challenger's x-only public key (hex) */
  challengerPubkey: string;
  /** ChallengeAssert output connector scriptPubKey for this challenger (hex) */
  outputConnectorScriptPubKey: string;
}

/**
 * Require a VP-supplied ChallengeAssertX/Y to be exactly the transaction
 * btc-vault builds for this challenger from the authoritative Assert.
 *
 * NoPayout spends output 0 of both ChallengeAsserts, and the depositor's
 * NoPayout signature commits to their txids. The protocol collects no claimer
 * signature on a ChallengeAssert, so that commitment is all that forces a
 * challenger to broadcast the canonical one. A parent that does not spend this
 * Assert, or whose output 0 is not the timelocked connector, would let a
 * colluding challenger spend Assert:0 through NoPayout without the dispute
 * that the claimer can answer with WronglyChallenged.
 *
 * The transaction is fully determined by the Assert, the challenger's sorted
 * index and the connector script, so it is rebuilt here and compared by txid,
 * which covers every non-witness byte.
 *
 * @param params - The supplied transaction and the authoritative inputs
 * @throws If the challenger index is out of range, the Assert lacks the
 *   connector output, or the supplied transaction is not the canonical one
 */
export function assertChallengeAssertIsCanonical(
  params: AssertChallengeAssertIsCanonicalParams,
): void {
  const expectedTxid = buildCanonicalChallengeAssertTx(params).getId();
  const suppliedTxid = params.challengeAssertTx.getId();
  if (suppliedTxid !== expectedTxid) {
    throw new Error(
      `ChallengeAssert${params.half} (challenger ${params.challengerPubkey}) is not the ` +
        `canonical transaction for this Assert: expected txid ${expectedTxid}, got ${suppliedTxid}`,
    );
  }
}

/**
 * Mirror btc-vault `construct_challenge_assert` + `build_challenge_assert_tx`
 * (`crates/vault/src/transactions/challenge_assert.rs:49-96,147-221` @ b534ff9e).
 */
function buildCanonicalChallengeAssertTx(
  params: AssertChallengeAssertIsCanonicalParams,
): Transaction {
  const { assertTx, half, challengerIndex, challengerCount } = params;
  if (
    !Number.isInteger(challengerIndex) ||
    challengerIndex < 0 ||
    challengerIndex >= challengerCount
  ) {
    throw new Error(
      `ChallengeAssert${half} challenger index ${challengerIndex} is outside 0..${challengerCount - 1}`,
    );
  }
  const vout =
    ASSERT_FIRST_CHALLENGER_CONNECTOR_VOUT +
    (half === "Y" ? challengerCount : 0) +
    challengerIndex;
  const connectorOutput = assertTx.outs[vout];
  if (!connectorOutput) {
    throw new Error(
      `Assert has no output ${vout} for the ChallengeAssert${half} of challenger index ${challengerIndex}`,
    );
  }
  const outputConnectorValue =
    connectorOutput.value - CHALLENGE_ASSERT_ANCHOR_VALUE_SATS;
  if (outputConnectorValue < 0) {
    throw new Error(
      `Assert output ${vout} (${connectorOutput.value} sats) cannot fund the ` +
        `${CHALLENGE_ASSERT_ANCHOR_VALUE_SATS}-sat ChallengeAssert${half} anchor`,
    );
  }

  const tx = new Transaction();
  tx.version = CHALLENGE_ASSERT_TX_VERSION;
  tx.locktime = CHALLENGE_ASSERT_TX_LOCKTIME;
  tx.addInput(assertTx.getHash(), vout, CHALLENGE_ASSERT_INPUT_SEQUENCE);
  tx.addOutput(
    Buffer.from(hexToUint8Array(params.outputConnectorScriptPubKey)),
    outputConnectorValue,
  );
  tx.addOutput(
    Buffer.from(
      hexToUint8Array(deriveBip86ScriptPubKeyHex(params.challengerPubkey)),
    ),
    CHALLENGE_ASSERT_ANCHOR_VALUE_SATS,
  );
  return tx;
}
