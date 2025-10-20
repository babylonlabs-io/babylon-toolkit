/**
 * Peg-In Payout Signature Service
 *
 * Handles the business logic for signing payout transactions and submitting
 * signatures to the vault provider. This service is state-unaware and can be
 * reused across different parts of the application.
 *
 * Per pegin.md step 3:
 * - Depositor signs each Payout transaction (one for each claimer: VP + Liquidators)
 * - Signatures are Schnorr (64 bytes) for Taproot compatibility
 * - Submits all signatures to vault provider via submitPayoutSignatures RPC
 */

import type { Hex } from 'viem';
import { VaultProviderRpcApi } from '../../clients/vault-provider-rpc';
import type { ClaimerTransactions } from '../../clients/vault-provider-rpc/types';
import { signPayoutTransaction } from '../btc/signPayoutService';
import { stripHexPrefix } from '../../utils/btc';

/**
 * Vault provider information
 */
export interface VaultProviderInfo {
  /** Ethereum address of the vault provider */
  address: Hex;
  /** RPC URL of the vault provider */
  url: string;
}

/**
 * BTC wallet provider for signing
 */
export interface BtcWalletProvider {
  signPsbt: (psbtHex: string) => Promise<string>;
}

/**
 * Parameters for signing and submitting payout signatures
 */
export interface SignAndSubmitPayoutSignaturesParams {
  /** Peg-in transaction ID */
  peginTxId: string;
  /** Depositor's BTC public key (32-byte x-only, no 0x prefix) */
  depositorBtcPubkey: string;
  /** Transactions to sign from vault provider */
  claimerTransactions: ClaimerTransactions[];
  /** Vault provider information */
  vaultProvider: VaultProviderInfo;
  /** BTC wallet provider for signing */
  btcWalletProvider: BtcWalletProvider;
}

/**
 * Sign payout transactions and submit signatures to vault provider
 *
 * This function encapsulates the business logic for:
 * 1. Signing each payout transaction with BTC wallet (Schnorr signatures)
 * 2. Collecting signatures mapped by claimer public key
 * 3. Submitting all signatures to vault provider RPC
 *
 * The function is state-unaware and throws errors that should be handled by the caller.
 *
 * @param params - Signing and submission parameters
 * @throws Error if signing fails or RPC submission fails
 */
export async function signAndSubmitPayoutSignatures(
  params: SignAndSubmitPayoutSignaturesParams,
): Promise<void> {
  const {
    peginTxId,
    depositorBtcPubkey,
    claimerTransactions,
    vaultProvider,
    btcWalletProvider,
  } = params;

  // Validate inputs
  if (!peginTxId || typeof peginTxId !== 'string') {
    throw new Error('Invalid peginTxId: must be a non-empty string');
  }

  if (!depositorBtcPubkey || typeof depositorBtcPubkey !== 'string') {
    throw new Error('Invalid depositorBtcPubkey: must be a non-empty string');
  }

  // Validate BTC public key format (should be 64 hex chars = 32 bytes, no 0x prefix)
  if (!/^[0-9a-fA-F]{64}$/.test(depositorBtcPubkey)) {
    throw new Error(
      'Invalid depositorBtcPubkey format: must be 64 hex characters (32-byte x-only public key, no 0x prefix)',
    );
  }

  if (!claimerTransactions || claimerTransactions.length === 0) {
    throw new Error(
      'Invalid claimerTransactions: must be a non-empty array',
    );
  }

  if (!vaultProvider?.address || !vaultProvider?.url) {
    throw new Error(
      'Invalid vaultProvider: must have address and url properties',
    );
  }

  // Step 1: Sign payout transactions for each claimer
  // Each payout transaction needs a Schnorr signature (64 bytes) from the depositor
  const signatures: Record<string, string> = {};

  for (const claimerTx of claimerTransactions) {
    const payoutTxHex = claimerTx.payout_tx.tx_hex;

    // Sign the payout transaction using BTC wallet
    // This extracts the Schnorr signature (64 bytes, no sighash flag)
    const signature = await signPayoutTransaction({
      transactionHex: payoutTxHex,
      btcWalletProvider,
    });

    // Map claimer pubkey to depositor's signature
    signatures[claimerTx.claimer_pubkey] = signature;
  }

  // Step 2: Submit signatures to vault provider RPC
  const rpcClient = new VaultProviderRpcApi(vaultProvider.url, 30000);

  // Note: Bitcoin Txid expects hex without "0x" prefix (64 chars)
  // Frontend uses Ethereum-style "0x"-prefixed hex, so we strip it
  await rpcClient.submitPayoutSignatures({
    pegin_tx_id: stripHexPrefix(peginTxId),
    depositor_pk: depositorBtcPubkey,
    signatures,
  });
}
