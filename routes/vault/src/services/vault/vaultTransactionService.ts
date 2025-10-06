/**
 * Vault Transaction Service - Business logic for write operations
 *
 * Orchestrates transaction operations that may require multiple steps
 * or fetching data before executing transactions.
 */

import type { Address, Hex, Hash, TransactionReceipt } from 'viem';
import { VaultControllerTx, Morpho } from '../../clients/eth-contract';
import type { MarketParams } from '../../clients/eth-contract';

/**
 * Result of mintAndBorrow operation
 */
export interface MintAndBorrowResult {
  /** Transaction hash */
  transactionHash: Hash;
  /** Transaction receipt */
  receipt: TransactionReceipt;
  /** Market parameters used */
  marketParams: MarketParams;
}

/**
 * Create a vault by minting vBTC and borrowing against it
 *
 * This composite operation:
 * 1. Fetches Morpho market parameters by market ID
 * 2. Executes mintAndBorrow transaction with those parameters
 *
 * @param vaultControllerAddress - BTCVaultController contract address
 * @param pegInTxHash - Pegin transaction hash (vault ID)
 * @param depositorBtcPubkey - Depositor's BTC public key (x-only, 32 bytes)
 * @param marketId - Morpho market ID
 * @param borrowAmount - Amount to borrow (in loan token units)
 * @returns Transaction result with market parameters
 */
export async function mintAndBorrowWithMarketId(
  vaultControllerAddress: Address,
  pegInTxHash: Hex,
  depositorBtcPubkey: Hex,
  marketId: string | bigint,
  borrowAmount: bigint
): Promise<MintAndBorrowResult> {
  // Step 1: Fetch market parameters from Morpho
  const market = await Morpho.getMarketById(marketId);

  // Step 2: Construct market params from fetched data
  const marketParams: MarketParams = {
    loanToken: market.loanToken.address,
    collateralToken: market.collateralToken.address,
    oracle: market.oracle,
    irm: market.irm,
    lltv: market.lltv,
  };

  // Step 3: Execute transaction
  const { transactionHash, receipt } = await VaultControllerTx.mintAndBorrow(
    vaultControllerAddress,
    pegInTxHash,
    depositorBtcPubkey,
    marketParams,
    borrowAmount
  );

  return {
    transactionHash,
    receipt,
    marketParams,
  };
}

/**
 * Submit a pegin request
 *
 * Direct pass-through to client - included for completeness
 *
 * @param vaultControllerAddress - BTCVaultController contract address
 * @param unsignedPegInTx - Unsigned Bitcoin peg-in transaction
 * @param vaultProvider - Vault provider address
 * @returns Transaction hash, receipt, and pegin transaction hash
 */
export async function submitPeginRequest(
  vaultControllerAddress: Address,
  unsignedPegInTx: Hex,
  vaultProvider: Address
) {
  return VaultControllerTx.submitPeginRequest(
    vaultControllerAddress,
    unsignedPegInTx,
    vaultProvider
  );
}

/**
 * Repay a vault and initiate pegout
 *
 * Direct pass-through to client - included for completeness
 * NOTE: User must approve loan token spending before calling this
 *
 * @param vaultControllerAddress - BTCVaultController contract address
 * @param pegInTxHash - Pegin transaction hash (vault ID)
 * @returns Transaction hash and receipt
 */
export async function repayAndPegout(
  vaultControllerAddress: Address,
  pegInTxHash: Hex
) {
  return VaultControllerTx.repayAndPegout(vaultControllerAddress, pegInTxHash);
}
