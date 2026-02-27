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
import type { Abi, Address, Chain, Hex, WalletClient } from "viem";

import { getMempoolApiUrl } from "../../clients/btc/config";
import { executeWrite } from "../../clients/eth-contract/transactionFactory";
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
 * Parameters for preparing a pegin transaction (build + fund, no on-chain submission)
 */
export interface PreparePeginParams {
  pegInAmount: bigint;
  feeRate: number;
  changeAddress: string;
  vaultProviderAddress: Address;
  vaultProviderBtcPubkey: string;
  vaultKeeperBtcPubkeys: string[];
  universalChallengerBtcPubkeys: string[];
  availableUTXOs: UTXO[];
}

/**
 * Result of preparing a pegin transaction (before on-chain registration)
 */
export interface PreparePeginResult {
  btcTxHash: Hex;
  fundedTxHex: string;
  selectedUTXOs: UTXO[];
  fee: bigint;
  depositorBtcPubkey: string;
}

/**
 * Parameters for registering a prepared pegin on-chain
 */
export interface RegisterPeginOnChainParams {
  depositorBtcPubkey: string;
  fundedTxHex: string;
  vaultProviderAddress: Address;
  depositorLamportPkHash?: Hex;
  onPopSigned?: () => void | Promise<void>;
}

/**
 * Result of submitting a pegin request
 */
export interface SubmitPeginResult {
  transactionHash: Hex;
  btcTxHash: Hex;
  btcTxHex: string;
  selectedUTXOs: UTXO[];
  fee: bigint;
}

function createPeginManager(
  btcWallet: BitcoinWallet,
  ethWallet: WalletClient,
): PeginManager {
  if (!ethWallet.account) {
    throw new Error("Ethereum wallet account not found");
  }

  return new PeginManager({
    btcNetwork: getBTCNetworkForWASM(),
    btcWallet,
    ethWallet,
    ethChain: getETHChain(),
    vaultContracts: {
      btcVaultsManager: CONTRACTS.BTC_VAULTS_MANAGER,
    },
    mempoolApiUrl: getMempoolApiUrl(),
  });
}

/**
 * Build and fund a pegin BTC transaction without submitting to Ethereum.
 *
 * Returns the funded transaction hex and the BTC txid (vault ID) so the
 * caller can derive the Lamport keypair before on-chain registration.
 */
export async function preparePeginTransaction(
  btcWallet: BitcoinWallet,
  ethWallet: WalletClient,
  params: PreparePeginParams,
): Promise<PreparePeginResult> {
  const peginManager = createPeginManager(btcWallet, ethWallet);

  const peginResult = await peginManager.preparePegin({
    amount: params.pegInAmount,
    vaultProvider: params.vaultProviderAddress,
    vaultProviderBtcPubkey: params.vaultProviderBtcPubkey,
    vaultKeeperBtcPubkeys: params.vaultKeeperBtcPubkeys,
    universalChallengerBtcPubkeys: params.universalChallengerBtcPubkeys,
    availableUTXOs: params.availableUTXOs,
    feeRate: params.feeRate,
    changeAddress: params.changeAddress,
  });

  const depositorBtcPubkeyRaw = await btcWallet.getPublicKeyHex();
  const depositorBtcPubkey =
    depositorBtcPubkeyRaw.length === 66
      ? depositorBtcPubkeyRaw.slice(2)
      : depositorBtcPubkeyRaw;

  return {
    btcTxHash: peginResult.btcTxHash as Hex,
    fundedTxHex: peginResult.fundedTxHex,
    selectedUTXOs: peginResult.selectedUTXOs,
    fee: peginResult.fee,
    depositorBtcPubkey,
  };
}

/**
 * Register a prepared pegin on Ethereum (PoP signature + contract call).
 *
 * This is the second half of the pegin flow, called after the Lamport
 * keypair has been derived and its hash is available.
 */
export async function registerPeginOnChain(
  btcWallet: BitcoinWallet,
  ethWallet: WalletClient,
  params: RegisterPeginOnChainParams,
): Promise<SubmitPeginResult> {
  const peginManager = createPeginManager(btcWallet, ethWallet);

  const registrationResult = await peginManager.registerPeginOnChain({
    depositorBtcPubkey: params.depositorBtcPubkey,
    unsignedBtcTx: params.fundedTxHex,
    vaultProvider: params.vaultProviderAddress,
    depositorLamportPkHash: params.depositorLamportPkHash,
    onPopSigned: params.onPopSigned,
  });

  return {
    transactionHash: registrationResult.ethTxHash,
    btcTxHash: registrationResult.vaultId,
    btcTxHex: params.fundedTxHex,
    selectedUTXOs: [],
    fee: 0n,
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
 * @param applicationController - Application controller contract address
 * @param pegInTxHashes - Array of peg-in transaction hashes (vault IDs) to redeem
 * @param contractABI - Contract ABI for the application controller
 * @param functionName - Function name to call
 * @returns Array of transaction hashes and receipts for each redemption
 * @throws Error if any vault is not in Available status or if any transaction fails
 */
export async function redeemVaults(
  walletClient: WalletClient,
  chain: Chain,
  applicationController: Address,
  pegInTxHashes: Hex[],
  contractABI: Abi | readonly unknown[],
  functionName: string,
): Promise<Array<{ transactionHash: Hex; pegInTxHash: Hex; error?: string }>> {
  const results: Array<{
    transactionHash: Hex;
    pegInTxHash: Hex;
    error?: string;
  }> = [];
  // Execute redemptions sequentially using generic transaction factory
  // If any fails, throw error immediately (fail-entire operation)
  for (const pegInTxHash of pegInTxHashes) {
    try {
      const result = await executeWrite({
        walletClient,
        chain,
        address: applicationController,
        abi: contractABI,
        functionName,
        args: [pegInTxHash],
        errorContext: `redeem vault via ${functionName}`,
      });

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
