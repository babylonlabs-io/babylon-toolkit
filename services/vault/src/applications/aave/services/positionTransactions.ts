/**
 * Aave Position Transactions Service
 *
 * Orchestrates transaction operations for Aave positions.
 * Handles borrow, repay, withdraw, and reorder operations.
 */

import type {
  Address,
  Chain,
  Hash,
  Hex,
  TransactionReceipt,
  WalletClient,
} from "viem";
import { formatUnits, isAddressEqual, maxUint256, parseEventLogs } from "viem";

import { COPY } from "@/copy";
import { logger } from "@/infrastructure";

import { ERC20 } from "../../../clients/eth-contract";
import { ErrorCode, isSimulationPhaseError } from "../../../utils/errors";
import { AaveAdapterTx, AaveSpoke } from "../clients";
import { getAaveAdapterAddress } from "../config";
import { FULL_REPAY_BUFFER_DIVISOR } from "../constants";

/**
 * Borrow from a Core Spoke position
 *
 * @param walletClient - Connected wallet client
 * @param chain - Chain configuration
 * @param debtReserveId - Reserve ID for the asset to borrow
 * @param amount - Amount to borrow (in debt token decimals)
 * @returns Transaction result
 */
export async function borrow(
  walletClient: WalletClient,
  chain: Chain,
  debtReserveId: bigint,
  amount: bigint,
): Promise<{ transactionHash: Hash; receipt: TransactionReceipt }> {
  const userAddress = walletClient.account?.address;
  if (!userAddress) {
    throw new Error("Wallet address not available");
  }

  const result = await AaveAdapterTx.borrowFromCorePosition(
    walletClient,
    chain,
    getAaveAdapterAddress(),
    debtReserveId,
    amount,
    userAddress,
  );

  return {
    transactionHash: result.transactionHash,
    receipt: result.receipt,
  };
}

/**
 * Repay debt to a Core Spoke position (low-level)
 *
 * User must have approved the adapter to spend debt tokens first.
 * Uses the pinned adapter address from trusted environment config.
 *
 * @param walletClient - Connected wallet client
 * @param chain - Chain configuration
 * @param borrower - Borrower's address (for self-repay, use connected wallet address)
 * @param debtReserveId - Reserve ID for the debt token
 * @param amount - Amount to repay (in debt token decimals)
 * @returns Transaction result
 */
export async function repay(
  walletClient: WalletClient,
  chain: Chain,
  borrower: Address,
  debtReserveId: bigint,
  amount: bigint,
): Promise<{ transactionHash: Hash; receipt: TransactionReceipt }> {
  const adapterAddress = getAaveAdapterAddress();
  if (amount <= 0n) {
    throw new Error("Repay amount must be greater than 0");
  }

  const result = await AaveAdapterTx.repayToCorePosition(
    walletClient,
    chain,
    adapterAddress,
    borrower,
    debtReserveId,
    amount,
  );

  return {
    transactionHash: result.transactionHash,
    receipt: result.receipt,
  };
}

/** Display metadata for the debt token, used only in error copy. */
interface TokenDisplay {
  symbol: string;
  decimals: number;
}

type RepayResult = { transactionHash: Hash; receipt: TransactionReceipt };

/** Bounded fallback verification when the approve receipt has no usable Approval event. */
const ALLOWANCE_VERIFY_ATTEMPTS = 3;
const ALLOWANCE_VERIFY_RETRY_DELAY_MS = 2000;

/** Delay before retrying a repay whose simulation hit a stale backend. */
const REPAY_STALE_SIM_RETRY_DELAY_MS = 3000;

/** Decoded reason for the OZ allowance revert (always in COMMON_ERROR_ABI). */
const ERC20_INSUFFICIENT_ALLOWANCE_REASON = "ERC20InsufficientAllowance";

/** Approval event ABI for parsing the approve receipt's logs. */
const ERC20_APPROVAL_EVENT_ABI = [
  {
    type: "event",
    name: "Approval",
    inputs: [
      { indexed: true, name: "owner", type: "address" },
      { indexed: true, name: "spender", type: "address" },
      { indexed: false, name: "value", type: "uint256" },
    ],
  },
] as const;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatTokenAmount(amount: bigint, token: TokenDisplay): string {
  return `${formatUnits(amount, token.decimals)} ${token.symbol}`;
}

/**
 * Send the approval and verify it from its own mined receipt's Approval event
 * — the receipt is chain truth for this tx, immune to a load-balanced RPC
 * serving pre-block state on a follow-up read. The read-based fallback covers
 * receipts without a matching event: wallet-replaced txs (cancel / speed-up
 * resolve to the replacement's receipt) and tokens that don't emit Approval.
 */
async function approveAndVerify(
  walletClient: WalletClient,
  chain: Chain,
  tokenAddress: Address,
  ownerAddress: Address,
  spenderAddress: Address,
  requiredAmount: bigint,
  token: TokenDisplay,
): Promise<void> {
  const { receipt } = await ERC20.approveERC20(
    walletClient,
    chain,
    tokenAddress,
    spenderAddress,
    requiredAmount,
  );

  const approvalLogs = parseEventLogs({
    abi: ERC20_APPROVAL_EVENT_ABI,
    logs: receipt.logs,
    eventName: "Approval",
  });
  // Last match wins: a Safe batch execution can carry sibling Approval logs.
  const matched = approvalLogs
    .filter(
      (log) =>
        isAddressEqual(log.address, tokenAddress) &&
        isAddressEqual(log.args.owner, ownerAddress) &&
        isAddressEqual(log.args.spender, spenderAddress),
    )
    .at(-1);

  if (matched) {
    if (matched.args.value >= requiredAmount) return;
    // Deterministic shortfall — e.g. the user edited the wallet's spending
    // cap below what the repay needs. No retry can fix it.
    throw new Error(
      COPY.loans.repay.approvalBelowRequired(
        formatTokenAmount(requiredAmount, token),
        formatTokenAmount(matched.args.value, token),
      ),
    );
  }

  let observed = 0n;
  for (let attempt = 0; attempt < ALLOWANCE_VERIFY_ATTEMPTS; attempt++) {
    if (attempt > 0) await wait(ALLOWANCE_VERIFY_RETRY_DELAY_MS);
    observed = await ERC20.getERC20Allowance(
      tokenAddress,
      ownerAddress,
      spenderAddress,
    );
    if (observed >= requiredAmount) return;
  }
  throw new Error(
    COPY.loans.repay.approvalNotConfirmed(
      formatTokenAmount(requiredAmount, token),
      formatTokenAmount(observed, token),
    ),
  );
}

/**
 * Ensure the adapter can pull `requiredAmount`, approving when the current
 * allowance is short. Returns whether an approve was actually sent so the
 * repay retry can force one if the short-circuit read turns out stale.
 */
async function ensureAllowance(
  walletClient: WalletClient,
  chain: Chain,
  tokenAddress: Address,
  ownerAddress: Address,
  spenderAddress: Address,
  requiredAmount: bigint,
  token: TokenDisplay,
): Promise<{ approveSent: boolean }> {
  const currentAllowance = await ERC20.getERC20Allowance(
    tokenAddress,
    ownerAddress,
    spenderAddress,
  );
  if (currentAllowance >= requiredAmount) return { approveSent: false };

  await approveAndVerify(
    walletClient,
    chain,
    tokenAddress,
    ownerAddress,
    spenderAddress,
    requiredAmount,
    token,
  );
  return { approveSent: true };
}

/**
 * True for an ERC20InsufficientAllowance raised at pre-flight simulation:
 * nothing was signed or broadcast, so with a receipt-verified approval it can
 * only mean the simulating backend has not caught up to the approve block.
 */
function isStaleAllowanceSimulationError(err: unknown): boolean {
  return (
    isSimulationPhaseError(err) &&
    err.code === ErrorCode.CONTRACT_REVERT &&
    err.reason === ERC20_INSUFFICIENT_ALLOWANCE_REASON
  );
}

/**
 * Run the repay, absorbing stale-backend allowance reverts at simulation:
 * three attempts with catch-up delays on every path. When the approve was
 * short-circuited (a stale HIGH allowance read can skip a genuinely needed
 * approve), the second failure forces the approve before the last attempt; a
 * receipt-verified approve can't be improved on, so that path just
 * re-simulates. Mined reverts and all other errors propagate untouched —
 * auto-retrying a broadcast tx would re-prompt the wallet.
 * Note: repayMaxCapped can revert here legitimately (accrued interest pushed
 * debt past the approved balance cap); indistinguishable from staleness, so
 * the retries delay that error and the short-circuit branch spends one no-op
 * forceApprove prompt (plus its gas) before it surfaces — consciously accepted.
 */
async function repayWithStaleSimulationRetry(params: {
  execute: () => Promise<RepayResult>;
  approveSent: boolean;
  forceApprove: () => Promise<void>;
}): Promise<RepayResult> {
  const { execute, approveSent, forceApprove } = params;

  try {
    return await execute();
  } catch (firstError) {
    if (!isStaleAllowanceSimulationError(firstError)) throw firstError;
    logger.warn("Repay simulation saw a stale allowance; retrying", {
      data: { attempt: 1, approveSent },
    });
    await wait(REPAY_STALE_SIM_RETRY_DELAY_MS);
  }

  try {
    return await execute();
  } catch (secondError) {
    if (!isStaleAllowanceSimulationError(secondError)) throw secondError;
    logger.warn("Repay simulation saw a stale allowance; retrying", {
      data: { attempt: 2, approveSent },
    });
    // Approve was skipped on a possibly stale-high read; force it once.
    if (!approveSent) await forceApprove();
    await wait(REPAY_STALE_SIM_RETRY_DELAY_MS);
  }

  return execute();
}

/**
 * Repay a partial amount of debt
 *
 * Handles approval if needed, then executes repay.
 * Uses the pinned adapter address from trusted environment config.
 *
 * @param walletClient - Connected wallet client
 * @param chain - Chain configuration
 * @param debtReserveId - Reserve ID for the debt token
 * @param tokenAddress - Token address for the debt
 * @param amount - Amount to repay (in debt token decimals)
 * @returns Transaction result
 */
export async function repayPartial(
  walletClient: WalletClient,
  chain: Chain,
  debtReserveId: bigint,
  tokenAddress: Address,
  amount: bigint,
  token: TokenDisplay,
): Promise<{ transactionHash: Hash; receipt: TransactionReceipt }> {
  const userAddress = walletClient.account?.address;
  if (!userAddress) {
    throw new Error("Wallet address not available");
  }

  const adapterAddress = getAaveAdapterAddress();

  const userBalance = await ERC20.getERC20Balance(tokenAddress, userAddress);
  if (userBalance < amount) {
    throw new Error(
      "insufficient balance to repay: not enough token balance for the requested amount",
    );
  }

  const { approveSent } = await ensureAllowance(
    walletClient,
    chain,
    tokenAddress,
    userAddress,
    adapterAddress,
    amount,
    token,
  );

  return repayWithStaleSimulationRetry({
    execute: () =>
      repay(walletClient, chain, userAddress, debtReserveId, amount),
    approveSent,
    forceApprove: () =>
      approveAndVerify(
        walletClient,
        chain,
        tokenAddress,
        userAddress,
        adapterAddress,
        amount,
        token,
      ),
  });
}

/**
 * Clear the full debt for the `debt ≤ balance < debt × (1 + buffer)` case
 * (`pickRepayParams` only routes here when `balance ≥ debt`). Sends `maxUint256`
 * (Aave's repay-all sentinel) so the adapter clears the current debt incl.
 * interest accrued before broadcast, but caps the approval at `balanceAmount` —
 * if accrual pushes debt past the balance the tx reverts cleanly, not silent dust.
 *
 * @param balanceAmount - User's full balance; approved as the cap (amount sent is `maxUint256`)
 */
export async function repayMaxCapped(
  walletClient: WalletClient,
  chain: Chain,
  debtReserveId: bigint,
  tokenAddress: Address,
  balanceAmount: bigint,
  token: TokenDisplay,
): Promise<{ transactionHash: Hash; receipt: TransactionReceipt }> {
  const userAddress = walletClient.account?.address;
  if (!userAddress) {
    throw new Error("Wallet address not available");
  }

  if (balanceAmount <= 0n) {
    throw new Error("Repay amount must be greater than 0");
  }

  const adapterAddress = getAaveAdapterAddress();

  const { approveSent } = await ensureAllowance(
    walletClient,
    chain,
    tokenAddress,
    userAddress,
    adapterAddress,
    balanceAmount,
    token,
  );

  return repayWithStaleSimulationRetry({
    execute: () =>
      repay(walletClient, chain, userAddress, debtReserveId, maxUint256),
    approveSent,
    forceApprove: () =>
      approveAndVerify(
        walletClient,
        chain,
        tokenAddress,
        userAddress,
        adapterAddress,
        balanceAmount,
        token,
      ),
  });
}

/**
 * Repay all debt for a reserve
 *
 * Fetches exact debt from contract, handles approval, then repays.
 * Uses pinned adapter and spoke addresses from trusted environment config.
 *
 * Approval/refund: the adapter pulls the full `currentDebt × (1 + buffer)`,
 * routes the actual debt, and refunds the unused buffer in the same tx.
 * Residual allowance after the tx = 0; no `approve(0)` cleanup needed.
 *
 * @param walletClient - Connected wallet client
 * @param chain - Chain configuration
 * @param debtReserveId - Reserve ID for the debt token
 * @param tokenAddress - Token address for the debt
 * @param proxyContract - User's proxy contract address
 * @returns Transaction result
 */
export async function repayFull(
  walletClient: WalletClient,
  chain: Chain,
  debtReserveId: bigint,
  tokenAddress: Address,
  proxyContract: Address,
  token: TokenDisplay,
): Promise<{ transactionHash: Hash; receipt: TransactionReceipt }> {
  const userAddress = walletClient.account?.address;
  if (!userAddress) {
    throw new Error("Wallet address not available");
  }

  const adapterAddress = getAaveAdapterAddress();
  const spokeAddress = await AaveAdapterTx.getCoreSpokeAddress(adapterAddress);

  // Fetch current debt from the contract
  const currentDebt = await AaveSpoke.getUserTotalDebt(
    spokeAddress,
    debtReserveId,
    proxyContract,
  );

  if (currentDebt === 0n) {
    throw new Error("No debt to repay");
  }

  // Ceiling division guarantees ≥ 1 base unit of buffer even for dust-scale
  // debts where the percentage math would floor to 0.
  const bufferDelta =
    (currentDebt + FULL_REPAY_BUFFER_DIVISOR - 1n) / FULL_REPAY_BUFFER_DIVISOR;
  const amountToRepay = currentDebt + bufferDelta;

  const userBalance = await ERC20.getERC20Balance(tokenAddress, userAddress);
  if (userBalance < amountToRepay) {
    throw new Error(
      "insufficient balance to fully repay: not enough stablecoin to cover the debt plus interest",
    );
  }

  const { approveSent } = await ensureAllowance(
    walletClient,
    chain,
    tokenAddress,
    userAddress,
    adapterAddress,
    amountToRepay,
    token,
  );

  return repayWithStaleSimulationRetry({
    execute: () =>
      repay(walletClient, chain, userAddress, debtReserveId, amountToRepay),
    approveSent,
    forceApprove: () =>
      approveAndVerify(
        walletClient,
        chain,
        tokenAddress,
        userAddress,
        adapterAddress,
        amountToRepay,
        token,
      ),
  });
}

/**
 * Withdraw selected vaults from a position
 *
 * Position must have zero debt before withdrawal.
 * Withdraws only the specified vaults and redeems them back to the depositor.
 *
 * @param walletClient - Connected wallet client
 * @param chain - Chain configuration
 * @param vaultIds - Array of vault IDs (bytes32 hex strings) to withdraw
 * @returns Transaction result
 */
export async function withdrawSelectedCollateral(
  walletClient: WalletClient,
  chain: Chain,
  vaultIds: Hex[],
): Promise<{ transactionHash: Hash; receipt: TransactionReceipt }> {
  const result = await AaveAdapterTx.withdrawCollaterals(
    walletClient,
    chain,
    getAaveAdapterAddress(),
    vaultIds,
  );

  return {
    transactionHash: result.transactionHash,
    receipt: result.receipt,
  };
}

/**
 * Reorder vaults for liquidation priority
 *
 * Changes the prefix ordering of vaults on-chain. Vaults at lower indices
 * are seized first during liquidation. The permuted array must contain
 * exactly the same vault IDs as the current position, in the desired new order.
 *
 * @param walletClient - Connected wallet client
 * @param chain - Chain configuration
 * @param permutedVaultIds - Vault IDs in desired new order (must be a permutation)
 * @returns Transaction result
 */
export async function reorderVaultOrder(
  walletClient: WalletClient,
  chain: Chain,
  permutedVaultIds: Hex[],
): Promise<{ transactionHash: Hash; receipt: TransactionReceipt }> {
  const result = await AaveAdapterTx.reorderVaults(
    walletClient,
    chain,
    getAaveAdapterAddress(),
    permutedVaultIds,
  );

  return {
    transactionHash: result.transactionHash,
    receipt: result.receipt,
  };
}
