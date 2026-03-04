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
  hexToUint8Array,
  stripHexPrefix,
} from "../utils/bitcoin";

/**
 * Parameters for building a NoPayout PSBT
 */
export interface NoPayoutParams {
  /** NoPayout transaction hex (unsigned) from VP */
  noPayoutTxHex: string;
  /** Challenger's x-only public key (hex encoded) */
  challengerPubkey: string;
  /** Prevouts for all inputs [{script_pubkey, value}] from VP */
  prevouts: Array<{ script_pubkey: string; value: number }>;
  /** Parameters for the Assert Payout/NoPayout connector */
  connectorParams: AssertPayoutNoPayoutConnectorParams;
}

/**
 * Build unsigned NoPayout PSBT.
 *
 * The NoPayout transaction is specific to each challenger.
 * Input 0 is the one the depositor signs using the NoPayout taproot script path.
 *
 * @param params - NoPayout parameters
 * @returns Unsigned PSBT hex ready for signing
 */
export async function buildNoPayoutPsbt(
  params: NoPayoutParams,
): Promise<string> {
  const noPayoutTxHex = stripHexPrefix(params.noPayoutTxHex);
  const noPayoutTx = Transaction.fromHex(noPayoutTxHex);

  // Get NoPayout script and control block for this challenger
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

  // Add all inputs - depositor signs input 0 only
  for (let i = 0; i < noPayoutTx.ins.length; i++) {
    const input = noPayoutTx.ins[i];
    const prevout = params.prevouts[i];

    if (!prevout) {
      throw new Error(`Missing prevout data for input ${i}`);
    }

    const inputData: Parameters<typeof psbt.addInput>[0] = {
      hash: input.hash,
      index: input.index,
      sequence: input.sequence,
      witnessUtxo: {
        script: Buffer.from(hexToUint8Array(stripHexPrefix(prevout.script_pubkey))),
        value: prevout.value,
      },
    };

    // Input 0: depositor signs using taproot script path
    if (i === 0) {
      inputData.tapLeafScript = [
        {
          leafVersion: 0xc0,
          script: Buffer.from(scriptBytes),
          controlBlock: Buffer.from(controlBlockBytes),
        },
      ];
      inputData.tapInternalKey = Buffer.from(tapInternalPubkey);
    }

    psbt.addInput(inputData);
  }

  // Add outputs
  for (const output of noPayoutTx.outs) {
    psbt.addOutput({
      script: output.script,
      value: output.value,
    });
  }

  return psbt.toHex();
}
