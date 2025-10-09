/**
 * Vault Transaction Service - Business logic for write operations
 *
 * Orchestrates transaction operations that may require multiple steps
 * or fetching data before executing transactions.
 */

import type { Address, Hex, Hash, TransactionReceipt } from 'viem';
import { VaultControllerTx, Morpho } from '../../clients/eth-contract';
import type { MarketParams } from '../../clients/eth-contract';
import * as btcTransactionService from '../btc/btcTransactionService';
import { LOCAL_PEGIN_CONFIG } from '../../config/pegin';

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
  borrowAmount: bigint,
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
    borrowAmount,
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
 * This orchestrates the complete peg-in submission:
 * 1. Create unsigned BTC transaction using WASM (with REAL user data + HARDCODED infrastructure)
 * 2. Submit unsigned BTC transaction to smart contract
 * 3. Wait for ETH transaction confirmation
 * 4. Return transaction details
 *
 * Note: This function does NOT broadcast the BTC transaction to the Bitcoin network.
 * For the POC, we only submit the unsigned transaction to the Ethereum vault contract.
 *
 * @param vaultControllerAddress - BTCVaultController contract address
 * @param depositorBtcPubkey - Depositor's BTC public key (x-only, 32 bytes hex)
 * @param pegInAmountSats - Amount to peg in (in satoshis)
 * @returns Transaction hash, receipt, and pegin transaction details
 */
export async function submitPeginRequest(
  vaultControllerAddress: Address,
  depositorBtcPubkey: string,
  pegInAmountSats: bigint,
) {
  // Step 1: Create unsigned BTC peg-in transaction
  // This uses WASM to construct the transaction with:
  // - REAL: depositor pubkey, peg-in amount
  // - HARDCODED: vault provider, liquidators, network, fee
  // - MOCKED: funding transaction (UTXO)
  const btcTx = await btcTransactionService.createPeginTxForSubmission({
    depositorBtcPubkey,
    pegInAmount: pegInAmountSats,
  });

  // Step 2: Convert to Hex format for contract (ensure 0x prefix)
  const unsignedPegInTx = btcTx.unsignedTxHex.startsWith('0x')
    ? (btcTx.unsignedTxHex as Hex)
    : (`0x${btcTx.unsignedTxHex}` as Hex);

  // Step 3: Get vault provider address
  // HARDCODED: Using local deployment vault provider for POC
  // In production, this would be selected by user or fetched from backend
  const vaultProvider = LOCAL_PEGIN_CONFIG.vaultProviderAddress;

  // Step 4: Submit to smart contract
  // This triggers the Ethereum transaction that:
  // - Stores the peg-in request on-chain
  // - Emits PegInRequest event for vault provider and liquidators
  const result = await VaultControllerTx.submitPeginRequest(
    vaultControllerAddress,
    unsignedPegInTx,
    vaultProvider,
  );

  return {
    ...result,
    btcTxid: btcTx.txid,
    btcTxHex: btcTx.unsignedTxHex,
  };
}

/**
 * Repay a vault and initiate pegout
 *
 * IMPORTANT: This performs a FULL repayment only - no partial repayments allowed.
 * The contract automatically repays the entire debt using the user's borrowShares.
 *
 * Before calling:
 * 1. Fetch the user's position using AccrualPosition.fetch() to get borrowAssets (total debt)
 * 2. User must approve loan token spending for the borrowAssets amount
 * 3. Call this function to repay and withdraw BTC
 *
 * @param vaultControllerAddress - BTCVaultController contract address
 * @param pegInTxHash - Pegin transaction hash (vault ID)
 * @returns Transaction hash and receipt
 */
export async function repayAndPegout(
  vaultControllerAddress: Address,
  pegInTxHash: Hex,
) {
  return VaultControllerTx.repayAndPegout(vaultControllerAddress, pegInTxHash);
}
