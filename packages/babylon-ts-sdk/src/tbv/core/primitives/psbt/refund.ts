/**
 * Refund PSBT Builder Primitive
 *
 * Builds an unsigned refund PSBT for a depositor to reclaim BTC from
 * a timed-out Pre-PegIn HTLC output via the refund script (leaf 1).
 *
 * The refund script enforces a CSV timelock (timelockRefund blocks) and
 * requires only the depositor's Schnorr signature — no vault provider or
 * keeper involvement.
 *
 * @module primitives/psbt/refund
 */

import {
  getPrePeginHtlcConnectorInfo,
  initWasm,
  tapInternalPubkey,
  WasmPrePeginTx,
} from "@babylonlabs-io/babylon-tbv-rust-wasm";
import { Buffer } from "buffer";
import { Psbt, Transaction } from "bitcoinjs-lib";

import { TAPSCRIPT_LEAF_VERSION, hexToUint8Array, uint8ArrayToHex } from "../utils/bitcoin";
import type { PrePeginParams } from "./pegin";

/**
 * Parameters for building a refund PSBT
 */
export interface BuildRefundPsbtParams {
  /** Same PrePeginParams used when the original Pre-PegIn tx was created */
  prePeginParams: PrePeginParams;
  /** Funded Pre-PegIn transaction hex (the tx whose HTLC output is being refunded) */
  fundedPrePeginTxHex: string;
  /** Index of the HTLC output in the Pre-PegIn transaction */
  htlcVout: number;
  /** Transaction fee in satoshis for the refund transaction */
  refundFee: bigint;
  /** SHA256 hash commitment for the HTLC (64 hex chars, no 0x prefix) */
  hashlock: string;
}

/**
 * Result of building a refund PSBT
 */
export interface BuildRefundPsbtResult {
  /** PSBT hex ready for depositor signing */
  psbtHex: string;
}

/**
 * Build a PSBT for signing the refund transaction.
 *
 * The refund transaction spends the Pre-PegIn HTLC output via leaf 1
 * (the refund script: `<timelockRefund> CSV DROP <depositorPubkey> CHECKSIG`).
 * The PSBT includes the tapLeafScript entry so the depositor's wallet can
 * sign using Taproot script-path spending.
 *
 * The input's sequence is set to `timelockRefund` by the WASM, enforcing
 * the Bitcoin CSV timelock. The refund broadcast will be rejected by the
 * network if the timelock has not yet expired.
 *
 * @param params - Refund PSBT parameters
 * @returns PSBT hex for depositor signing
 * @throws If the HTLC output at htlcVout is not found
 * @throws If the refund transaction does not have exactly 1 input
 */
export async function buildRefundPsbt(
  params: BuildRefundPsbtParams,
): Promise<BuildRefundPsbtResult> {
  await initWasm();

  const { prePeginParams, fundedPrePeginTxHex, htlcVout, refundFee, hashlock } =
    params;

  const unfundedTx = new WasmPrePeginTx(
    prePeginParams.depositorPubkey,
    prePeginParams.vaultProviderPubkey,
    prePeginParams.vaultKeeperPubkeys,
    prePeginParams.universalChallengerPubkeys,
    [...prePeginParams.hashlocks],
    new BigUint64Array(prePeginParams.pegInAmounts),
    prePeginParams.timelockRefund,
    prePeginParams.feeRate,
    prePeginParams.numLocalChallengers,
    prePeginParams.councilQuorum,
    prePeginParams.councilSize,
    prePeginParams.network,
  );

  let fundedTx: WasmPrePeginTx | null = null;
  try {
    fundedTx = unfundedTx.fromFundedTransaction(fundedPrePeginTxHex);

    const refundTxHex = fundedTx.buildRefundTx(refundFee, htlcVout);

    const htlcConnector = await getPrePeginHtlcConnectorInfo({
      depositorPubkey: prePeginParams.depositorPubkey,
      vaultProviderPubkey: prePeginParams.vaultProviderPubkey,
      vaultKeeperPubkeys: prePeginParams.vaultKeeperPubkeys,
      universalChallengerPubkeys: prePeginParams.universalChallengerPubkeys,
      hashlock,
      timelockRefund: prePeginParams.timelockRefund,
      network: prePeginParams.network,
    });

    const cleanPrePeginHex = fundedPrePeginTxHex.startsWith("0x")
      ? fundedPrePeginTxHex.slice(2)
      : fundedPrePeginTxHex;
    const prePeginTx = Transaction.fromHex(cleanPrePeginHex);

    const htlcOutput = prePeginTx.outs[htlcVout];
    if (!htlcOutput) {
      throw new Error(
        `HTLC output at vout ${htlcVout} not found in funded Pre-PegIn tx ` +
          `(tx has ${prePeginTx.outs.length} outputs)`,
      );
    }

    const refundTx = Transaction.fromHex(refundTxHex);

    if (refundTx.ins.length !== 1) {
      throw new Error(
        `Refund transaction must have exactly 1 input, got ${refundTx.ins.length}`,
      );
    }

    const refundInput = refundTx.ins[0];

    // Verify the refund input spends the correct Pre-PegIn HTLC output
    const prePeginTxid = prePeginTx.getId();
    const refundInputTxid = uint8ArrayToHex(
      new Uint8Array(refundInput.hash).slice().reverse(),
    );
    if (refundInputTxid !== prePeginTxid) {
      throw new Error(
        `Refund input does not reference the Pre-PegIn transaction. ` +
          `Expected ${prePeginTxid}, got ${refundInputTxid}`,
      );
    }
    if (refundInput.index !== htlcVout) {
      throw new Error(
        `Refund input index ${refundInput.index} does not match expected htlcVout ${htlcVout}`,
      );
    }

    const psbt = new Psbt();
    psbt.setVersion(refundTx.version);
    psbt.setLocktime(refundTx.locktime);

    psbt.addInput({
      hash: refundInput.hash,
      index: refundInput.index,
      sequence: refundInput.sequence,
      witnessUtxo: {
        script: htlcOutput.script,
        value: htlcOutput.value,
      },
      tapLeafScript: [
        {
          leafVersion: TAPSCRIPT_LEAF_VERSION,
          script: Buffer.from(hexToUint8Array(htlcConnector.refundScript)),
          controlBlock: Buffer.from(
            hexToUint8Array(htlcConnector.refundControlBlock),
          ),
        },
      ],
      tapInternalKey: Buffer.from(tapInternalPubkey),
    });

    for (const output of refundTx.outs) {
      psbt.addOutput({
        script: output.script,
        value: output.value,
      });
    }

    return { psbtHex: psbt.toHex() };
  } finally {
    fundedTx?.free();
    unfundedTx.free();
  }
}
