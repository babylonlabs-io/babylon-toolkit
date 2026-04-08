/**
 * Vault Transaction Service - Business logic for write operations
 *
 * Orchestrates transaction operations that may require multiple steps
 * or fetching data before executing transactions.
 */

import { getETHChain } from "@babylonlabs-io/config";
import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import type { UTXO as SDKUtxo } from "@babylonlabs-io/ts-sdk/tbv/core";
import { ensureHexPrefix, PeginManager } from "@babylonlabs-io/ts-sdk/tbv/core";
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
 * Parameters for preparing a pegin transaction
 */
export interface PreparePeginParams {
  pegInAmount: bigint;
  /** Protocol fee rate in sat/vB from contract offchain params */
  protocolFeeRate: bigint;
  /** Mempool fee rate in sat/vB for UTXO selection and funding */
  mempoolFeeRate: number;
  changeAddress: string;
  vaultProviderAddress: Address;
  vaultProviderBtcPubkey: string;
  vaultKeeperBtcPubkeys: string[];
  universalChallengerBtcPubkeys: string[];
  /** CSV timelock in blocks for the PegIn vault output */
  timelockPegin: number;
  /** CSV timelock in blocks for the Pre-PegIn HTLC refund path (tRefund from VersionedOffchainParams) */
  timelockRefund: number;
  /** SHA256 hash commitment for the HTLC (64 hex chars = 32 bytes) */
  hashH: string;
  /** M in M-of-N council multisig */
  councilQuorum: number;
  /** N in M-of-N council multisig */
  councilSize: number;
  availableUTXOs: UTXO[];
}

/**
 * Result of preparing a pegin transaction
 */
export interface PreparePeginResult {
  /** Vault ID: hash of the pegin tx (NOT the pre-pegin tx). */
  btcTxHash: Hex;
  /** Funded Pre-PegIn tx hex — this is the tx the depositor signs and broadcasts. */
  fundedPrePeginTxHex: string;
  /** PegIn tx hex — submitted to contract as depositorSignedPeginTx; vault ID derived from this. */
  peginTxHex: string;
  /** Depositor's Schnorr signature over PegIn input 0 (HTLC leaf 0), 128 hex chars. */
  peginInputSignature: string;
  selectedUTXOs: UTXO[];
  fee: bigint;
  depositorBtcPubkey: string;
}

/**
 * Parameters for registering a prepared pegin on-chain
 */
export interface RegisterPeginOnChainParams {
  depositorBtcPubkey: string;
  /** Funded Pre-PegIn tx hex — submitted to contract as unsignedPrePeginTx for DA */
  unsignedPrePeginTxHex: string;
  /** PegIn tx hex — submitted to contract as depositorSignedPeginTx; vault ID derived from this */
  peginTxHex: string;
  /** SHA256 hashlock for HTLC activation (bytes32 hex with 0x prefix) */
  hashlock: Hex;
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
      btcVaultRegistry: CONTRACTS.BTC_VAULT_REGISTRY,
    },
    mempoolApiUrl: getMempoolApiUrl(),
  });
}

/**
 * Build and fund the pegin transactions without submitting to Ethereum.
 *
 * Creates the Pre-PegIn HTLC transaction, funds it, derives the PegIn transaction,
 * and signs the PegIn input. Returns both transactions and the depositor's signature
 * so the caller can derive the Lamport keypair before on-chain registration.
 */
export async function preparePeginTransaction(
  btcWallet: BitcoinWallet,
  ethWallet: WalletClient,
  params: PreparePeginParams,
): Promise<PreparePeginResult> {
  const peginManager = createPeginManager(btcWallet, ethWallet);

  const peginResult = await peginManager.preparePegin({
    amounts: [params.pegInAmount],
    vaultProviderBtcPubkey: params.vaultProviderBtcPubkey,
    vaultKeeperBtcPubkeys: params.vaultKeeperBtcPubkeys,
    universalChallengerBtcPubkeys: params.universalChallengerBtcPubkeys,
    timelockPegin: params.timelockPegin,
    timelockRefund: params.timelockRefund,
    hashlocks: [params.hashH],
    protocolFeeRate: params.protocolFeeRate,
    mempoolFeeRate: params.mempoolFeeRate,
    councilQuorum: params.councilQuorum,
    councilSize: params.councilSize,
    availableUTXOs: params.availableUTXOs,
    changeAddress: params.changeAddress,
  });

  const depositorBtcPubkeyRaw = await btcWallet.getPublicKeyHex();
  const depositorBtcPubkey =
    depositorBtcPubkeyRaw.length === 66
      ? depositorBtcPubkeyRaw.slice(2)
      : depositorBtcPubkeyRaw;

  const vaultData = peginResult.perVault[0];
  if (!vaultData) {
    throw new Error("preparePegin returned no per-vault data");
  }

  return {
    btcTxHash: ensureHexPrefix(vaultData.peginTxid),
    fundedPrePeginTxHex: peginResult.fundedPrePeginTxHex,
    peginTxHex: vaultData.peginTxHex,
    peginInputSignature: vaultData.peginInputSignature,
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
    unsignedPrePeginTx: params.unsignedPrePeginTxHex,
    depositorSignedPeginTx: params.peginTxHex,
    hashlock: params.hashlock,
    vaultProvider: params.vaultProviderAddress,
    onPopSigned: params.onPopSigned,
    depositorPayoutBtcAddress: params.depositorPayoutBtcAddress,
    depositorLamportPkHash: params.depositorLamportPkHash,
    preSignedBtcPopSignature: params.preSignedBtcPopSignature,
    htlcVout: 0,
  });

  return {
    transactionHash: registrationResult.ethTxHash,
    btcTxHash: registrationResult.vaultId,
    btcTxHex: params.unsignedPrePeginTxHex,
    btcPopSignature: registrationResult.btcPopSignature,
  };
}
