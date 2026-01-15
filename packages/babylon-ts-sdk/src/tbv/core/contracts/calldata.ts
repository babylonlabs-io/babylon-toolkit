/**
 * Contract Calldata Encoding Utilities
 *
 * Provides utilities for:
 * - Encoding submitPeginRequest calldata (for actual transactions)
 * - Calculating gas estimates (pure calculation, no RPC needed)
 *
 * @module contracts/calldata
 */

import { encodeFunctionData, type Address, type Hex } from "viem";

import { BTCVaultsManagerABI } from "./abis/BTCVaultsManager.abi";

/**
 * Gas constants for submitPeginRequest estimation.
 *
 * Gas breakdown:
 * - Base transaction: 21,000
 * - Contract execution overhead: ~170,000 (parsing, storage, events)
 * - Calldata: 16 gas per non-zero byte, 4 per zero byte
 * - Buffer for safety: 20%
 */
const GAS_ESTIMATE_BASE = 21_000n;
const GAS_ESTIMATE_EXECUTION_OVERHEAD = 170_000n;
const GAS_ESTIMATE_PER_CALLDATA_BYTE = 16n;
const GAS_ESTIMATE_BUFFER_PERCENT = 120n;

/**
 * Fixed calldata size for submitPeginRequest (excluding BTC tx).
 *
 * submitPeginRequest(address, bytes32, bytes, bytes, address) ABI encoding:
 * - Function selector: 4 bytes
 * - depositorEthAddress: 32 bytes (address padded)
 * - depositorBtcPubkey: 32 bytes (bytes32)
 * - btcPopSignature offset: 32 bytes
 * - unsignedPegInTx offset: 32 bytes
 * - vaultProvider: 32 bytes (address padded)
 * - btcPopSignature length: 32 bytes
 * - btcPopSignature data: 64 bytes → 96 bytes (padded to 32)
 * Total fixed: 4 + 32*5 + 32 + 96 = 292 bytes
 */
const FIXED_CALLDATA_BYTES = 292n;

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
 * Calculates gas estimate for submitPeginRequest based on calldata size.
 *
 * This is a pure utility function - no RPC calls or encoding needed.
 * Calculates the ABI-encoded calldata size directly from the BTC tx size.
 *
 * @param unsignedBtcTx - Unsigned BTC transaction hex (with or without 0x prefix)
 * @returns Estimated gas in gas units (as bigint)
 */
export function calculatePeginGasEstimate(unsignedBtcTx: string): bigint {
  // Calculate BTC tx bytes (remove 0x prefix if present)
  const btcTxHex = unsignedBtcTx.startsWith("0x")
    ? unsignedBtcTx.slice(2)
    : unsignedBtcTx;
  const btcTxBytes = BigInt(btcTxHex.length / 2);

  // ABI encoding for dynamic bytes: length prefix (32) + data padded to 32-byte boundary
  const btcTxPadded = ((btcTxBytes + 31n) / 32n) * 32n + 32n;

  // Total calldata size
  const calldataBytes = FIXED_CALLDATA_BYTES + btcTxPadded;
  const calldataGas = calldataBytes * GAS_ESTIMATE_PER_CALLDATA_BYTE;

  const totalGas =
    GAS_ESTIMATE_BASE + GAS_ESTIMATE_EXECUTION_OVERHEAD + calldataGas;
  return (totalGas * GAS_ESTIMATE_BUFFER_PERCENT) / 100n;
}
