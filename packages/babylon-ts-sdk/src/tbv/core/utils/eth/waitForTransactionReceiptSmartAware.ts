/**
 * Smart-account-aware wrapper around viem's `waitForTransactionReceipt`.
 *
 * Externally Owned Accounts (EOAs) — wallets controlled by a single private
 * key, e.g. MetaMask or a hardware wallet. `eth_sendTransaction` returns a real
 * Ethereum tx hash, which viem can poll directly. This wrapper delegates
 * unchanged for them.
 *
 * Smart-contract accounts (e.g. Safe multisigs) — the wallet address is a
 * deployed contract that decides whether to accept a transaction. WalletConnect's
 * `eth_sendTransaction` returns a `safeTxHash` (an EIP-712 hash of the
 * *proposal*) rather than a real tx hash, and the proposal is held in Safe's
 * off-chain Transaction Service until quorum signs and executes it. We poll
 * that service for the proposal until execution, then wait for receipt on the
 * real Ethereum tx hash exposed in the service's response.
 *
 * The two are told apart by `eth_getCode`, but NOT by "empty vs non-empty":
 * an EIP-7702 delegated EOA reports `0xef0100 ‖ <delegate address>` and is
 * still an EOA — it signs and submits its own transactions, so
 * `eth_sendTransaction` returns a real tx hash. MetaMask upgrades accounts to
 * smart accounts this way by default, and treating one as a Safe means polling
 * the Transaction Service for a hash that is not a `safeTxHash`: a permanent
 * 404 that reads as "proposal not yet indexed" and hangs for the full poll
 * budget on a transaction that already succeeded. Delegation designators are
 * therefore classified as EOAs. As a backstop for any wallet that behaves this
 * way in future, a 404 from the Transaction Service is also checked against the
 * node: if it knows the hash as a real transaction, we were never waiting on a
 * proposal and switch to waiting for that transaction's receipt.
 *
 * @module utils/eth
 */

import type { Address, Hash, PublicClient, TransactionReceipt } from "viem";

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
const SAFE_TX_SERVICE_FETCH_TIMEOUT_MS = 10_000;

/** Safe Transaction Service route for one multisig-transaction proposal. */
const SAFE_MULTISIG_TX_PATH = "/api/v1/multisig-transactions";
/** The service answers 404 both for an unindexed proposal and an unknown Safe. */
const SAFE_TX_SERVICE_NOT_FOUND = 404;
/** Statuses at or above this are server-side, so worth retrying. */
const SAFE_TX_SERVICE_SERVER_ERROR = 500;

/** Two hex characters encode one byte in an `eth_getCode` result. */
const HEX_CHARS_PER_BYTE = 2;

/**
 * EIP-7702 delegation designator: an EOA that has delegated its code to a
 * contract reports exactly `0xef0100 ‖ <20-byte delegate address>` from
 * `eth_getCode` (EIP-7702 §"Delegation Designation"). Both the prefix and the
 * exact length are checked so ordinary contract bytecode that merely happens to
 * start with these bytes is not mistaken for a delegation.
 */
const EIP_7702_DELEGATION_PREFIX = "0xef0100";
const EIP_7702_DELEGATION_ADDRESS_BYTES = 20;
const EIP_7702_DELEGATION_CODE_LENGTH =
  EIP_7702_DELEGATION_PREFIX.length +
  HEX_CHARS_PER_BYTE * EIP_7702_DELEGATION_ADDRESS_BYTES;

/**
 * True when `eth_getCode` reports an EIP-7702 delegation designator rather than
 * a deployed contract. Such an account is still an EOA for our purposes: it
 * signs and submits its own transactions, so the hash we hold is a real tx hash.
 */
function isEip7702DelegatedEoa(code: string): boolean {
  return (
    code.length === EIP_7702_DELEGATION_CODE_LENGTH &&
    code.toLowerCase().startsWith(EIP_7702_DELEGATION_PREFIX)
  );
}

export interface WaitForTransactionReceiptSmartAwareParams {
  publicClient: PublicClient;
  walletAddress: Address;
  hash: Hash;
  /**
   * Forwarded to viem verbatim.
   *
   * MUST NOT be used as a finality/reorg gate. viem fetches the receipt once
   * and then only compares block numbers against that cached copy — it never
   * re-checks that the receipt's block is still canonical, so it resolves
   * happily for a transaction that has been reorged out. Setting this buys a
   * delay, not a guarantee. For peg-in registration finality use
   * `waitForPeginRegistrationDepth`, which re-reads live contract state on
   * every poll.
   */
  confirmations?: number;
  /**
   * Forwarded to viem on the EOA (externally owned account) path, and on the
   * fallback where a supposed smart account turns out to submit its own
   * transactions — that is the EOA case too, however we arrived at it.
   *
   * Ignored only while waiting on a genuine Safe proposal, whose budget is
   * safePollTimeoutMs; the receipt wait after a proposal executes is left to
   * viem's own default so a slow node cannot fail an already-executed Safe tx.
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
  // An EIP-7702 delegated EOA has non-empty code but still submits its own
  // transactions, so it belongs on the EOA path — see the module docblock.
  const isSmartAccount =
    code !== undefined && code !== "0x" && !isEip7702DelegatedEoa(code);

  if (!isSmartAccount) {
    return publicClient.waitForTransactionReceipt({
      hash,
      confirmations,
      timeout,
    });
  }

  const chainId = await publicClient.getChainId();
  const outcome = await pollSafeTransactionServiceUntilExecuted({
    chainId,
    publicClient,
    safeTxHash: hash,
    pollIntervalMs: safePollIntervalMs,
    timeoutMs: safePollTimeoutMs,
  });

  // The wallet turned out to submit its own transactions, so this is the EOA
  // case after all — including the caller's `timeout`, which only ever meant to
  // be ignored while waiting on a genuine Safe proposal.
  if (outcome.kind === "not-a-proposal") {
    return publicClient.waitForTransactionReceipt({
      hash,
      confirmations,
      timeout,
    });
  }

  return publicClient.waitForTransactionReceipt({
    hash: outcome.transactionHash,
    confirmations,
  });
}

/**
 * How the Safe path ended. The two outcomes are not interchangeable, so they are
 * distinguished rather than both collapsing to a bare hash: `executed` is a real
 * Safe proposal that reached quorum, while `not-a-proposal` means the wallet was
 * never a Safe and we are really on the EOA path — which decides whether the
 * caller's `timeout` applies to the receipt wait that follows.
 */
type SafePollOutcome =
  | { kind: "executed"; transactionHash: Hash }
  | { kind: "not-a-proposal" };

interface SafeMultisigTransaction {
  isExecuted: boolean;
  isSuccessful: boolean | null;
  transactionHash: Hash | null;
}

/**
 * Decide whether a 404 from the Transaction Service means "proposal not indexed
 * yet" or "this hash was never a proposal at all".
 *
 * The Safe indexer cannot answer that: a genuine Safe and its freshly-submitted
 * proposal are both absent from it for a while, so its 404 proves nothing. The
 * NODE can. A `safeTxHash` is an EIP-712 digest of a proposal and is never a
 * transaction on chain, so if the node knows the hash as a real transaction then
 * this was never a proposal and we are on the wrong path entirely.
 *
 * Returns true only on that positive identification. Anything else — the node
 * has not seen it yet, or the lookup fails — is inconclusive and leaves the
 * caller polling, which is the correct behaviour for a Safe that is simply
 * still being indexed.
 */
async function hashIsRealTransaction(
  publicClient: PublicClient,
  hash: Hash,
): Promise<boolean> {
  const transaction = await publicClient
    .getTransaction({ hash })
    .catch(() => null);
  return transaction !== null;
}

async function pollSafeTransactionServiceUntilExecuted({
  chainId,
  publicClient,
  safeTxHash,
  pollIntervalMs,
  timeoutMs,
}: {
  chainId: number;
  publicClient: PublicClient;
  safeTxHash: Hash;
  pollIntervalMs: number;
  timeoutMs: number;
}): Promise<SafePollOutcome> {
  const baseUrl = SAFE_TX_SERVICE_BASE_URLS[chainId];
  if (!baseUrl) {
    throw new Error(
      `Safe Transaction Service not configured for chainId ${chainId}. ` +
        `Connected wallet appears to be a smart-contract account, but this ` +
        `chain is not in the supported list. Either connect an EOA or extend ` +
        `SAFE_TX_SERVICE_BASE_URLS in waitForTransactionReceiptSmartAware.ts.`,
    );
  }

  const url = `${baseUrl}${SAFE_MULTISIG_TX_PATH}/${safeTxHash}/`;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const controller = new AbortController();
    const fetchTimeoutId = setTimeout(
      () => controller.abort(),
      SAFE_TX_SERVICE_FETCH_TIMEOUT_MS,
    );

    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } catch (err) {
      // Transient failure (AbortError on per-request timeout, DNS hiccup,
      // connection reset, etc.). Log and continue to the next poll iteration
      // instead of consuming the entire safePollTimeoutMs budget on one blip.
      // The outer `while (Date.now() < deadline)` is what enforces the overall
      // budget; this catch deliberately preserves it.
      console.warn(
        `Safe Transaction Service request failed (will retry in ${pollIntervalMs}ms): ` +
          (err instanceof Error ? err.message : String(err)),
      );
      await sleep(pollIntervalMs);
      continue;
    } finally {
      clearTimeout(fetchTimeoutId);
    }

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
          return { kind: "executed", transactionHash: data.transactionHash };
        }
      }
    } else if (response.status === SAFE_TX_SERVICE_NOT_FOUND) {
      // Usually "proposal not indexed yet", so keep polling. But the very same
      // 404 appears when the hash is not a safeTxHash at all — the case that
      // used to burn the whole budget on an already-mined transaction. Ask the
      // node: if it knows this hash, it is a real transaction, so stop treating
      // it as a proposal and let the caller wait on it directly.
      if (await hashIsRealTransaction(publicClient, safeTxHash)) {
        console.warn(
          `${safeTxHash} is a real transaction, not a Safe proposal — the ` +
            `connected wallet submits its own transactions despite reporting ` +
            `contract bytecode. Waiting for its receipt directly.`,
        );
        return { kind: "not-a-proposal" };
      }
    } else if (response.status >= SAFE_TX_SERVICE_SERVER_ERROR) {
      // Transient server error — same treatment as a hung connection: log and retry.
      console.warn(
        `Safe Transaction Service returned ${response.status} for ${safeTxHash}; retrying in ${pollIntervalMs}ms.`,
      );
    } else {
      // Other 4xx (403, 410, etc.) is likely permanent — surface immediately.
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
