/**
 * Transaction factory for reducing boilerplate in contract write operations
 *
 * Includes pre-flight simulation to catch errors before user signs.
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
 * 1. Pre-flight simulation (catches errors before user signs)
 * 2. Call writeContract
 * 3. Wait for transaction receipt
 * 4. Return hash + receipt
 * 5. Map errors to ContractError with ABI decoding
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
  const account = walletClient.account;

  if (!account) {
    throw new Error("Wallet account not available");
  }

  try {
    // Pre-flight simulation - catches errors before user signs
    await publicClient.simulateContract({
      address,
      abi,
      functionName,
      args,
      account,
    });

    // Simulation passed, now send the actual transaction
    const hash = await walletClient.writeContract({
      address,
      abi,
      functionName,
      args,
      chain,
      account,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    // Check if transaction was reverted
    if (receipt.status === "reverted") {
      throw new Error(
        `Transaction reverted. Hash: ${hash}. Check the transaction on block explorer for details.`,
      );
    }

    return {
      transactionHash: hash,
      receipt,
    };
  } catch (error) {
    // Pass the ABI for better error decoding
    throw mapViemErrorToContractError(error, errorContext, [abi as Abi]);
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
 * Use for operations where you want to preserve the tx hash even if receipt polling times out.
 * Includes pre-flight simulation to catch errors before user signs.
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
  const account = walletClient.account;
  let hash: Hash | undefined;

  if (!account) {
    throw new Error("Wallet account not available");
  }

  try {
    // Pre-flight simulation - catches errors before user signs
    await publicClient.simulateContract({
      address,
      abi,
      functionName,
      args,
      account,
    });

    // Simulation passed, now send the actual transaction
    hash = await walletClient.writeContract({
      address,
      abi,
      functionName,
      args,
      chain,
      account,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    // Check if transaction was reverted
    if (receipt.status === "reverted") {
      throw new Error(
        `Transaction reverted. Hash: ${hash}. Check the transaction on block explorer for details.`,
      );
    }

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

    // Pass the ABI for better error decoding
    throw mapViemErrorToContractError(error, errorContext, [abi as Abi]);
  }
}
