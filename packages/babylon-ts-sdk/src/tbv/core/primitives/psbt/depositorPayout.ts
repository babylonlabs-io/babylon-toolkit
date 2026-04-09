/**
 * Depositor Payout PSBT Builder
 *
 * Builds unsigned PSBTs for the depositor's own Payout transaction
 * (depositor-as-claimer path). The depositor signs input 0 using the
 * payout taproot script from WasmPeginPayoutConnector (PegIn vault UTXO).
 *
 * Input 0 spends PegIn:0 (the vault UTXO) — the same connector used for
 * VP/VK payout signing. The VP verifies this signature using the
 * PeginPayoutConnector's payout script.
 *
 * @module primitives/psbt/depositorPayout
 * @see btc-vault crates/vault/src/sign.rs — verify_depositor_signature / get_payout_tap_leaf_hash
 */

import {
  type PayoutConnectorParams,
  getPeginPayoutScriptInfo,
  tapInternalPubkey,
} from "@babylonlabs-io/babylon-tbv-rust-wasm";
import { Buffer } from "buffer";
import { Psbt, Transaction } from "bitcoinjs-lib";

import {
  TAPSCRIPT_LEAF_VERSION,
  hexToUint8Array,
  stripHexPrefix,
} from "../utils/bitcoin";

/**
 * Parameters for building a depositor Payout PSBT
 */
export interface DepositorPayoutParams {
  /** Payout transaction hex (unsigned) from VP */
  payoutTxHex: string;
  /** Prevouts for all inputs [{script_pubkey, value}] from VP */
  prevouts: Array<{ script_pubkey: string; value: number }>;
  /** Parameters for the PeginPayout connector (depositor, VP, VKs, UCs, timelock) */
  connectorParams: PayoutConnectorParams;
}

/**
 * Build unsigned depositor Payout PSBT.
 *
 * The depositor's payout transaction has 2 inputs:
 * - Input 0: PegIn:0 (vault UTXO) — depositor signs using PeginPayoutConnector payout script
 * - Input 1: Assert:0 — NOT signed by depositor
 *
 * @param params - Depositor payout parameters
 * @returns Unsigned PSBT hex ready for signing
 */
export async function buildDepositorPayoutPsbt(
  params: DepositorPayoutParams,
): Promise<string> {
  const payoutTxHex = stripHexPrefix(params.payoutTxHex);
  const payoutTx = Transaction.fromHex(payoutTxHex);

  // Get payout script and control block from WASM (PeginPayoutConnector)
  const { payoutScript, payoutControlBlock } = await getPeginPayoutScriptInfo(
    params.connectorParams,
  );
  const scriptBytes = hexToUint8Array(payoutScript);
  const controlBlock = hexToUint8Array(payoutControlBlock);

  const psbt = new Psbt();
  psbt.setVersion(payoutTx.version);
  psbt.setLocktime(payoutTx.locktime);

  // Add all inputs - depositor signs input 0 only
  for (let i = 0; i < payoutTx.ins.length; i++) {
    const input = payoutTx.ins[i];
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
          leafVersion: TAPSCRIPT_LEAF_VERSION,
          script: Buffer.from(scriptBytes),
          controlBlock: Buffer.from(controlBlock),
        },
      ];
      inputData.tapInternalKey = Buffer.from(tapInternalPubkey);
    }

    psbt.addInput(inputData);
  }

  // Add outputs
  for (const output of payoutTx.outs) {
    psbt.addOutput({
      script: output.script,
      value: output.value,
    });
  }

  return psbt.toHex();
}

