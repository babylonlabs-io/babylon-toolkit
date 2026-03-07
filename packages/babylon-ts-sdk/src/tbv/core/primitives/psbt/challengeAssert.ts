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
import { Psbt, Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";

import { hexToUint8Array, stripHexPrefix } from "../utils/bitcoin";

/**
 * Parameters for building a ChallengeAssert PSBT
 */
export interface ChallengeAssertParams {
  /** ChallengeAssert transaction hex (unsigned) from VP */
  challengeAssertTxHex: string;
  /** Prevouts for all inputs [{script_pubkey, value}] from VP (flat, one per input) */
  prevouts: Array<{ script_pubkey: string; value: number }>;
  /** Per-input connector params (one per input/segment, determines the taproot script) */
  connectorParamsPerInput: ChallengeAssertConnectorParams[];
}

/**
 * Build unsigned ChallengeAssert PSBT.
 *
 * The ChallengeAssert transaction has 3 inputs (one per Assert output segment).
 * Each input has its own taproot script derived from its connector params.
 * The depositor signs all inputs.
 *
 * @param params - ChallengeAssert parameters
 * @returns Unsigned PSBT hex ready for signing
 */
export async function buildChallengeAssertPsbt(
  params: ChallengeAssertParams,
): Promise<string> {
  const challengeAssertTxHex = stripHexPrefix(params.challengeAssertTxHex);
  const challengeAssertTx = Transaction.fromHex(challengeAssertTxHex);

  if (params.connectorParamsPerInput.length !== challengeAssertTx.ins.length) {
    throw new Error(
      `Expected ${challengeAssertTx.ins.length} connector params, got ${params.connectorParamsPerInput.length}`,
    );
  }

  // Get script and control block for each input from WASM
  const scriptInfos = await Promise.all(
    params.connectorParamsPerInput.map((cp) =>
      getChallengeAssertScriptInfo(cp),
    ),
  );

  const psbt = new Psbt();
  psbt.setVersion(challengeAssertTx.version);
  psbt.setLocktime(challengeAssertTx.locktime);

  // Add all inputs — depositor signs every input
  for (let i = 0; i < challengeAssertTx.ins.length; i++) {
    const input = challengeAssertTx.ins[i];
    const prevout = params.prevouts[i];

    if (!prevout) {
      throw new Error(`Missing prevout data for input ${i}`);
    }

    const { script, controlBlock } = scriptInfos[i];
    const scriptBytes = hexToUint8Array(script);
    const controlBlockBytes = hexToUint8Array(controlBlock);

    psbt.addInput({
      hash: input.hash,
      index: input.index,
      sequence: input.sequence,
      witnessUtxo: {
        script: Buffer.from(
          hexToUint8Array(stripHexPrefix(prevout.script_pubkey)),
        ),
        value: prevout.value,
      },
      tapLeafScript: [
        {
          leafVersion: 0xc0,
          script: Buffer.from(scriptBytes),
          controlBlock: Buffer.from(controlBlockBytes),
        },
      ],
      tapInternalKey: Buffer.from(tapInternalPubkey),
    });
  }

  // Add outputs
  for (const output of challengeAssertTx.outs) {
    psbt.addOutput({
      script: output.script,
      value: output.value,
    });
  }

  return psbt.toHex();
}
