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
 * Parameters for preparing a pegin transaction (always batch-shaped).
 * Single-vault callers pass single-element arrays for pegInAmounts and hashlocks.
 */
export interface PreparePeginParams {
  /** Amounts to peg in per vault (satoshis), one per HTLC output */
  pegInAmounts: readonly bigint[];
  /** Protocol fee rate in sat/vB from contract offchain params */
  protocolFeeRate: bigint;
  /** Mempool fee rate in sat/vB for UTXO selection and funding */
  mempoolFeeRate: number;
  changeAddress: string;
  vaultProviderBtcPubkey: string;
  vaultKeeperBtcPubkeys: string[];
  universalChallengerBtcPubkeys: string[];
  /** CSV timelock in blocks for the PegIn vault output */
  timelockPegin: number;
  /** CSV timelock in blocks for the Pre-PegIn HTLC refund path */
  timelockRefund: number;
  /** SHA256 hash commitments, one per vault (64 hex chars each, no 0x prefix) */
  hashlocks: readonly string[];
  /** M in M-of-N council multisig */
  councilQuorum: number;
  /** N in M-of-N council multisig */
  councilSize: number;
  availableUTXOs: UTXO[];
}

/**
 * Per-vault result from a pegin preparation.
 */
export interface PeginVaultResult {
  /** Zero-based HTLC output index in the Pre-PegIn tx */
  htlcVout: number;
  /** Vault ID: hash of the pegin tx */
  btcTxHash: Hex;
  /** PegIn tx hex for this vault */
  peginTxHex: string;
  /** PegIn tx ID */
  peginTxid: string;
  /** Depositor's Schnorr signature over PegIn input */
  peginInputSignature: string;
}

/**
 * Result of preparing a pegin transaction.
 * Always batch-shaped — single vault is perVault with one element.
 */
export interface PreparePeginResult {
  /** Funded Pre-PegIn tx hex (shared across all vaults) */
  fundedPrePeginTxHex: string;
  /** Unfunded Pre-PegIn tx hex (for contract DA submission) */
  unsignedPrePeginTxHex: string;
  /** Per-vault results (one per HTLC output) */
  perVault: PeginVaultResult[];
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
  /** Zero-based index of the HTLC output in the Pre-PegIn tx this PegIn spends */
  htlcVout: number;
  vaultProviderAddress: Address;
  onPopSigned?: () => void | Promise<void>;
  /** Depositor's BTC payout address (e.g. bc1p...) */
  depositorPayoutBtcAddress: string;
  /** Keccak256 hash of the depositor's WOTS public key */
  depositorWotsPkHash: Hex;
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
 * Creates ONE Pre-PegIn tx with N HTLC outputs (one per vault), derives N PegIn txs,
 * and signs each PegIn input. Single-vault deposits pass single-element arrays.
 */
export async function preparePeginTransaction(
  btcWallet: BitcoinWallet,
  ethWallet: WalletClient,
  params: PreparePeginParams,
): Promise<PreparePeginResult> {
  const peginManager = createPeginManager(btcWallet, ethWallet);

  const result = await peginManager.preparePegin({
    amounts: params.pegInAmounts,
    vaultProviderBtcPubkey: params.vaultProviderBtcPubkey,
    vaultKeeperBtcPubkeys: params.vaultKeeperBtcPubkeys,
    universalChallengerBtcPubkeys: params.universalChallengerBtcPubkeys,
    timelockPegin: params.timelockPegin,
    timelockRefund: params.timelockRefund,
    hashlocks: params.hashlocks,
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

  return {
    fundedPrePeginTxHex: result.fundedPrePeginTxHex,
    unsignedPrePeginTxHex: result.unsignedPrePeginTxHex,
    perVault: result.perVault.map((v) => ({
      htlcVout: v.htlcVout,
      btcTxHash: ensureHexPrefix(v.peginTxid),
      peginTxHex: v.peginTxHex,
      peginTxid: v.peginTxid,
      peginInputSignature: v.peginInputSignature,
    })),
    selectedUTXOs: result.selectedUTXOs,
    fee: result.fee,
    depositorBtcPubkey,
  };
}

/**
 * Register a prepared pegin on Ethereum (PoP signature + contract call).
 *
 * This is the second half of the pegin flow, called after the WOTS
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
    htlcVout: params.htlcVout,
    vaultProvider: params.vaultProviderAddress,
    onPopSigned: params.onPopSigned,
    depositorPayoutBtcAddress: params.depositorPayoutBtcAddress,
    depositorWotsPkHash: params.depositorWotsPkHash,
    preSignedBtcPopSignature: params.preSignedBtcPopSignature,
  });

  return {
    transactionHash: registrationResult.ethTxHash,
    btcTxHash: registrationResult.vaultId,
    btcTxHex: params.unsignedPrePeginTxHex,
    btcPopSignature: registrationResult.btcPopSignature,
  };
}
