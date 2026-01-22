/**
 * Aave Integration Controller - Write operations (transactions)
 *
 * Vault-side wrapper that uses SDK transaction builders and executes with vault's wallet client.
 * Only includes Core Spoke operations for regular users (no Arbitrageur operations).
 */

import {
  buildAddCollateralTx,
  buildBorrowTx,
  buildDepositorRedeemTx,
  buildRepayTx,
  buildWithdrawAllCollateralTx,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import { type Address, type Chain, type Hex, type WalletClient } from "viem";

import { ethClient } from "../../../clients/eth-contract/client";
import { type TransactionResult } from "../../../clients/eth-contract/transactionFactory";
import { mapViemErrorToContractError } from "../../../utils/errors";

/**
 * Execute a transaction using encoded data from SDK
 */
async function executeTx(
  walletClient: WalletClient,
  chain: Chain,
  to: Address,
  data: Hex,
  errorContext: string,
): Promise<TransactionResult> {
  const publicClient = ethClient.getPublicClient();

  console.group("📡 [Transaction Execution]");
  console.log("Operation:", errorContext);
  console.log("To:", to);
  console.log("Calldata:", data);
  console.log("Calldata length:", data.length, "chars");
  console.log("Function selector:", data.slice(0, 10));
  console.log("Chain ID:", chain.id);
  console.log("From:", walletClient.account?.address);
  console.groupEnd();

  try {
    console.log("⏳ Sending transaction...");
    const hash = await walletClient.sendTransaction({
      to,
      data,
      chain,
      account: walletClient.account!,
    });

    console.log("✓ Transaction sent. Hash:", hash);
    console.log("⏳ Waiting for confirmation...");

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    console.group("📝 [Transaction Receipt]");
    console.log("Status:", receipt.status);
    console.log("Block:", receipt.blockNumber);
    console.log("Gas Used:", receipt.gasUsed.toString());
    console.log("Logs count:", receipt.logs.length);
    console.groupEnd();

    // Check if transaction was reverted
    if (receipt.status === "reverted") {
      console.error("❌ Transaction reverted on-chain");
      throw new Error(
        `Transaction reverted. Hash: ${hash}. Check the transaction on block explorer for details.`,
      );
    }

    return {
      transactionHash: hash,
      receipt,
    };
  } catch (error) {
    console.group("❌ [Transaction Error - Raw]");
    console.error("Error type:", typeof error);
    console.error("Error object:", error);
    console.error("Error constructor:", error?.constructor?.name);
    if (error && typeof error === "object") {
      const err = error as any;
      console.error("Properties:", Object.keys(err));
      if (err.shortMessage) console.error("Short message:", err.shortMessage);
      if (err.details) console.error("Details:", err.details);
      if (err.metaMessages) console.error("Meta messages:", err.metaMessages);
      if (err.cause) console.error("Cause:", err.cause);
      if (err.data) console.error("Data:", err.data);
      if (err.code) console.error("Code:", err.code);
    }
    console.groupEnd();

    throw mapViemErrorToContractError(error, errorContext);
  }
}

/**
 * Add collateral to Core Spoke position
 *
 * Creates a new position or adds to existing position for the given reserve.
 * User's proxy is deployed on first position creation.
 *
 * @param walletClient - Connected wallet client for signing transactions
 * @param chain - Chain configuration
 * @param contractAddress - AaveIntegrationController contract address
 * @param vaultIds - Array of vault IDs (pegin tx hashes) to use as collateral
 * @param reserveId - Aave reserve ID for the collateral
 * @returns Transaction result with position ID
 */
export async function addCollateralToCorePosition(
  walletClient: WalletClient,
  chain: Chain,
  contractAddress: Address,
  vaultIds: Hex[],
  reserveId: bigint,
): Promise<TransactionResult> {
  const { to, data } = buildAddCollateralTx(
    contractAddress,
    vaultIds,
    reserveId,
  );
  return executeTx(
    walletClient,
    chain,
    to,
    data,
    "add collateral to Aave Core position",
  );
}

/**
 * Withdraw all collateral from Core Spoke position
 *
 * Withdraws all vBTC collateral and releases vaults back to Available status.
 * Position must have zero debt before withdrawal.
 *
 * @param walletClient - Connected wallet client for signing transactions
 * @param chain - Chain configuration
 * @param contractAddress - AaveIntegrationController contract address
 * @param reserveId - Aave reserve ID for the collateral
 * @returns Transaction result with withdrawn amount
 */
export async function withdrawAllCollateralFromCorePosition(
  walletClient: WalletClient,
  chain: Chain,
  contractAddress: Address,
  reserveId: bigint,
): Promise<TransactionResult> {
  const { to, data } = buildWithdrawAllCollateralTx(contractAddress, reserveId);
  return executeTx(
    walletClient,
    chain,
    to,
    data,
    "withdraw all collateral from Aave Core position",
  );
}

/**
 * Borrow from Core Spoke position
 *
 * Borrows assets against vBTC collateral position.
 *
 * @param walletClient - Connected wallet client for signing transactions
 * @param chain - Chain configuration
 * @param contractAddress - AaveIntegrationController contract address
 * @param positionId - Position ID to borrow against
 * @param debtReserveId - Aave reserve ID for the debt asset
 * @param amount - Amount to borrow
 * @param receiver - Address to receive borrowed tokens
 * @returns Transaction result with borrowed shares and amount
 */
export async function borrowFromCorePosition(
  walletClient: WalletClient,
  chain: Chain,
  contractAddress: Address,
  positionId: Hex,
  debtReserveId: bigint,
  amount: bigint,
  receiver: Address,
): Promise<TransactionResult> {
  const { to, data } = buildBorrowTx(
    contractAddress,
    positionId,
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
  );
}

/**
 * Repay debt to Core Spoke position
 *
 * Repays debt on a position. User must have approved the controller to spend
 * the debt token.
 *
 * @param walletClient - Connected wallet client for signing transactions
 * @param chain - Chain configuration
 * @param contractAddress - AaveIntegrationController contract address
 * @param positionId - Position ID with debt
 * @param debtReserveId - Aave reserve ID for the debt asset
 * @param amount - Amount to repay
 * @returns Transaction result with repaid shares and amount
 */
export async function repayToCorePosition(
  walletClient: WalletClient,
  chain: Chain,
  contractAddress: Address,
  positionId: Hex,
  debtReserveId: bigint,
  amount: bigint,
): Promise<TransactionResult> {
  const { to, data } = buildRepayTx(
    contractAddress,
    positionId,
    debtReserveId,
    amount,
  );
  return executeTx(
    walletClient,
    chain,
    to,
    data,
    "repay to Aave Core position",
  );
}

/**
 * Redeem vault to vault provider (for original depositors)
 *
 * Only callable by the original depositor who still owns the vault.
 * Vault must be Available (not in use or already redeemed).
 *
 * @param walletClient - Connected wallet client for signing transactions
 * @param chain - Chain configuration
 * @param contractAddress - AaveIntegrationController contract address
 * @param vaultId - Vault ID to redeem
 * @returns Transaction result
 */
export async function depositorRedeem(
  walletClient: WalletClient,
  chain: Chain,
  contractAddress: Address,
  vaultId: Hex,
): Promise<TransactionResult> {
  const { to, data } = buildDepositorRedeemTx(contractAddress, vaultId);
  return executeTx(walletClient, chain, to, data, "depositor redeem vault");
}
