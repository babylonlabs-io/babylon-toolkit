/**
 * Aave Integration Controller - Write operations (transactions)
 *
 * Vault-side wrapper that uses SDK transaction builders and executes with vault's wallet client.
 * Only includes Core Spoke operations for regular users (no Arbitrageur operations).
 */

import { BTCVaultsManagerABI } from "@babylonlabs-io/ts-sdk/tbv/core";
import {
  AaveIntegrationControllerABI,
  buildBorrowTx,
  buildRepayTx,
  buildWithdrawAllCollateralTx,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import { type Address, type Chain, type Hex, type WalletClient } from "viem";

import { ethClient } from "../../../clients/eth-contract/client";
import { type TransactionResult } from "../../../clients/eth-contract/transactionFactory";
import { mapViemErrorToContractError } from "../../../utils/errors";

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
 */
async function executeTx(
  walletClient: WalletClient,
  chain: Chain,
  to: Address,
  data: Hex,
  errorContext: string,
): Promise<TransactionResult> {
  const publicClient = ethClient.getPublicClient();
  const account = walletClient.account?.address;

  if (!account) {
    throw new Error("Wallet account not available");
  }

  try {
    // Pre-flight simulation - catches errors before user signs
    await simulateTx(to, data, account);

    // Simulation passed, now send the actual transaction
    const hash = await walletClient.sendTransaction({
      to,
      data,
      chain,
      account: walletClient.account!,
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
    // Include both ABIs for comprehensive error decoding
    // AaveIntegrationController may call into BTCVaultsManager
    throw mapViemErrorToContractError(error, errorContext, [
      AaveIntegrationControllerABI,
      BTCVaultsManagerABI,
    ]);
  }
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
 * @returns Transaction result with hash and receipt
 */
export async function withdrawAllCollateralFromCorePosition(
  walletClient: WalletClient,
  chain: Chain,
  contractAddress: Address,
): Promise<TransactionResult> {
  const { to, data } = buildWithdrawAllCollateralTx(contractAddress);
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
 * @param debtReserveId - Aave reserve ID for the debt asset
 * @param amount - Amount to borrow
 * @param receiver - Address to receive borrowed tokens
 * @returns Transaction result with hash and receipt
 */
export async function borrowFromCorePosition(
  walletClient: WalletClient,
  chain: Chain,
  contractAddress: Address,
  debtReserveId: bigint,
  amount: bigint,
  receiver: Address,
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
 * @param borrower - Borrower's address (for self-repay, use connected wallet address)
 * @param debtReserveId - Aave reserve ID for the debt asset
 * @param amount - Amount to repay
 * @returns Transaction result with hash and receipt
 */
export async function repayToCorePosition(
  walletClient: WalletClient,
  chain: Chain,
  contractAddress: Address,
  borrower: Address,
  debtReserveId: bigint,
  amount: bigint,
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
  );
}
