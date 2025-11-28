/**
 * Vault Transaction Service - Business logic for write operations
 *
 * Orchestrates transaction operations that may require multiple steps
 * or fetching data before executing transactions.
 */

import {
  BTC_DUST_SAT,
  fundPeginTransaction,
  getNetwork,
  selectUtxosForPegin,
  type UTXO as SDKUtxo,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import type { Address, Chain, Hex, WalletClient } from "viem";

import {
  BTCVaultsManagerTx,
  MorphoControllerTx,
} from "../../clients/eth-contract";
import { CONTRACTS } from "../../config/contracts";
import { getBTCNetworkForWASM } from "../../config/pegin";

import * as btcTransactionService from "./vaultBtcTransactionService";

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
 * Submit a pegin request
 *
 * This orchestrates the complete peg-in submission:
 * 1. Generate Bitcoin proof of possession signature (depositor signs their ETH address with BTC key)
 * 2. Select appropriate UTXO(s) from available UTXOs
 * 3. Create unsigned BTC transaction using WASM (with REAL user data, REAL UTXOs, REAL selected provider)
 * 4. Submit unsigned BTC transaction to BTCVaultsManager smart contract
 * 5. Wait for ETH transaction confirmation
 * 6. Return transaction details including selected UTXOs
 *
 * Note: This function does NOT broadcast the BTC transaction to the Bitcoin network.
 * The unsigned transaction hex is returned for later broadcasting.
 *
 * @param walletClient - Connected wallet client for signing transactions
 * @param chain - Chain configuration
 * @param depositorEthAddress - Depositor's Ethereum address
 * @param depositorBtcPubkey - Depositor's BTC public key (x-only, 32 bytes hex)
 * @param pegInAmountSats - Amount to peg in (in satoshis)
 * @param availableUTXOs - Array of available UTXOs to select from
 * @param fixedFee - BTC transaction fixed fee in satoshis (used for UTXO selection)
 * @param changeAddress - BTC address for change output
 * @param vaultProviderAddress - Selected vault provider's Ethereum address
 * @param vaultProviderBtcPubkey - Selected vault provider's BTC public key (x-only, 32 bytes hex)
 * @param liquidatorBtcPubkeys - Liquidator BTC public keys from the selected vault provider
 * @param btcPopSignatureRaw - Pre-generated BIP-322 or ECDSA signature (from createProofOfPossession)
 * @returns Transaction hash, receipt, pegin transaction details, selected UTXOs, and unsigned tx hex
 */
export async function submitPeginRequest(
  walletClient: WalletClient,
  chain: Chain,
  depositorEthAddress: Address,
  depositorBtcPubkey: string,
  pegInAmountSats: bigint,
  availableUTXOs: UTXO[],
  fixedFee: number,
  changeAddress: string,
  vaultProviderAddress: Address,
  vaultProviderBtcPubkey: string,
  liquidatorBtcPubkeys: string[],
  btcPopSignatureRaw: string,
) {
  // Step 1: Convert PoP signature from base64 to hex
  // BTC wallets (Unisat, OKX, etc.) return base64-encoded signatures
  // Ethereum contracts expect hex-encoded bytes, so we need to convert
  let btcPopSignature: Hex;
  if (btcPopSignatureRaw.startsWith("0x")) {
    // Already in hex format
    btcPopSignature = btcPopSignatureRaw as Hex;
  } else {
    // Convert from base64 to hex
    const signatureBytes = Buffer.from(btcPopSignatureRaw, "base64");
    btcPopSignature = `0x${signatureBytes.toString("hex")}` as Hex;
  }

  // Step 2: Create unfunded BTC peg-in transaction using SDK
  const btcTx = await btcTransactionService.createPeginTxForSubmission({
    depositorBtcPubkey,
    pegInAmount: pegInAmountSats,
    vaultProviderBtcPubkey,
    liquidatorBtcPubkeys,
  });
  // btcTx.unsignedTxHex = unfunded tx (0 inputs, 1 vault output)

  // Step 3: Select UTXOs and calculate fees using iterative approach
  // TEMPORARY: Convert legacy fixedFee to feeRate for new UTXO selection logic
  // TODO: Remove fixedFee parameter and use feeRate directly (breaking change for frontend)
  // See: services/vault/src/utils/fee/constants.ts for proper fee calculation constants
  const ESTIMATED_PEGIN_TX_SIZE_VBYTES = 250;
  const feeRate = Math.ceil(fixedFee / ESTIMATED_PEGIN_TX_SIZE_VBYTES);
  const utxoSelection = selectUtxosForPegin(
    availableUTXOs,
    pegInAmountSats,
    feeRate,
  );

  // Step 4: Validate change address if change output is needed
  if (utxoSelection.changeAmount > BigInt(BTC_DUST_SAT) && !changeAddress) {
    throw new Error(
      "Change address is required when change amount exceeds dust threshold",
    );
  }

  // Step 5: Fund the transaction (add inputs and change output)
  const network = getNetwork(getBTCNetworkForWASM());
  const fundedTxHex = fundPeginTransaction({
    unfundedTxHex: btcTx.unsignedTxHex,
    selectedUTXOs: utxoSelection.selectedUTXOs,
    changeAddress: changeAddress,
    changeAmount: utxoSelection.changeAmount,
    network,
  });
  // fundedTxHex = funded tx (N inputs, 2 outputs: vault + change)

  // Step 6: Convert funded tx to Hex format for contract (ensure 0x prefix)
  const unsignedPegInTx = fundedTxHex.startsWith("0x")
    ? (fundedTxHex as Hex)
    : (`0x${fundedTxHex}` as Hex);

  // Step 7: Convert depositor BTC pubkey to Hex format (ensure 0x prefix)
  const depositorBtcPubkeyHex = depositorBtcPubkey.startsWith("0x")
    ? (depositorBtcPubkey as Hex)
    : (`0x${depositorBtcPubkey}` as Hex);

  // Step 8: Submit to smart contract
  const result = await BTCVaultsManagerTx.submitPeginRequest(
    walletClient,
    chain,
    CONTRACTS.BTC_VAULTS_MANAGER,
    depositorEthAddress,
    depositorBtcPubkeyHex,
    btcPopSignature,
    unsignedPegInTx,
    vaultProviderAddress,
  );

  // Step 9: Return results with actual fee used
  const actualFee = utxoSelection.fee;

  return {
    transactionHash: result.transactionHash,
    receipt: result.receipt,
    btcTxid: btcTx.txid,
    btcTxHex: fundedTxHex,
    selectedUTXOs: utxoSelection.selectedUTXOs,
    fee: actualFee,
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
