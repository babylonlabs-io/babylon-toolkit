/**
 * NoPayout PSBT Builder
 *
 * Builds unsigned PSBTs for the depositor's NoPayout transaction
 * (depositor-as-claimer path, per challenger). The depositor signs input 0
 * using the NoPayout taproot script from WasmAssertPayoutNoPayoutConnector.
 *
 * @module primitives/psbt/noPayout
 * @see btc-vault crates/vault/docs/btc-transactions-spec.md — Assert output 0 NoPayout connector
 */

import {
  type AssertPayoutNoPayoutConnectorParams,
  getAssertNoPayoutScriptInfo,
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
import { ASSERT_NOPAYOUT_OUTPUT_INDEX } from "./constants";

/**
 * Prevout data for inputs the depositor does not sign (e.g. VP-supplied fee inputs).
 * Used for SIGHASH_DEFAULT computation only — never for the signed input.
 */
export interface AdditionalPrevout {
  script_pubkey: string;
  value: number;
}

/**
 * Parameters for building a NoPayout PSBT
 */
export interface NoPayoutParams {
  /** NoPayout transaction hex (unsigned) */
  noPayoutTxHex: string;
  /** Authoritative Assert transaction hex — input 0 must spend Assert:0 */
  assertTxHex: string;
  /** Challenger's x-only public key (hex encoded) */
  challengerPubkey: string;
  /** Parameters for the Assert Payout/NoPayout connector */
  connectorParams: AssertPayoutNoPayoutConnectorParams;
  /**
   * Prevouts for inputs at index >= 1 (not signed by the depositor).
   * Required when the NoPayout tx has fee/auxiliary inputs beyond input 0.
   */
  additionalPrevouts?: AdditionalPrevout[];
}

/**
 * Build unsigned NoPayout PSBT.
 *
 * Input 0 spends Assert:0 (the AssertPayoutNoPayout connector) and is signed
 * by the depositor using the NoPayout taproot script path. Its prevout is
 * derived from the authoritative Assert transaction, never trusted from
 * external input.
 *
 * @param params - NoPayout parameters
 * @returns Unsigned PSBT hex ready for signing
 *
 * @throws If input 0 does not reference assertTxHex at output index 0
 * @throws If the NoPayout tx has additional inputs but no matching prevouts
 */
export async function buildNoPayoutPsbt(
  params: NoPayoutParams,
): Promise<string> {
  const noPayoutTx = Transaction.fromHex(stripHexPrefix(params.noPayoutTxHex));
  const assertTx = Transaction.fromHex(stripHexPrefix(params.assertTxHex));

  if (noPayoutTx.ins.length === 0) {
    throw new Error("NoPayout transaction has no inputs");
  }

  const input0 = noPayoutTx.ins[0];
  const input0Txid = inputTxidHex(input0);
  const assertTxid = assertTx.getId();

  if (input0Txid !== assertTxid || input0.index !== ASSERT_NOPAYOUT_OUTPUT_INDEX) {
    throw new Error(
      `NoPayout input 0 must spend Assert:${ASSERT_NOPAYOUT_OUTPUT_INDEX}. ` +
        `Expected ${assertTxid}:${ASSERT_NOPAYOUT_OUTPUT_INDEX}, got ${input0Txid}:${input0.index}`,
    );
  }

  const assertPrevOut = assertTx.outs[input0.index];

  const additionalCount = noPayoutTx.ins.length - 1;
  const additionalPrevouts = params.additionalPrevouts ?? [];
  if (additionalPrevouts.length !== additionalCount) {
    throw new Error(
      `NoPayout has ${additionalCount} additional input(s) but ${additionalPrevouts.length} additionalPrevouts were supplied`,
    );
  }

  const { noPayoutScript, noPayoutControlBlock } =
    await getAssertNoPayoutScriptInfo(
      params.connectorParams,
      params.challengerPubkey,
    );
  const scriptBytes = hexToUint8Array(noPayoutScript);
  const controlBlockBytes = hexToUint8Array(noPayoutControlBlock);

  const psbt = new Psbt();
  psbt.setVersion(noPayoutTx.version);
  psbt.setLocktime(noPayoutTx.locktime);

  psbt.addInput({
    hash: input0.hash,
    index: input0.index,
    sequence: input0.sequence,
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

  for (let i = 1; i < noPayoutTx.ins.length; i++) {
    const input = noPayoutTx.ins[i];
    const prevout = additionalPrevouts[i - 1];
    psbt.addInput({
      hash: input.hash,
      index: input.index,
      sequence: input.sequence,
      witnessUtxo: {
        script: Buffer.from(hexToUint8Array(stripHexPrefix(prevout.script_pubkey))),
        value: prevout.value,
      },
    });
  }

  for (const output of noPayoutTx.outs) {
    psbt.addOutput({
      script: output.script,
      value: output.value,
    });
  }

  return psbt.toHex();
}
