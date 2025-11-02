// BTC Vault Controller - Write operations (transactions)

import {
  type Address,
  type Chain,
  type Hash,
  type Hex,
  type TransactionReceipt,
  type WalletClient,
} from "viem";

import { mapViemErrorToContractError } from "../../../utils/errors";
import { ethClient } from "../client";

import BTCVaultControllerABI from "./abis/BTCVaultController.abi.json";

/**
 * Morpho market parameters
 */
export interface MarketParams {
  loanToken: Address;
  collateralToken: Address;
  oracle: Address;
  irm: Address;
  lltv: bigint;
}

/**
 * Submit a pegin request
 * @param walletClient - Connected wallet client for signing transactions
 * @param chain - Chain configuration
 * @param contractAddress - BTCVaultController contract address
 * @param unsignedPegInTx - Unsigned Bitcoin peg-in transaction
 * @param depositorBtcPubKey - Depositor's BTC public key (x-only, 32 bytes hex)
 * @param vaultProvider - Vault provider address
 * @returns Transaction hash and receipt
 */
export async function submitPeginRequest(
  walletClient: WalletClient,
  chain: Chain,
  contractAddress: Address,
  unsignedPegInTx: Hex,
  depositorBtcPubKey: Hex,
  vaultProvider: Address,
): Promise<{
  transactionHash: Hash;
  receipt: TransactionReceipt;
}> {
  const publicClient = ethClient.getPublicClient();

  try {
    const hash = await walletClient.writeContract({
      address: contractAddress,
      abi: BTCVaultControllerABI,
      functionName: "submitPeginRequest",
      args: [unsignedPegInTx, depositorBtcPubKey, vaultProvider],
      chain,
      account: walletClient.account!,
    });

    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
    });

    return {
      transactionHash: hash,
      receipt,
    };
  } catch (error) {
    throw mapViemErrorToContractError(error, "submit pegin request");
  }
}

/**
 * Add collateral to position (without borrowing)
 *
 * This function supports multi-vault collateral:
 * - Use multiple vault IDs to combine collateral from several deposits
 * - All vaults must belong to the same depositor
 * - First call creates the position, subsequent calls add to it
 * - No borrowing occurs, only deposits collateral
 *
 * @param walletClient - Connected wallet client for signing transactions
 * @param chain - Chain configuration
 * @param contractAddress - BTCVaultController contract address
 * @param vaultIds - Array of vault IDs (pegin transaction hashes) to use as collateral
 * @param marketParams - Morpho market parameters
 * @returns Transaction hash, receipt, and position ID
 */
export async function addCollateralToPosition(
  walletClient: WalletClient,
  chain: Chain,
  contractAddress: Address,
  vaultIds: Hex[],
  marketParams: MarketParams,
): Promise<{
  transactionHash: Hash;
  receipt: TransactionReceipt;
  positionId: Hex;
}> {
  const publicClient = ethClient.getPublicClient();

  try {
    const hash = await walletClient.writeContract({
      address: contractAddress,
      abi: BTCVaultControllerABI,
      functionName: "addCollateralToPosition",
      args: [vaultIds, marketParams],
      chain,
      account: walletClient.account!,
    });

    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
    });

    // Extract positionId from transaction logs/events if needed
    // For now, we can calculate it from the market params
    const positionId =
      "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex; // TODO: Extract from event

    return {
      transactionHash: hash,
      receipt,
      positionId,
    };
  } catch (error) {
    throw mapViemErrorToContractError(error, "add collateral to position");
  }
}

/**
 * Add collateral and borrow (or increase borrow) on existing position
 *
 * This function supports multi-vault collateral:
 * - Use multiple vault IDs to combine collateral from several deposits
 * - All vaults must belong to the same depositor
 * - First call creates the position, subsequent calls add to it
 *
 * @param walletClient - Connected wallet client for signing transactions
 * @param chain - Chain configuration
 * @param contractAddress - BTCVaultController contract address
 * @param vaultIds - Array of vault IDs (pegin transaction hashes) to use as collateral
 * @param marketParams - Morpho market parameters
 * @param borrowAmount - Amount to borrow (in loan token units)
 * @returns Transaction hash and receipt
 */
export async function addCollateralToPositionAndBorrow(
  walletClient: WalletClient,
  chain: Chain,
  contractAddress: Address,
  vaultIds: Hex[],
  marketParams: MarketParams,
  borrowAmount: bigint,
): Promise<{ transactionHash: Hash; receipt: TransactionReceipt }> {
  const publicClient = ethClient.getPublicClient();

  try {
    const hash = await walletClient.writeContract({
      address: contractAddress,
      abi: BTCVaultControllerABI,
      functionName: "addCollateralToPositionAndBorrow",
      args: [vaultIds, marketParams, borrowAmount],
      chain,
      account: walletClient.account!,
    });

    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
    });

    return {
      transactionHash: hash,
      receipt,
    };
  } catch (error) {
    throw mapViemErrorToContractError(error, "add collateral and borrow");
  }
}

/**
 * Repay debt from position
 *
 * Repays debt for the position by transferring loan tokens from user to the proxy
 * and calling Morpho's repay function. Supports partial or full repayment.
 *
 * Use this when you want to reduce or eliminate debt without withdrawing collateral.
 *
 * @param walletClient - Connected wallet client for signing transactions
 * @param chain - Chain configuration
 * @param contractAddress - BTCVaultController contract address
 * @param marketParams - Morpho market parameters identifying the position
 * @param repayAmount - Amount to repay (in loan token units, must be > 0)
 * @returns Transaction hash and receipt
 */
export async function repayFromPosition(
  walletClient: WalletClient,
  chain: Chain,
  contractAddress: Address,
  marketParams: MarketParams,
  repayAmount: bigint,
): Promise<{ transactionHash: Hash; receipt: TransactionReceipt }> {
  const publicClient = ethClient.getPublicClient();

  try {
    const hash = await walletClient.writeContract({
      address: contractAddress,
      abi: BTCVaultControllerABI,
      functionName: "repayFromPosition",
      args: [marketParams, repayAmount],
      chain,
      account: walletClient.account!,
    });

    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
    });

    return {
      transactionHash: hash,
      receipt,
    };
  } catch (error) {
    throw mapViemErrorToContractError(error, "repay from position");
  }
}

/**
 * Borrow more from an existing position
 *
 * @param walletClient - Connected wallet client for signing transactions
 * @param chain - Chain configuration
 * @param contractAddress - BTCVaultController contract address
 * @param marketParams - Morpho market parameters identifying the position
 * @param borrowAmount - Amount to borrow (in loan token units, must be > 0)
 * @returns Transaction hash, receipt, and actual amount borrowed
 */
export async function borrowFromPosition(
  walletClient: WalletClient,
  chain: Chain,
  contractAddress: Address,
  marketParams: MarketParams,
  borrowAmount: bigint,
): Promise<{ transactionHash: Hash; receipt: TransactionReceipt }> {
  const publicClient = ethClient.getPublicClient();

  try {
    const hash = await walletClient.writeContract({
      address: contractAddress,
      abi: BTCVaultControllerABI,
      functionName: "borrowFromPosition",
      args: [marketParams, borrowAmount],
      chain,
      account: walletClient.account!,
    });

    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
    });

    return {
      transactionHash: hash,
      receipt,
    };
  } catch (error) {
    throw mapViemErrorToContractError(error, "borrow from position");
  }
}

/**
 * Withdraw ALL collateral from position (without redeeming BTC vault)
 *
 * @param walletClient - Connected wallet client for signing transactions
 * @param chain - Chain configuration
 * @param contractAddress - BTCVaultController contract address
 * @param marketParams - Morpho market parameters identifying the position
 * @returns Transaction hash, receipt, and amount of collateral withdrawn
 */
export async function withdrawCollateralFromPosition(
  walletClient: WalletClient,
  chain: Chain,
  contractAddress: Address,
  marketParams: MarketParams,
): Promise<{ transactionHash: Hash; receipt: TransactionReceipt }> {
  const publicClient = ethClient.getPublicClient();

  try {
    const hash = await walletClient.writeContract({
      address: contractAddress,
      abi: BTCVaultControllerABI,
      functionName: "withdrawCollateralFromPosition",
      args: [marketParams],
      chain,
      account: walletClient.account!,
    });

    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
    });

    return {
      transactionHash: hash,
      receipt,
    };
  } catch (error) {
    throw mapViemErrorToContractError(
      error,
      "withdraw collateral from position",
    );
  }
}

/**
 * Depositor redeems BTC vault (withdraw BTC back to depositor's account)
 *
 * This unlocks and withdraws the BTC collateral from an available vault back to the depositor's Bitcoin address.
 * Can only be called on vaults that are in "Available" status (not locked in a position).
 * The redeemer public key (vault provider's BTC key) is automatically inferred from the vault.
 *
 * Emits VaultRedeemable event which signals the vault system to release the BTC.
 *
 * @param walletClient - Connected wallet client for signing transactions
 * @param chain - Chain configuration
 * @param contractAddress - BTCVaultController contract address
 * @param pegInTxHash - Peg-in transaction hash (vault ID) to redeem
 * @returns Transaction hash and receipt
 */
export async function depositorRedeemBTCVault(
  walletClient: WalletClient,
  chain: Chain,
  contractAddress: Address,
  pegInTxHash: Hex,
): Promise<{ transactionHash: Hash; receipt: TransactionReceipt }> {
  const publicClient = ethClient.getPublicClient();

  try {
    const hash = await walletClient.writeContract({
      address: contractAddress,
      abi: BTCVaultControllerABI,
      functionName: "depositorRedeemBTCVault",
      args: [pegInTxHash],
      chain,
      account: walletClient.account!,
    });

    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
    });

    return {
      transactionHash: hash,
      receipt,
    };
  } catch (error) {
    throw mapViemErrorToContractError(error, "redeem BTC vault");
  }
}
