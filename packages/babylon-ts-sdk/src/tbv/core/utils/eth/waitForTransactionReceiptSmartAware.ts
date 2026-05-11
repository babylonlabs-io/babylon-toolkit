/**
 * Smart-account-aware wrapper around viem's `waitForTransactionReceipt`.
 *
 * Externally Owned Accounts (EOAs) — wallets controlled by a single private
 * key, e.g. MetaMask or a hardware wallet. `eth_sendTransaction` returns a real
 * Ethereum tx hash, which viem can poll directly. This wrapper detects an EOA
 * via `eth_getCode` returning empty bytecode and delegates unchanged.
 *
 * Smart-contract accounts (e.g. Safe multisigs) — the wallet address is a
 * deployed contract that decides whether to accept a transaction. WalletConnect's
 * `eth_sendTransaction` returns a `safeTxHash` (an EIP-712 hash of the
 * *proposal*) rather than a real tx hash, and the proposal is held in Safe's
 * off-chain Transaction Service until quorum signs and executes it. We poll
 * that service for the proposal until execution, then wait for receipt on the
 * real Ethereum tx hash exposed in the service's response.
 *
 * @module utils/eth
 */

import type {
  Address,
  Hash,
  PublicClient,
  TransactionReceipt,
} from "viem";

/**
 * Chains where the Safe Transaction Service is supported by this utility.
 * Extend the map as more Safe-enabled chains are needed.
 */
const SAFE_TX_SERVICE_BASE_URLS: Record<number, string> = {
  1: "https://safe-transaction-mainnet.safe.global",
  11155111: "https://safe-transaction-sepolia.safe.global",
};

const DEFAULT_SAFE_POLL_INTERVAL_MS = 5_000;
const DEFAULT_SAFE_POLL_TIMEOUT_MS = 4 * 60 * 60 * 1_000;

export interface WaitForTransactionReceiptSmartAwareParams {
  publicClient: PublicClient;
  walletAddress: Address;
  hash: Hash;
  confirmations?: number;
  /**
   * Forwarded to viem on the EOA (externally owned account) path.
   * Ignored on the smart-account path — see safePollTimeoutMs.
   */
  timeout?: number;
  /** Total budget for waiting on Safe quorum + execution. Default 4h. */
  safePollTimeoutMs?: number;
  /** Poll cadence against the Safe Transaction Service. Default 5s. */
  safePollIntervalMs?: number;
}

export async function waitForTransactionReceiptSmartAware(
  params: WaitForTransactionReceiptSmartAwareParams,
): Promise<TransactionReceipt> {
  const {
    publicClient,
    walletAddress,
    hash,
    confirmations,
    timeout,
    safePollTimeoutMs = DEFAULT_SAFE_POLL_TIMEOUT_MS,
    safePollIntervalMs = DEFAULT_SAFE_POLL_INTERVAL_MS,
  } = params;

  const code = await publicClient.getCode({ address: walletAddress });
  const isSmartAccount = code !== undefined && code !== "0x";

  if (!isSmartAccount) {
    return publicClient.waitForTransactionReceipt({
      hash,
      confirmations,
      timeout,
    });
  }

  const chainId = await publicClient.getChainId();
  const realTxHash = await pollSafeTransactionServiceUntilExecuted({
    chainId,
    safeTxHash: hash,
    pollIntervalMs: safePollIntervalMs,
    timeoutMs: safePollTimeoutMs,
  });

  return publicClient.waitForTransactionReceipt({
    hash: realTxHash,
    confirmations,
  });
}

interface SafeMultisigTransaction {
  isExecuted: boolean;
  isSuccessful: boolean | null;
  transactionHash: Hash | null;
}

async function pollSafeTransactionServiceUntilExecuted({
  chainId,
  safeTxHash,
  pollIntervalMs,
  timeoutMs,
}: {
  chainId: number;
  safeTxHash: Hash;
  pollIntervalMs: number;
  timeoutMs: number;
}): Promise<Hash> {
  const baseUrl = SAFE_TX_SERVICE_BASE_URLS[chainId];
  if (!baseUrl) {
    throw new Error(
      `Safe Transaction Service not configured for chainId ${chainId}. ` +
        `Connected wallet appears to be a smart-contract account, but this ` +
        `chain is not in the supported list. Either connect an EOA or extend ` +
        `SAFE_TX_SERVICE_BASE_URLS in waitForTransactionReceiptSmartAware.ts.`,
    );
  }

  const url = `${baseUrl}/api/v1/multisig-transactions/${safeTxHash}/`;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const response = await fetch(url).catch((err: unknown) => {
      throw new Error(
        `Network error while polling Safe Transaction Service: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });

    if (response.ok) {
      const data = (await response.json()) as SafeMultisigTransaction;
      if (data.isExecuted) {
        if (data.isSuccessful === false) {
          throw new Error(
            `Safe transaction ${safeTxHash} was executed on chain but reverted. ` +
              `Check the Safe queue UI for details.`,
          );
        }
        if (data.transactionHash) {
          return data.transactionHash;
        }
      }
    } else if (response.status !== 404) {
      throw new Error(
        `Safe Transaction Service returned ${response.status} for ${safeTxHash}.`,
      );
    }

    await sleep(pollIntervalMs);
  }

  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for Safe transaction ${safeTxHash} ` +
      `to reach quorum and execute. The proposal is still pending in the Safe ` +
      `queue — co-signers must sign and execute it before the dApp can proceed.`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
