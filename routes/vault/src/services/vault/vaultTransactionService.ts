/**
 * Vault Transaction Service - Business logic for write operations
 *
 * Handles vault/pegin-related transaction operations.
 */

import type { Address, Hex } from 'viem';
import { VaultControllerTx, BTCVaultsManager } from '../../clients/eth-contract';
import * as btcTransactionService from '../../transactions/btc/peginBuilder';
import { CONTRACTS } from '../../config/contracts';

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
 * Submit a pegin request
 *
 * This orchestrates the complete peg-in submission:
 * 1. Create unsigned BTC transaction using WASM (with REAL user data, REAL UTXOs, REAL selected provider)
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
 * @param utxoParams - Real UTXO parameters from wallet
 * @param vaultProviderAddress - Selected vault provider's Ethereum address
 * @param vaultProviderBtcPubkey - Selected vault provider's BTC public key (x-only, 32 bytes hex)
 * @returns Transaction hash, receipt, and pegin transaction details
 */
export async function submitPeginRequest(
  vaultControllerAddress: Address,
  depositorBtcPubkey: string,
  pegInAmountSats: bigint,
  utxoParams: PeginUTXOParams,
  vaultProviderAddress: Address,
  vaultProviderBtcPubkey: string,
) {
  // Step 1: Create unsigned BTC peg-in transaction
  // This uses WASM to construct the transaction with:
  // - depositor pubkey, peg-in amount, funding UTXO from wallet, selected vault provider
  // - HARDCODED: liquidators, network, fee (TODO: calculate dynamically based on tx size and fee rate)
  const btcTx = await btcTransactionService.createPeginTxForSubmission({
    depositorBtcPubkey,
    pegInAmount: pegInAmountSats,
    fundingTxid: utxoParams.fundingTxid,
    fundingVout: utxoParams.fundingVout,
    fundingValue: utxoParams.fundingValue,
    fundingScriptPubkey: utxoParams.fundingScriptPubkey,
    vaultProviderBtcPubkey,
  });

  // Step 2: Convert to Hex format for contract (ensure 0x prefix)
  const unsignedPegInTx = btcTx.unsignedTxHex.startsWith('0x')
    ? (btcTx.unsignedTxHex as Hex)
    : (`0x${btcTx.unsignedTxHex}` as Hex);

  // Step 3: Convert depositor BTC pubkey to Hex format (ensure 0x prefix)
  const depositorBtcPubkeyHex = depositorBtcPubkey.startsWith('0x')
    ? (depositorBtcPubkey as Hex)
    : (`0x${depositorBtcPubkey}` as Hex);

  // Step 4: Submit to smart contract
  // This triggers the Ethereum transaction that:
  // - Stores the peg-in request on-chain
  // - Emits PegInRequest event for vault provider and liquidators
  const result = await VaultControllerTx.submitPeginRequest(
    vaultControllerAddress,
    unsignedPegInTx,
    depositorBtcPubkeyHex,
    vaultProviderAddress,
  );

  return {
    ...result,
    btcTxid: btcTx.txid,
    btcTxHex: btcTx.unsignedTxHex,
  };
}

/**
 * Redeem BTC vault (withdraw BTC back to user's account)
 *
 * This function:
 * 1. Fetches vault data and validates status
 * 2. Gets the vault provider's BTC public key (used as redeemer key)
 * 3. Executes the redeem transaction
 *
 * @param vaultControllerAddress - BTCVaultController contract address
 * @param pegInTxHash - Peg-in transaction hash (vault ID) to redeem
 * @returns Transaction hash and receipt
 * @throws Error if vault is not in Available status (status !== 2)
 */
export async function redeemVault(
  vaultControllerAddress: Address,
  pegInTxHash: Hex,
) {
  // Step 1: Fetch vault data to validate status and get vault provider
  const vault = await BTCVaultsManager.getPeginRequest(
    CONTRACTS.BTC_VAULTS_MANAGER,
    pegInTxHash
  );

  // Step 2: Validate vault status is "Available" (status === 2)
  if (vault.status !== 2) {
    const statusNames = ['Pending', 'Verified', 'Available', 'InPosition', 'Expired'];
    const currentStatus = statusNames[vault.status] || `Unknown (${vault.status})`;
    throw new Error(
      `Cannot redeem vault: vault status is "${currentStatus}". ` +
      `Only vaults with "Available" status can be redeemed.`
    );
  }

  // Step 3: Get the vault provider's BTC public key
  // The vault provider's BTC key is used as the redeemer key (who can claim BTC on Bitcoin network)
  const providerBtcKey = await BTCVaultsManager.getProviderBTCKey(
    CONTRACTS.BTC_VAULTS_MANAGER,
    vault.vaultProvider
  );

  // Step 4: Execute redeem transaction with vault provider's BTC key as redeemer
  return VaultControllerTx.redeemBTCVault(
    vaultControllerAddress,
    pegInTxHash,
    [providerBtcKey] // claimerPKs - vault provider can claim the BTC
  );
}

