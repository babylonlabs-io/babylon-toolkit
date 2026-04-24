/**
 * Transaction factory for reducing boilerplate in contract write operations
 *
 * Includes pre-flight simulation to catch errors before user signs.
 */

import { getETHChain } from "@babylonlabs-io/config";
import {
  type Abi,
  type Address,
  type Chain,
  type Hash,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
  type WalletClient,
  encodeFunctionData,
} from "viem";

import { logger } from "@/infrastructure";

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

  // Reject if the wallet is connected to the wrong chain
  const expectedChainId = getETHChain().id;
  if (walletClient.chain?.id !== expectedChainId) {
    throw new Error(
      `Chain mismatch: expected chain ${expectedChainId}, got ${walletClient.chain?.id}. Please switch to the correct network.`,
    );
  }

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
      const callData = encodeFunctionData({
        abi: abi as Abi,
        functionName,
        args,
      });
      await throwRevertError(
        publicClient,
        receipt,
        hash,
        address,
        callData,
        account.address,
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
 * Ratio threshold for detecting out-of-gas vs logic revert.
 * When gasUsed / gasLimit >= 95%, it's almost certainly out-of-gas.
 */
const OUT_OF_GAS_RATIO = 95n;

/**
 * Diagnose a reverted transaction and throw a descriptive error.
 *
 * 1. If gasUsed ≈ gasLimit → out-of-gas (replaying with unlimited gas would just succeed).
 * 2. Otherwise → replay with eth_call at the revert block to extract the custom error selector.
 *
 * Shared by both `executeWrite` (abi-based) and Aave's `executeTx` (raw calldata).
 */
export async function throwRevertError(
  publicClient: PublicClient,
  receipt: TransactionReceipt,
  hash: Hash,
  to: Address,
  data: Hex,
  account: Address,
): Promise<never> {
  // Detect out-of-gas: gasUsed ≈ gasLimit means the EVM exhausted gas
  // rather than hitting a revert opcode
  const tx = await publicClient.getTransaction({ hash });
  if (tx.gas > 0n && receipt.gasUsed >= (tx.gas * OUT_OF_GAS_RATIO) / 100n) {
    throw new Error(
      `Transaction ran out of gas (used ${receipt.gasUsed} of ${tx.gas} limit). ` +
        `Try again — the wallet should estimate a higher gas limit on retry.`,
    );
  }

  // Replay the call to extract revert data for error decoding
  try {
    await publicClient.call({
      to,
      data,
      account,
      blockNumber: receipt.blockNumber,
    });
  } catch (replayError) {
    // The replay reverted — this error should contain the revert data
    throw replayError instanceof Error
      ? replayError
      : new Error(String(replayError));
  }

  // Replay succeeded (state changed between block and now, or archive node unavailable)
  logger.warn(
    "Transaction reverted on-chain but replay succeeded — revert reason unavailable",
    { data: { hash } },
  );
  throw new Error(
    `Transaction reverted. Hash: ${hash}. Check the transaction on block explorer for details.`,
  );
}
