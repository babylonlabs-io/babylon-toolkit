/**
 * Vault Transaction Service - Business logic for write operations
 *
 * Handles vault/pegin-related transaction operations.
 */

import type { Address, Hex } from 'viem';
import { VaultControllerTx } from '../../clients/eth-contract';
import * as btcTransactionService from '../../transactions/btc/peginBuilder';

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

