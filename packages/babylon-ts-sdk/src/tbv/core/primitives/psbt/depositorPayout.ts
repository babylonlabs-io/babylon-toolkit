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
  inputTxidHex,
  stripHexPrefix,
} from "../utils/bitcoin";
import {
  ASSERT_PAYOUT_OUTPUT_INDEX,
  DEPOSITOR_PAYOUT_INPUT_COUNT,
  PEGIN_VAULT_OUTPUT_INDEX,
} from "./constants";

/**
 * Parameters for building a depositor Payout PSBT
 */
export interface DepositorPayoutParams {
  /** Payout transaction hex (unsigned) */
  payoutTxHex: string;
  /** Authoritative PegIn transaction hex — input 0 must spend PegIn:0 */
  peginTxHex: string;
  /** Authoritative Assert transaction hex — input 1 must spend Assert:0 */
  assertTxHex: string;
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
 * Both inputs must be present in the PSBT because Taproot SIGHASH_DEFAULT
 * commits to all input prevouts. Prevout script_pubkey/value are derived
 * from the authoritative parent transactions, not trusted from external input.
 *
 * @param params - Depositor payout parameters
 * @returns Unsigned PSBT hex ready for signing
 *
 * @throws If the payout transaction does not have exactly 2 inputs
 * @throws If input 0 does not reference peginTxHex at output index 0
 * @throws If input 1 does not reference assertTxHex at output index 0
 */
export async function buildDepositorPayoutPsbt(
  params: DepositorPayoutParams,
): Promise<string> {
  const payoutTx = Transaction.fromHex(stripHexPrefix(params.payoutTxHex));
  const peginTx = Transaction.fromHex(stripHexPrefix(params.peginTxHex));
  const assertTx = Transaction.fromHex(stripHexPrefix(params.assertTxHex));

  if (payoutTx.ins.length !== DEPOSITOR_PAYOUT_INPUT_COUNT) {
    throw new Error(
      `Depositor Payout transaction must have exactly ${DEPOSITOR_PAYOUT_INPUT_COUNT} inputs, got ${payoutTx.ins.length}`,
    );
  }

  const input0 = payoutTx.ins[0];
  const input1 = payoutTx.ins[1];

  const input0Txid = inputTxidHex(input0);
  const peginTxid = peginTx.getId();
  if (input0Txid !== peginTxid || input0.index !== PEGIN_VAULT_OUTPUT_INDEX) {
    throw new Error(
      `Depositor Payout input 0 must spend PegIn:${PEGIN_VAULT_OUTPUT_INDEX}. ` +
        `Expected ${peginTxid}:${PEGIN_VAULT_OUTPUT_INDEX}, got ${input0Txid}:${input0.index}`,
    );
  }

  const input1Txid = inputTxidHex(input1);
  const assertTxid = assertTx.getId();
  if (input1Txid !== assertTxid || input1.index !== ASSERT_PAYOUT_OUTPUT_INDEX) {
    throw new Error(
      `Depositor Payout input 1 must spend Assert:${ASSERT_PAYOUT_OUTPUT_INDEX}. ` +
        `Expected ${assertTxid}:${ASSERT_PAYOUT_OUTPUT_INDEX}, got ${input1Txid}:${input1.index}`,
    );
  }

  const peginPrevOut = peginTx.outs[input0.index];
  const assertPrevOut = assertTx.outs[input1.index];

  const { payoutScript, payoutControlBlock } = await getPeginPayoutScriptInfo(
    params.connectorParams,
  );
  const scriptBytes = hexToUint8Array(payoutScript);
  const controlBlock = hexToUint8Array(payoutControlBlock);

  const psbt = new Psbt();
  psbt.setVersion(payoutTx.version);
  psbt.setLocktime(payoutTx.locktime);

  psbt.addInput({
    hash: input0.hash,
    index: input0.index,
    sequence: input0.sequence,
    witnessUtxo: {
      script: peginPrevOut.script,
      value: peginPrevOut.value,
    },
    tapLeafScript: [
      {
        leafVersion: TAPSCRIPT_LEAF_VERSION,
        script: Buffer.from(scriptBytes),
        controlBlock: Buffer.from(controlBlock),
      },
    ],
    tapInternalKey: Buffer.from(tapInternalPubkey),
  });

  psbt.addInput({
    hash: input1.hash,
    index: input1.index,
    sequence: input1.sequence,
    witnessUtxo: {
      script: assertPrevOut.script,
      value: assertPrevOut.value,
    },
  });

  for (const output of payoutTx.outs) {
    psbt.addOutput({
      script: output.script,
      value: output.value,
    });
  }

  return psbt.toHex();
}
