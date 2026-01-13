/**
 * Contract Calldata Encoding Utilities
 *
 * Shared utilities for encoding contract calldata, used by both:
 * - PeginManager (actual transactions)
 * - Gas estimation hooks (with dummy signature)
 *
 * @module contracts/calldata
 */

import { encodeFunctionData, type Address, type Hex } from "viem";

import { BTCVaultsManagerABI } from "./abis/BTCVaultsManager.abi";

/**
 * Dummy 64-byte Schnorr signature for gas estimation.
 * The actual signature value doesn't affect gas cost, only the size matters.
 * 64 bytes = 128 hex chars + 0x prefix
 */
export const DUMMY_POP_SIGNATURE: Hex = `0x${"00".repeat(64)}` as Hex;

/**
 * Dummy 20-byte Ethereum address for gas estimation.
 * Used when actual address is not needed for estimation.
 */
const DUMMY_ETH_ADDRESS: Address =
  "0x0000000000000000000000000000000000000000" as Address;

/**
 * Dummy 32-byte BTC public key for gas estimation.
 * 32 bytes = 64 hex chars + 0x prefix
 */
const DUMMY_BTC_PUBKEY: Hex = `0x${"00".repeat(32)}` as Hex;

/**
 * Parameters for encoding submitPeginRequest calldata
 */
export interface SubmitPeginCalldataParams {
  /** Depositor's Ethereum address */
  depositorEthAddress: Address;
  /** Depositor's BTC public key (x-only, 64 hex chars, with or without 0x prefix) */
  depositorBtcPubkey: string;
  /** BTC proof of possession signature (hex with 0x prefix) */
  btcPopSignature: Hex;
  /** Unsigned BTC transaction hex (with or without 0x prefix) */
  unsignedPegInTx: string;
  /** Vault provider's Ethereum address */
  vaultProvider: Address;
}

/**
 * Ensures a hex string has the 0x prefix
 */
function ensureHexPrefix(value: string): Hex {
  return value.startsWith("0x") ? (value as Hex) : (`0x${value}` as Hex);
}

/**
 * Encodes the calldata for submitPeginRequest contract call.
 *
 * This shared utility ensures consistent encoding between:
 * - Actual transaction submission (PeginManager)
 * - Gas estimation (useEstimatedEthFee)
 *
 * @param params - Parameters for the contract call
 * @returns Encoded calldata as hex string
 */
export function encodeSubmitPeginCalldata(
  params: SubmitPeginCalldataParams,
): Hex {
  const {
    depositorEthAddress,
    depositorBtcPubkey,
    btcPopSignature,
    unsignedPegInTx,
    vaultProvider,
  } = params;

  // Format parameters with 0x prefix
  const depositorBtcPubkeyHex = ensureHexPrefix(depositorBtcPubkey);
  const unsignedPegInTxHex = ensureHexPrefix(unsignedPegInTx);

  return encodeFunctionData({
    abi: BTCVaultsManagerABI,
    functionName: "submitPeginRequest",
    args: [
      depositorEthAddress,
      depositorBtcPubkeyHex,
      btcPopSignature,
      unsignedPegInTxHex,
      vaultProvider,
    ],
  });
}

/**
 * Encodes calldata for gas estimation purposes ONLY.
 *
 * ⚠️ WARNING: DO NOT use this for actual transaction submission!
 * This function uses dummy values for addresses, pubkeys, and signatures.
 * Submitting a transaction with this calldata will FAIL on-chain.
 *
 * For actual transaction submission, use `encodeSubmitPeginCalldata()` instead.
 *
 * Why this exists:
 * - Gas cost depends primarily on the variable-size `unsignedPegInTx` field
 * - Other fields (addresses, pubkeys, signature) are fixed-size and don't affect gas
 * - This allows gas estimation before the user has signed anything
 *
 * @param unsignedPegInTx - Unsigned BTC transaction hex (with or without 0x prefix)
 * @returns Encoded calldata as hex string (FOR GAS ESTIMATION ONLY)
 *
 * @example
 * ```typescript
 * // ✅ Correct: Use for gas estimation
 * const calldata = encodeSubmitPeginCalldataForGasEstimation(unsignedTx);
 * const gasEstimate = await client.estimateGas({ data: calldata, to: contract });
 *
 * // ❌ Wrong: DO NOT use for actual submission
 * // await wallet.sendTransaction({ data: calldata, to: contract }); // WILL FAIL!
 * ```
 */
export function encodeSubmitPeginCalldataForGasEstimation(
  unsignedPegInTx: string,
): Hex {
  const unsignedPegInTxHex = ensureHexPrefix(unsignedPegInTx);

  return encodeFunctionData({
    abi: BTCVaultsManagerABI,
    functionName: "submitPeginRequest",
    args: [
      DUMMY_ETH_ADDRESS,
      DUMMY_BTC_PUBKEY,
      DUMMY_POP_SIGNATURE,
      unsignedPegInTxHex,
      DUMMY_ETH_ADDRESS,
    ],
  });
}
