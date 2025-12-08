/**
 * Vault Transaction Service - Business logic for write operations
 *
 * Orchestrates transaction operations that may require multiple steps
 * or fetching data before executing transactions.
 */

import { getETHChain } from "@babylonlabs-io/config";
import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import type { UTXO as SDKUtxo } from "@babylonlabs-io/ts-sdk/tbv/core";
import { PeginManager } from "@babylonlabs-io/ts-sdk/tbv/core";
import type { Address, Chain, Hex, WalletClient } from "viem";

import { getMempoolApiUrl } from "../../clients/btc/config";
import { MorphoControllerTx } from "../../clients/eth-contract";
import { CONTRACTS } from "../../config/contracts";
import { getBTCNetworkForWASM } from "../../config/pegin";

/**
 * UTXO parameters for peg-in transaction
 */
export interface PeginUTXOParams {
  fundingTxid: string;
  fundingVout: number;
  fundingValue: bigint;
  fundingScriptPubkey: string;
}

/**
 * UTXO interface for multi-UTXO support
 * Re-exported from SDK for convenience
 */
export type UTXO = SDKUtxo;

/**
 * Parameters for submitting a pegin request
 */
export interface SubmitPeginParams {
  pegInAmount: bigint;
  feeRate: number;
  changeAddress: string;
  vaultProviderAddress: Address;
  vaultProviderBtcPubkey: string;
  liquidatorBtcPubkeys: string[];
  availableUTXOs: UTXO[];
}

/**
 * Result of submitting a pegin request
 */
export interface SubmitPeginResult {
  transactionHash: Hex;
  btcTxHash: Hex; // Bitcoin transaction hash (with 0x prefix)
  btcTxHex: string; // Full transaction hex
  selectedUTXOs: UTXO[];
  fee: bigint;
}

/**
 * Submit a pegin request using PeginManager
 *
 * This function uses the SDK's PeginManager to orchestrate the complete peg-in flow:
 * 1. Build unfunded transaction
 * 2. Select UTXOs automatically
 * 3. Fund transaction
 * 4. Create proof of possession (PoP) signature
 * 5. Submit to smart contract
 *
 * The PeginManager handles all orchestration internally, dramatically simplifying
 * the service layer code.
 *
 * **IMPORTANT:** This function returns immediately after the Ethereum transaction is
 * submitted. It does NOT wait for transaction confirmation. Use polling mechanisms
 * (e.g., usePeginPollingQuery) to track transaction status separately.
 *
 * @param btcWallet - Bitcoin wallet (from wallet-connector, implements BitcoinWallet interface)
 * @param ethWallet - Ethereum wallet client (viem WalletClient)
 * @param params - Pegin parameters
 * @returns Transaction hash, vault ID, BTC txid, funded tx hex, selected UTXOs, and fee
 */
export async function submitPeginRequest(
  btcWallet: BitcoinWallet,
  ethWallet: WalletClient,
  params: SubmitPeginParams,
): Promise<SubmitPeginResult> {
  // Validate wallet client has an account
  if (!ethWallet.account) {
    throw new Error("Ethereum wallet account not found");
  }

  // Step 1: Create PeginManager instance
  // PeginManager now uses viem's WalletClient directly for proper gas estimation
  const peginManager = new PeginManager({
    btcNetwork: getBTCNetworkForWASM(),
    btcWallet,
    ethWallet, // viem's WalletClient
    ethChain: getETHChain(), // Required for proper gas estimation in writeContract
    vaultContracts: {
      btcVaultsManager: CONTRACTS.BTC_VAULTS_MANAGER,
    },
    mempoolApiUrl: getMempoolApiUrl(),
  });

  // Step 2: Prepare peg-in (builds, funds, selects UTXOs automatically)
  const peginResult = await peginManager.preparePegin({
    amount: params.pegInAmount,
    vaultProvider: params.vaultProviderAddress,
    vaultProviderBtcPubkey: params.vaultProviderBtcPubkey,
    liquidatorBtcPubkeys: params.liquidatorBtcPubkeys,
    availableUTXOs: params.availableUTXOs,
    feeRate: params.feeRate,
    changeAddress: params.changeAddress,
  });

  // Step 3: Get depositor BTC pubkey (manager handles x-only conversion internally)
  const depositorBtcPubkeyRaw = await btcWallet.getPublicKeyHex();
  const depositorBtcPubkey =
    depositorBtcPubkeyRaw.length === 66
      ? depositorBtcPubkeyRaw.slice(2) // Strip first byte (02 or 03)
      : depositorBtcPubkeyRaw; // Already x-only

  // Step 4: Register on-chain (submits to contract + creates PoP automatically)
  const registrationResult = await peginManager.registerPeginOnChain({
    depositorBtcPubkey,
    unsignedBtcTx: peginResult.fundedTxHex,
    vaultProvider: params.vaultProviderAddress,
  });

  // Step 5: Return results
  return {
    transactionHash: registrationResult.ethTxHash,
    btcTxHash: registrationResult.vaultId, // Vault identifier (Bitcoin transaction hash with 0x prefix)
    btcTxHex: peginResult.fundedTxHex,
    selectedUTXOs: peginResult.selectedUTXOs,
    fee: peginResult.fee,
  };
}

/**
 * Redeem multiple BTC vaults (withdraw BTC back to user's account)
 *
 * This function:
 * 1. Validates all vaults are in Available status (status === 2)
 * 2. Executes redeem transaction for each vault sequentially
 * 3. If ANY redemption fails, throws error (all-or-nothing approach)
 *
 * Note: The depositor initiates redemption, but the vault provider is the one
 * who can actually claim the BTC on the Bitcoin network.
 *
 * @param walletClient - Connected wallet client for signing transactions
 * @param chain - Chain configuration
 * @param morphoControllerAddress - MorphoIntegrationController contract address
 * @param pegInTxHashes - Array of peg-in transaction hashes (vault IDs) to redeem
 * @returns Array of transaction hashes and receipts for each redemption
 * @throws Error if any vault is not in Available status or if any transaction fails
 */
export async function redeemVaults(
  walletClient: WalletClient,
  chain: Chain,
  morphoControllerAddress: Address,
  pegInTxHashes: Hex[],
): Promise<Array<{ transactionHash: Hex; pegInTxHash: Hex; error?: string }>> {
  const results: Array<{
    transactionHash: Hex;
    pegInTxHash: Hex;
    error?: string;
  }> = [];

  // Execute redemptions sequentially
  // If any fails, throw error immediately (fail-entire operation)
  for (const pegInTxHash of pegInTxHashes) {
    try {
      const result = await MorphoControllerTx.redeemBTCVault(
        walletClient,
        chain,
        morphoControllerAddress,
        pegInTxHash,
      );

      results.push({
        transactionHash: result.transactionHash,
        pegInTxHash,
      });
    } catch (error) {
      // On any error, throw immediately with context
      throw new Error(
        `Failed to redeem vault ${pegInTxHash}: ${error instanceof Error ? error.message : "Unknown error"}. ` +
          `${results.length} of ${pegInTxHashes.length} vaults were successfully redeemed before this error.`,
      );
    }
  }

  return results;
}
