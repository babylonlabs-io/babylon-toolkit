/**
 * Shared multicall helper utilities
 *
 * These helpers reduce code duplication across contract query functions
 * that use viem's multicall feature for batching RPC calls.
 */

import type { Abi, Address, PublicClient } from "viem";

/**
 * Generic multicall helper that handles the boilerplate of:
 * 1. Creating contract call configurations
 * 2. Executing multicall
 * 3. Filtering successful results
 *
 * @param publicClient - Viem public client
 * @param contractAddress - Contract address to call
 * @param abi - Contract ABI
 * @param functionName - Function name to call
 * @param args - Array of argument arrays (one per call)
 * @returns Array of successful results (failures filtered out)
 */
export async function executeMulticall<T>(
  publicClient: PublicClient,
  contractAddress: Address,
  abi: Abi,
  functionName: string,
  args: unknown[][],
): Promise<T[]> {
  if (args.length === 0) {
    return [];
  }

  // Create multicall contract calls
  const contracts = args.map((callArgs) => ({
    address: contractAddress,
    abi,
    functionName: functionName as never,
    args: callArgs,
  }));

  // Execute all calls in a single multicall request
  const results = await publicClient.multicall({
    contracts,
    allowFailure: true, // Allow individual calls to fail without breaking the batch
  });

  // Filter and return successful results
  return results
    .filter(
      (result): result is { status: "success"; result: T } =>
        result.status === "success",
    )
    .map((result) => result.result);
}
