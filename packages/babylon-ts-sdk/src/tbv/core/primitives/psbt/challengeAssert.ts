/**
 * ChallengeAssert PSBT Builder
 *
 * Builds an unsigned PSBT for a ChallengeAssert transaction
 * (depositor-as-claimer path, per challenger). The ChallengeAssert tx has
 * NUM_UTXOS_FOR_CHALLENGE_ASSERT (3) inputs, each spending a different Assert
 * output segment. The depositor signs ALL inputs, each with its own taproot
 * script derived from the per-segment connector params.
 *
 * @module primitives/psbt/challengeAssert
 * @see btc-vault crates/vault/docs/btc-transactions-spec.md — ChallengeAssert connector (NUM_UTXOS_FOR_CHALLENGE_ASSERT=3)
 */

import {
  type ChallengeAssertConnectorParams,
  getChallengeAssertScriptInfo,
  tapInternalPubkey,
} from "@babylonlabs-io/babylon-tbv-rust-wasm";
import { Buffer } from "buffer";
import { Psbt, Transaction } from "bitcoinjs-lib";

import {
  TAPSCRIPT_LEAF_VERSION,
  hexToUint8Array,
  inputTxidHex,
  stripHexPrefix,
} from "../utils/bitcoin";

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
 * The ChallengeAssert transaction has 3 inputs (one per Assert output segment).
 * Each input has its own taproot script derived from its connector params.
 * The depositor signs all inputs. Every prevout is derived from the
 * authoritative Assert transaction, never trusted from external input.
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
