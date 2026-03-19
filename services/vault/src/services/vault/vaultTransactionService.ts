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
import type { Address, Hex, WalletClient } from "viem";

import { getMempoolApiUrl } from "../../clients/btc/config";
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
  /** CSV timelock in blocks for the PegIn output */
  timelockPegin: number;
  /** Value in satoshis for the depositor's claim output */
  depositorClaimValue: bigint;
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
  onPopSigned?: () => void | Promise<void>;
  /** Depositor's BTC payout address (e.g. bc1p...) */
  depositorPayoutBtcAddress: string;
  /** Keccak256 hash of the depositor's Lamport public key */
  depositorLamportPkHash: Hex;
  /** Pre-signed BTC PoP signature to reuse (skips BTC wallet signing) */
  preSignedBtcPopSignature?: Hex;
  /**
   * SHA-256 hash of the depositor's secret for the new peg-in flow.
   * TODO: Pass to peginManager.registerPeginOnChain when contract ABI is updated to support the new peg-in flow.
   */
  depositorSecretHash?: Hex;
}

/**
 * Result of registering a pegin on-chain (PoP + ETH tx only).
 * UTXOs and fee come from the earlier prepare step, not from registration.
 */
export interface RegisterPeginResult {
  transactionHash: Hex;
  btcTxHash: Hex;
  btcTxHex: string;
  /** The BTC PoP signature used, for reuse in subsequent pegins */
  btcPopSignature: Hex;
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
    timelockPegin: params.timelockPegin,
    depositorClaimValue: params.depositorClaimValue,
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
): Promise<RegisterPeginResult> {
  const peginManager = createPeginManager(btcWallet, ethWallet);

  const registrationResult = await peginManager.registerPeginOnChain({
    depositorBtcPubkey: params.depositorBtcPubkey,
    unsignedBtcTx: params.fundedTxHex,
    vaultProvider: params.vaultProviderAddress,
    onPopSigned: params.onPopSigned,
    depositorPayoutBtcAddress: params.depositorPayoutBtcAddress,
    depositorLamportPkHash: params.depositorLamportPkHash,
    preSignedBtcPopSignature: params.preSignedBtcPopSignature,
  });

  return {
    transactionHash: registrationResult.ethTxHash,
    btcTxHash: registrationResult.vaultId,
    btcTxHex: params.fundedTxHex,
    btcPopSignature: registrationResult.btcPopSignature,
  };
}
