/**
 * Transaction factory for reducing boilerplate in contract write operations
 *
 * Includes pre-flight simulation to catch errors before user signs.
 */

import { waitForTransactionReceiptSmartAware } from "@babylonlabs-io/ts-sdk/tbv/core/utils";
import {
  type Abi,
  type Account,
  type Address,
  type Chain,
  type Hash,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
  type WalletClient,
  encodeFunctionData,
} from "viem";

import { getETHChain } from "@/config/network";
import { COPY } from "@/copy";
import { logger } from "@/infrastructure";
import { normalizeError } from "@/utils/errors/normalizeError";

import {
  mapViemErrorToContractError,
  tagSimulationPhase,
} from "../../utils/errors";

import { ethClient } from "./client";
import {
  sendWithStaleNonceRetry,
  waitForWalletToCountTransaction,
} from "./walletNonce";

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
  /**
   * How long to poll the Safe Transaction Service for a Safe proposal before
   * the receipt wait fails. Omitted, the SDK's own default applies (hours).
   */
  safePollTimeoutMs?: number;
  /**
   * Gas limit for the transaction. Omitted, the wallet estimates one; given,
   * viem forwards it and MetaMask uses it as is
   * (MetaMask/core@a7be4d8f:packages/transaction-controller/src/utils/gas.ts:513-516).
   */
  gas?: bigint;
  /**
   * Replaces the `eth_call` pre-flight when its success does not prove the
   * call does what the caller wants. Runs before the first send and before a
   * stale-nonce resend, and throws its own simulation-phase errors.
   */
  preflight?: () => Promise<void>;
}

/** The wallet's account, which every write signs with. */
export function requireWalletAccount(walletClient: WalletClient): Account {
  const account = walletClient.account;
  if (!account) {
    throw new Error(COPY.common.walletAccountUnavailable);
  }
  return account;
}

/**
 * Execute a contract write operation with standard error handling
 *
 * Handles the common pattern:
 * 1. Pre-flight simulation (catches errors before user signs)
 * 2. Call writeContract, once more after a stale-nonce rejection
 * 3. Wait for transaction receipt, then for the wallet to count it
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
    safePollTimeoutMs,
    gas,
    preflight,
  } = options;

  // Reject if the wallet is connected to the wrong chain
  const expectedChainId = getETHChain().id;
  if (walletClient.chain?.id !== expectedChainId) {
    throw new Error(
      `Chain mismatch: expected chain ${expectedChainId}, got ${walletClient.chain?.id}. Please switch to the correct network.`,
    );
  }

  const publicClient = ethClient.getPublicClient();
  const account = requireWalletAccount(walletClient);

  // Pre-flight simulation - catches errors before user signs. Its error is
  // final: nothing that can still be mined was signed or sent (before a
  // stale-nonce resend it re-runs after a refusal that can never be mined).
  let preflightError: unknown;
  const simulate = async () => {
    try {
      if (preflight) {
        await preflight();
        return;
      }
      await publicClient.simulateContract({
        address,
        abi,
        functionName,
        args,
        account,
        gas,
      });
    } catch (error) {
      // The default is tagged so callers can safely auto-retry: the failure
      // may be a lagging RPC backend, not the chain. A caller's own pre-flight
      // throws what its callers should see.
      preflightError = preflight
        ? error
        : tagSimulationPhase(
            mapViemErrorToContractError(error, errorContext, [abi as Abi]),
          );
      throw preflightError;
    }
  };
  await simulate();

  try {
    // Simulation passed, now send the actual transaction. A send the wallet
    // signed with a nonce used before it started is simulated and sent once
    // more.
    const hash = await sendWithStaleNonceRetry({
      walletClient,
      publicClient,
      account: account.address,
      send: (submissionClient) =>
        submissionClient.writeContract({
          address,
          abi,
          functionName,
          args,
          chain,
          account,
          gas,
        }),
      prepare: simulate,
    });

    // Smart-account-aware: Externally Owned Account (EOA) wallets — controlled
    // by a single private key, e.g. MetaMask — resolve via the real tx hash
    // directly. Safe-style multisigs return a `safeTxHash` here that requires
    // polling the Safe Transaction Service before the on-chain receipt exists.
    const receipt = await waitForTransactionReceiptSmartAware({
      publicClient,
      walletAddress: account.address,
      hash,
      safePollTimeoutMs,
    });

    // Before the flow asks the wallet for its next transaction, let the
    // wallet's own node count this one, so it does not reuse the nonce.
    await waitForWalletToCountTransaction({
      walletClient,
      publicClient,
      account: account.address,
      receipt,
    });

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
        receipt.transactionHash,
        address,
        callData,
        account.address,
      );
    }

    return {
      transactionHash: receipt.transactionHash,
      receipt,
    };
  } catch (error) {
    // The pre-flight re-run before a stale-nonce retry already threw what the
    // caller should see.
    if (error === preflightError) throw error;
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
      COPY.common.transactionOutOfGas(
        receipt.gasUsed.toString(),
        tx.gas.toString(),
      ),
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
    throw normalizeError(replayError);
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
