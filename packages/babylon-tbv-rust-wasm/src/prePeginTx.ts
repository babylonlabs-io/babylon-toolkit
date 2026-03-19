// @ts-expect-error - WASM files are in dist/generated/ (checked into git), not src/generated/
import { WasmPrePeginTx } from "./generated/btc_vault.js";
import { initWasm } from "./index.js";
import type {
  PrePeginTxParams,
  PrePeginTxResult,
  PeginFromPrePeginParams,
  PeginFromPrePeginResult,
  RefundFromPrePeginParams,
} from "./types.js";

/**
 * Construct a WasmPrePeginTx instance from typed params.
 * Centralises the 12-parameter constructor so any WASM API change
 * only needs to be updated in one place.
 */
function createWasmPrePeginTx(params: PrePeginTxParams): InstanceType<typeof WasmPrePeginTx> {
  return new WasmPrePeginTx(
    params.depositor,
    params.vaultProvider,
    params.vaultKeepers,
    params.universalChallengers,
    params.hashH,
    params.timelockRefund,
    params.peginAmount,
    params.feeRate,
    params.numLocalChallengers,
    params.councilQuorum,
    params.councilSize,
    params.network,
  );
}

/**
 * Creates an unfunded Pre-PegIn transaction.
 *
 * The Pre-PegIn transaction locks BTC in an HTLC output with two spend paths:
 * - Hashlock path: Secret reveal + all-party signatures (for PegIn activation)
 * - Refund path: Depositor reclaims after CSV timelock (if activation times out)
 *
 * The `depositorClaimValue` and `htlcValue` are auto-computed from the
 * provided contract parameters (fee rate, council params, challenger counts).
 *
 * The returned transaction has no inputs. The frontend must fund it by
 * selecting UTXOs, adding inputs, and adding a change output.
 *
 * @param params - Pre-PegIn parameters (public keys, hash commitment, amount, contract params)
 * @returns Unfunded Pre-PegIn transaction details and HTLC output information
 */
export async function createPrePeginTransaction(
  params: PrePeginTxParams,
): Promise<PrePeginTxResult> {
  await initWasm();

  const tx = createWasmPrePeginTx(params);

  return {
    txHex: tx.toHex(),
    txid: tx.getTxid(),
    htlcScriptPubKey: tx.getHtlcScriptPubKey(),
    htlcValue: tx.getHtlcValue(),
    htlcAddress: tx.getHtlcAddress(),
    peginAmount: tx.getPeginAmount(),
    depositorClaimValue: tx.getDepositorClaimValue(),
  };
}

/**
 * Builds a PegIn transaction that spends a funded Pre-PegIn's HTLC output.
 *
 * The PegIn transaction has a single input spending Pre-PegIn output 0
 * via the hashlock + all-party script (leaf 0). The fee is baked into
 * the HTLC input/output difference (no additional fee calculation needed).
 *
 * Since Pre-PegIn inputs are SegWit/Taproot, the txid is stable after
 * funding — signing does not change it.
 *
 * @param prePeginParams - The same params used to create the Pre-PegIn transaction
 * @param peginParams - PegIn-specific params (timelock, funded Pre-PegIn txid)
 * @returns PegIn transaction details
 */
export async function buildPeginFromPrePegin(
  prePeginParams: PrePeginTxParams,
  peginParams: PeginFromPrePeginParams,
): Promise<PeginFromPrePeginResult> {
  await initWasm();

  const prePeginTx = createWasmPrePeginTx(prePeginParams);
  const peginTx = prePeginTx.buildPeginTx(
    peginParams.timelockPegin,
    peginParams.fundedPrePeginTxid,
  );

  return {
    txHex: peginTx.toHex(),
    txid: peginTx.getTxid(),
    vaultScriptPubKey: peginTx.getVaultScriptPubKey(),
    vaultValue: peginTx.getVaultValue(),
  };
}

/**
 * Builds an unsigned refund transaction that spends a funded Pre-PegIn's
 * HTLC output via the refund script (leaf 1) after the CSV timelock expires.
 *
 * The depositor signs this externally via their wallet. This is used when
 * vault activation times out and the depositor needs to reclaim their BTC.
 *
 * @param prePeginParams - The same params used to create the Pre-PegIn transaction
 * @param refundParams - Refund-specific params (fee, funded Pre-PegIn txid)
 * @returns Unsigned refund transaction hex
 */
export async function buildRefundFromPrePegin(
  prePeginParams: PrePeginTxParams,
  refundParams: RefundFromPrePeginParams,
): Promise<string> {
  await initWasm();

  const prePeginTx = createWasmPrePeginTx(prePeginParams);
  return prePeginTx.buildRefundTx(
    refundParams.refundFee,
    refundParams.fundedPrePeginTxid,
  );
}
