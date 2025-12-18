/**
 * Transaction factory for reducing boilerplate in contract write operations
 */

import {
  type Abi,
  type Address,
  type Chain,
  type Hash,
  type TransactionReceipt,
  type WalletClient,
} from "viem";

import { mapViemErrorToContractError } from "../../utils/errors";

import { ethClient } from "./client";

/**
 * Standard transaction result
 */
export interface TransactionResult {
  transactionHash: Hash;
  receipt: TransactionReceipt;
}

/**
 * Options for executing a contract write
 */
export interface ExecuteWriteOptions {
  walletClient: WalletClient;
  chain: Chain;
  address: Address;
  abi: Abi | readonly unknown[];
  functionName: string;
  args: readonly unknown[];
  /** Error context for mapViemErrorToContractError */
  errorContext: string;
}

/**
 * Execute a contract write operation with standard error handling
 *
 * Handles the common pattern:
 * 1. Call writeContract
 * 2. Wait for transaction receipt
 * 3. Return hash + receipt
 * 4. Map errors to ContractError
 */
export async function executeWrite(
  options: ExecuteWriteOptions,
): Promise<TransactionResult> {
  const {
    walletClient,
    chain,
    address,
    abi,
    functionName,
    args,
    errorContext,
  } = options;

  const publicClient = ethClient.getPublicClient();

  try {
    const hash = await walletClient.writeContract({
      address,
      abi,
      functionName,
      args,
      chain,
      account: walletClient.account!,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    return {
      transactionHash: hash,
      receipt,
    };
  } catch (error) {
    throw mapViemErrorToContractError(error, errorContext);
  }
}

/**
 * Execute a contract write with custom post-processing
 *
 * Use when you need to extract additional data from the receipt (e.g., events)
 */
export async function executeWriteWithProcessor<TResult>(
  options: ExecuteWriteOptions,
  processor: (hash: Hash, receipt: TransactionReceipt) => TResult,
): Promise<TResult> {
  const result = await executeWrite(options);
  return processor(result.transactionHash, result.receipt);
}

/**
 * Execute a contract write with timeout-aware error handling
 *
 * Use for operations where you want to preserve the tx hash even if receipt polling times out
 */
export async function executeWriteWithHashRecovery(
  options: ExecuteWriteOptions,
): Promise<TransactionResult> {
  const {
    walletClient,
    chain,
    address,
    abi,
    functionName,
    args,
    errorContext,
  } = options;

  const publicClient = ethClient.getPublicClient();
  let hash: Hash | undefined;

  try {
    hash = await walletClient.writeContract({
      address,
      abi,
      functionName,
      args,
      chain,
      account: walletClient.account!,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    return {
      transactionHash: hash,
      receipt,
    };
  } catch (error) {
    // If we have a transaction hash, include it in the error for user reference
    if (hash) {
      const enhancedError = new Error(
        `Transaction submitted with hash ${hash}, but receipt polling timed out. ` +
          `Please check the transaction on Etherscan. ` +
          `Original error: ${error instanceof Error ? error.message : String(error)}`,
      );
      enhancedError.cause = error;
      throw enhancedError;
    }

    throw mapViemErrorToContractError(error, errorContext);
  }
}
