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
 * therefore classified as EOAs, and the Safe path additionally confirms the
 * address really is a Safe the first time a 404 makes the proposal ambiguous.
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
const SAFE_TX_SERVICE_FETCH_TIMEOUT_MS = 10_000;

/** Safe Transaction Service route for one multisig-transaction proposal. */
const SAFE_MULTISIG_TX_PATH = "/api/v1/multisig-transactions";
/** Safe Transaction Service route for a single Safe account. */
const SAFE_ACCOUNT_PATH = "/api/v1/safes";
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
  const realTxHash = await pollSafeTransactionServiceUntilExecuted({
    chainId,
    walletAddress,
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

/**
 * Refuse to keep polling unless the address really is a Safe.
 *
 * A misclassified account produces a hash the Transaction Service has never
 * heard of, and its 404 is indistinguishable from "proposal not yet indexed" —
 * so the poll runs to the full budget and reports a timeout, hours after a
 * transaction that in fact succeeded. Resolving that ambiguity once, on the
 * first 404, turns it into an immediate and accurate error.
 *
 * Only a definitive 404 is treated as proof. Any other outcome (network
 * failure, 5xx, an unexpected status) is inconclusive, so we warn and let the
 * poll proceed rather than break a genuine Safe user on a flaky service.
 */
async function assertAddressIsSafe({
  baseUrl,
  walletAddress,
}: {
  baseUrl: string;
  walletAddress: Address;
}): Promise<void> {
  const url = `${baseUrl}${SAFE_ACCOUNT_PATH}/${walletAddress}/`;
  const controller = new AbortController();
  const fetchTimeoutId = setTimeout(
    () => controller.abort(),
    SAFE_TX_SERVICE_FETCH_TIMEOUT_MS,
  );

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (err) {
    console.warn(
      `Could not confirm ${walletAddress} is a Safe (${
        err instanceof Error ? err.message : String(err)
      }); proceeding with the proposal poll.`,
    );
    return;
  } finally {
    clearTimeout(fetchTimeoutId);
  }

  if (response.status === SAFE_TX_SERVICE_NOT_FOUND) {
    throw new Error(
      `${walletAddress} reports contract bytecode but is not a Safe known to ` +
        `the Safe Transaction Service, so the transaction hash cannot be a ` +
        `safeTxHash and waiting for a Safe proposal would never resolve. If ` +
        `this is a smart-account wallet of another kind, its receipt handling ` +
        `needs to be added to waitForTransactionReceiptSmartAware.ts.`,
    );
  }
}

async function pollSafeTransactionServiceUntilExecuted({
  chainId,
  walletAddress,
  safeTxHash,
  pollIntervalMs,
  timeoutMs,
}: {
  chainId: number;
  walletAddress: Address;
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

  const url = `${baseUrl}${SAFE_MULTISIG_TX_PATH}/${safeTxHash}/`;
  const deadline = Date.now() + timeoutMs;
  // The "is this actually a Safe?" lookup runs at most once, and only if a 404
  // makes the proposal ambiguous — a healthy Safe never pays for it.
  let addressConfirmedSafe = false;

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
          return data.transactionHash;
        }
      }
    } else if (response.status === SAFE_TX_SERVICE_NOT_FOUND) {
      // Proposal not yet indexed — keep polling silently. But a 404 also looks
      // exactly like this when the hash is not a safeTxHash at all, so confirm
      // once that the address really is a Safe before spending the budget.
      if (!addressConfirmedSafe) {
        await assertAddressIsSafe({ baseUrl, walletAddress });
        addressConfirmedSafe = true;
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
