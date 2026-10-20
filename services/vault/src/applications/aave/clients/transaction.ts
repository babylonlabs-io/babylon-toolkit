/**
 * Aave Integration Adapter - Write operations (transactions)
 *
 * Vault-side wrapper that uses SDK transaction builders and executes with vault's wallet client.
 * Only includes Core Spoke operations for regular users (no Arbitrageur operations).
 */

import { BTCVaultRegistryABI } from "@babylonlabs-io/ts-sdk/tbv/core";
import { waitForTransactionReceiptSmartAware } from "@babylonlabs-io/ts-sdk/tbv/core/utils";
import {
  AaveAdapterPositionProxyABI,
  AaveIntegrationAdapterABI,
  AaveSpokeABI,
  buildBorrowTx,
  buildReorderVaultsTx,
  buildRepayTx,
  buildWithdrawCollateralsTx,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import { type Address, type Chain, type Hex, type WalletClient } from "viem";

import { COPY } from "@/copy";

import { waitForCanonicalReceipt } from "../../../clients/eth-contract/canonicalReceipt";
import { ethClient } from "../../../clients/eth-contract/client";
import {
  isProposalExecution,
  judgeSafeExecution,
} from "../../../clients/eth-contract/safeExecution";
import {
  throwRevertError,
  type TransactionResult,
} from "../../../clients/eth-contract/transactionFactory";
import {
  assertReceiptIsForSentCall,
  readBroadcastPosition,
} from "../../../clients/eth-contract/transactionReplacement";
import {
  sendWithStaleNonceRetry,
  waitForWalletToCountTransaction,
} from "../../../clients/eth-contract/walletNonce";
import {
  ContractError,
  ErrorCode,
  UnconfirmedTransactionError,
  isDefinitiveReceiptWaitFailure,
  isSimulationPhaseError,
  mapViemErrorToContractError,
  tagMinedRevert,
  tagSimulationPhase,
} from "../../../utils/errors";
import { AAVE_WRITE_CONFIRMATIONS, RECEIPT_WAIT_ROUND_MS } from "../constants";

/**
 * ABIs consulted when decoding a revert on the Aave paths.
 *
 * The adapter alone is not enough: a withdraw or borrow reverts inside the Aave
 * Core Spoke (health-factor floor, dust rule, frozen/paused reserve) or in the
 * per-position proxy. The Spoke's calls into its Hubs revert with Hub errors
 * (draw cap, liquidity, halted spoke), which the mapper's vault error fallback
 * decodes.
 */
const AAVE_REVERT_DECODING_ABIS = [
  AaveIntegrationAdapterABI,
  AaveSpokeABI,
  AaveAdapterPositionProxyABI,
  BTCVaultRegistryABI,
];

/**
 * Read the Core Spoke address from the controller contract.
 *
 * BTC_VAULT_CORE_SPOKE is an immutable property on the AaveIntegrationAdapter.
 * Reading it on-chain from the trusted adapter guarantees the spoke address
 * is not influenced by untrusted external sources (e.g. GraphQL indexer).
 *
 * @param controllerAddress - Trusted AaveIntegrationAdapter address
 * @returns Core Spoke contract address
 */
export async function getCoreSpokeAddress(
  controllerAddress: Address,
): Promise<Address> {
  const publicClient = ethClient.getPublicClient();
  return publicClient.readContract({
    address: controllerAddress,
    abi: AaveIntegrationAdapterABI,
    functionName: "BTC_VAULT_CORE_SPOKE",
    args: [],
  }) as Promise<Address>;
}

/**
 * Read the vBTC reserve ID from the controller contract.
 *
 * VAULT_BTC_RESERVE_ID is an immutable property on the AaveIntegrationAdapter.
 * Reading it on-chain from the trusted adapter guarantees the reserve ID is not
 * influenced by untrusted external sources (e.g. GraphQL indexer), which would
 * otherwise be able to point collateral and liquidation math at the wrong
 * reserve.
 *
 * @param controllerAddress - Trusted AaveIntegrationAdapter address
 * @returns vBTC reserve ID on the Core Spoke
 */
export async function getVaultBtcReserveId(
  controllerAddress: Address,
): Promise<bigint> {
  const publicClient = ethClient.getPublicClient();
  return publicClient.readContract({
    address: controllerAddress,
    abi: AaveIntegrationAdapterABI,
    functionName: "VAULT_BTC_RESERVE_ID",
    args: [],
  }) as Promise<bigint>;
}

/**
 * Simulate a transaction to catch errors before sending
 *
 * Uses eth_call to simulate the transaction against current blockchain state.
 * No signature required - this is a read-only operation.
 *
 * @throws Error with revert reason if simulation fails
 */
async function simulateTx(
  to: Address,
  data: Hex,
  account: Address,
): Promise<void> {
  const publicClient = ethClient.getPublicClient();

  // eth_call simulates the transaction without submitting
  // If it reverts, we get the error data back
  await publicClient.call({
    to,
    data,
    account,
  });
}

/**
 * Execute a transaction using encoded data from SDK
 *
 * Performs pre-flight simulation first to catch errors before user signs.
 * The outcome is judged only once the transaction is AAVE_WRITE_CONFIRMATIONS
 * deep on the chain, from its receipt as re-read then.
 *
 * @param onIncluded - Called once the transaction is first seen mined, before
 *   the wait for that depth (for a form that labels that wait).
 * @throws UnconfirmedTransactionError when the transaction was broadcast but
 *   the receipt wait ended without an answer (a timeout, an RPC failure or
 *   lag, or a Safe Transaction Service error), or its receipt did not reach
 *   that depth within RECEIPT_WAIT_ROUND_MS (its block was reorganized out, or
 *   the RPC lagged). It may still be mined. Also when a Safe proposal's
 *   execution reverted, names another proposal, or logs nothing for it: the
 *   proposal may still take effect.
 * @throws TransactionReplacedError when the wallet replaced the transaction
 *   with a cancel or a different call.
 * @throws ContractError when the transaction reverted (not a Safe proposal's
 *   execution), or a Safe's own call failed inside it.
 * @throws SendOutcomeUnknownError when the wallet refused the send as "nonce
 *   too low" without proof that it was never broadcast. It may still be mined.
 */
async function executeTx(
  walletClient: WalletClient,
  chain: Chain,
  to: Address,
  data: Hex,
  errorContext: string,
  onIncluded?: () => void,
): Promise<TransactionResult> {
  const account = walletClient.account?.address;

  if (!account) {
    throw new Error(COPY.wallet.connectToContinue);
  }

  const publicClient = ethClient.getPublicClient();

  // Pre-flight simulation - catches errors before user signs
  const simulate = async () => {
    try {
      await simulateTx(to, data, account);
    } catch (error) {
      // Tagged so callers can safely auto-retry: nothing that can still be
      // mined was sent, and the failure may be a lagging RPC backend, not the
      // chain.
      throw tagSimulationPhase(
        mapViemErrorToContractError(
          error,
          errorContext,
          AAVE_REVERT_DECODING_ABIS,
        ),
      );
    }
  };
  await simulate();

  const mapError = (error: unknown) =>
    mapViemErrorToContractError(error, errorContext, AAVE_REVERT_DECODING_ABIS);

  // Simulation passed, now send the actual transaction. A send the wallet
  // signed with a nonce used before it started is simulated and sent once
  // more.
  const hash = await sendWithStaleNonceRetry({
    walletClient,
    publicClient,
    account,
    send: (submissionClient) =>
      submissionClient.sendTransaction({
        to,
        data,
        chain,
        account: walletClient.account!,
      }),
    prepare: simulate,
  }).catch((error: unknown) => {
    // The simulation re-run before a stale-nonce retry is already mapped.
    if (isSimulationPhaseError(error)) throw error;
    throw mapError(error);
  });

  // From here on the transaction has been broadcast. A wait that ends without
  // a receipt says nothing about whether it will be mined, so it is not a
  // failure: the caller keeps the hash and keeps waiting.
  const broadcast = { hash, from: account, to, data };
  // Read while the original is still in the node's pool: a wallet speed-up or
  // cancel drops it, and its nonce is then lost (see transactionReplacement.ts).
  const position = readBroadcastPosition(publicClient, hash, account);

  // Smart-account-aware: Externally Owned Account (EOA) wallets — controlled
  // by a single private key, e.g. MetaMask — resolve via the real tx hash
  // directly. Safe-style multisigs return a `safeTxHash` here that requires
  // polling the Safe Transaction Service before the on-chain receipt exists.
  const firstReceipt = await waitForTransactionReceiptSmartAware({
    publicClient,
    walletAddress: account,
    hash,
    // The SDK would poll a Safe proposal for hours while the account's Aave
    // lock is held with no "Stop waiting". Bounded, a proposal still in the
    // queue ends this wait as unconfirmed and the lock's own watch takes over.
    safePollTimeoutMs: RECEIPT_WAIT_ROUND_MS,
  }).catch(async (error: unknown) => {
    // Only a Safe transaction that executed and reverted is an answer; any
    // other failed wait leaves the outcome unknown.
    if (isDefinitiveReceiptWaitFailure(error)) throw mapError(error);
    throw new UnconfirmedTransactionError(mapError(error), {
      ...broadcast,
      ...(await position),
    });
  });
  onIncluded?.();

  // The first receipt can be from a block that is then reorganized out, and a
  // transaction mined again after that can end differently. Every check below
  // reads the receipt as re-read at depth: a cancel reorganized out (with the
  // original mined instead) is not reported as canceled, and a revert mined
  // again as a success is not reported as failed, which would invite a second
  // borrow. One that does not reach that depth in a round is still unknown.
  const receipt = await waitForCanonicalReceipt({
    publicClient,
    receipt: firstReceipt,
    confirmations: AAVE_WRITE_CONFIRMATIONS,
    timeoutMs: RECEIPT_WAIT_ROUND_MS,
  }).catch(async (error: unknown) => {
    throw new UnconfirmedTransactionError(mapError(error), {
      ...broadcast,
      ...(await position),
    });
  });

  // A cancel in the wallet comes back as the cancel's own successful receipt.
  await assertReceiptIsForSentCall({ publicClient, receipt, sent: broadcast });

  // Before the flow asks the wallet for its next transaction (a repay's
  // approve is followed straight away by the repay), let the wallet's own
  // node count this one, so it does not reuse the nonce.
  await waitForWalletToCountTransaction({
    walletClient,
    publicClient,
    account,
    receipt,
  });

  if (receipt.status === "reverted") {
    // A Safe proposal's execution that reverted did not take effect, but the
    // proposal still can, and may already have: its hash commits to the
    // Safe's nonce, so an execution mined after another executor's run of
    // the same proposal reverts while the proposal succeeded. The watch asks
    // the Safe Transaction Service again for the execution that took effect.
    if (isProposalExecution(receipt, account, hash)) {
      throw new UnconfirmedTransactionError(
        mapError(
          new Error(
            `Safe execution ${receipt.transactionHash} of proposal ${hash} did not take effect`,
          ),
        ),
        { ...broadcast, ...(await position) },
      );
    }
    // The receipt says reverted, so this is a definite failure even when
    // diagnosing the revert fails too.
    await throwRevertError(
      publicClient,
      receipt,
      receipt.transactionHash,
      to,
      data,
      account,
    ).catch((error: unknown) => {
      throw tagMinedRevert(mapError(error));
    });
  }

  // A Safe's own call can fail inside a successful outer execution, and its
  // verdict is read from the receipt at depth (see safeExecution.ts). An
  // execution that names another proposal, or logs nothing for it, leaves
  // this one's outcome unknown.
  const safeExecution = await judgeSafeExecution(
    publicClient,
    receipt,
    account,
    hash,
  );
  if (safeExecution === "failed") {
    throw new ContractError(
      COPY.common.unconfirmedTransaction.reverted,
      ErrorCode.CONTRACT_REVERT,
      receipt.transactionHash,
    );
  }
  if (safeExecution === "unknown") {
    throw new UnconfirmedTransactionError(
      mapError(
        new Error(
          `Safe execution ${receipt.transactionHash} holds no verdict for proposal ${hash}`,
        ),
      ),
      { ...broadcast, ...(await position) },
    );
  }

  return {
    transactionHash: receipt.transactionHash,
    receipt,
  };
}

/**
 * Withdraw selected vaults from position
 *
 * Withdraws specific vaults (partial withdrawal) and redeems them.
 * Position must have zero debt before withdrawal.
 *
 * @param walletClient - Connected wallet client for signing transactions
 * @param chain - Chain configuration
 * @param contractAddress - AaveIntegrationAdapter contract address
 * @param vaultIds - Array of vault IDs (bytes32 hex strings) to withdraw
 * @param onIncluded - Called once the transaction is first seen mined
 * @returns Transaction result with hash and receipt
 */
export async function withdrawCollaterals(
  walletClient: WalletClient,
  chain: Chain,
  contractAddress: Address,
  vaultIds: Hex[],
  onIncluded: () => void,
): Promise<TransactionResult> {
  const { to, data } = buildWithdrawCollateralsTx(contractAddress, vaultIds);
  return executeTx(
    walletClient,
    chain,
    to,
    data,
    "withdraw selected collateral from Aave position",
    onIncluded,
  );
}

/**
 * Borrow from Core Spoke position
 *
 * Borrows assets against vBTC collateral position.
 *
 * @param walletClient - Connected wallet client for signing transactions
 * @param chain - Chain configuration
 * @param contractAddress - AaveIntegrationAdapter contract address
 * @param debtReserveId - Aave reserve ID for the debt asset
 * @param amount - Amount to borrow
 * @param receiver - Address to receive borrowed tokens
 * @param onIncluded - Called once the transaction is first seen mined
 * @returns Transaction result with hash and receipt
 */
export async function borrowFromCorePosition(
  walletClient: WalletClient,
  chain: Chain,
  contractAddress: Address,
  debtReserveId: bigint,
  amount: bigint,
  receiver: Address,
  onIncluded: () => void,
): Promise<TransactionResult> {
  const { to, data } = buildBorrowTx(
    contractAddress,
    debtReserveId,
    amount,
    receiver,
  );
  return executeTx(
    walletClient,
    chain,
    to,
    data,
    "borrow from Aave Core position",
    onIncluded,
  );
}

/**
 * Repay debt to Core Spoke position
 *
 * Repays debt on a position. User must have approved the adapter to spend
 * the debt token.
 *
 * @param walletClient - Connected wallet client for signing transactions
 * @param chain - Chain configuration
 * @param contractAddress - AaveIntegrationAdapter contract address
 * @param borrower - Borrower's address (for self-repay, use connected wallet address)
 * @param debtReserveId - Aave reserve ID for the debt asset
 * @param amount - Amount to repay
 * @param onIncluded - Called once the transaction is first seen mined
 * @returns Transaction result with hash and receipt
 */
export async function repayToCorePosition(
  walletClient: WalletClient,
  chain: Chain,
  contractAddress: Address,
  borrower: Address,
  debtReserveId: bigint,
  amount: bigint,
  onIncluded: () => void,
): Promise<TransactionResult> {
  const { to, data } = buildRepayTx(
    contractAddress,
    borrower,
    debtReserveId,
    amount,
  );
  return executeTx(
    walletClient,
    chain,
    to,
    data,
    "repay to Aave Core position",
    onIncluded,
  );
}

/**
 * Reorder vaults for liquidation priority
 *
 * Changes the prefix ordering of vaults. Vaults at lower indices
 * are seized first during liquidation.
 *
 * @param walletClient - Connected wallet client for signing transactions
 * @param chain - Chain configuration
 * @param contractAddress - AaveIntegrationAdapter contract address
 * @param permutedVaultIds - Vault IDs in desired new order (must be a permutation of current vaults)
 * @returns Transaction result with hash and receipt
 */
export async function reorderVaults(
  walletClient: WalletClient,
  chain: Chain,
  contractAddress: Address,
  permutedVaultIds: Hex[],
): Promise<TransactionResult> {
  const { to, data } = buildReorderVaultsTx(contractAddress, permutedVaultIds);
  return executeTx(
    walletClient,
    chain,
    to,
    data,
    "reorder vaults in Aave position",
  );
}
