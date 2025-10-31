/**
 * Gas Estimation Utilities
 *
 * Standard gas estimation utilities for Ethereum transactions.
 * Uses multiplier buffer approach (standard practice before EIP-7983).
 */

import type { PublicClient } from "viem";

/**
 * Standard gas buffer multiplier (10% buffer)
 * This accounts for:
 * - Estimation inaccuracies
 * - State changes between estimation and execution
 * - Network variability
 */
const GAS_BUFFER_MULTIPLIER = 110n; // 10% buffer (110% of estimate)
const GAS_BUFFER_DIVISOR = 100n;

/**
 * Estimate gas with standard buffer multiplier
 *
 * This is the standard approach for gas estimation before EIP-7983.
 * It estimates gas and adds a 10% buffer to account for estimation
 * inaccuracies and state changes between estimation and execution.
 *
 * @param publicClient - Viem public client for gas estimation
 * @param params - Gas estimation parameters
 * @returns Gas limit with buffer applied
 */
export async function estimateGasWithBuffer(
  publicClient: PublicClient,
  params: Parameters<PublicClient["estimateContractGas"]>[0],
): Promise<bigint> {
  const gasEstimate = await publicClient.estimateContractGas(params);

  // Apply 10% buffer: multiply by 110 and divide by 100
  const gasLimit = (gasEstimate * GAS_BUFFER_MULTIPLIER) / GAS_BUFFER_DIVISOR;

  return gasLimit;
}

