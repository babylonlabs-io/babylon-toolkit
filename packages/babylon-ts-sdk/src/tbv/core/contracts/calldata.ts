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
