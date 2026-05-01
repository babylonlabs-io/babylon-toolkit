/**
 * Vault Transaction Service - Business logic for write operations
 *
 * Orchestrates transaction operations that may require multiple steps
 * or fetching data before executing transactions.
 */

import { getETHChain } from "@babylonlabs-io/config";
import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import type {
  BatchPeginRequestItem,
  PopSignature,
  UTXO as SDKUtxo,
  WotsBlockPublicKey,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import { ensureHexPrefix, PeginManager } from "@babylonlabs-io/ts-sdk/tbv/core";
import type { Address, Hex, WalletClient } from "viem";

import { getMempoolApiUrl } from "../../clients/btc/config";
import { ethClient } from "../../clients/eth-contract/client";
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
 * Single-vault callers pass a single-element `pegInAmounts` array.
 *
 * Hashlocks are NOT a caller input — the SDK derives them from the
 * wallet root via `expandHashlockSecret`.
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
  /** Raw BTC pegin transaction hash (double-SHA256, with 0x prefix) */
  peginTxHash: Hex;
  /** PegIn tx hex for this vault */
  peginTxHex: string;
  /** PegIn tx ID (without 0x prefix) */
  peginTxid: string;
  /** Depositor's Schnorr signature over PegIn input */
  peginInputSignature: string;
}

/**
 * Result of preparing a pegin transaction.
 * Always batch-shaped — single vault is perVault with one element.
 */
export interface PreparePeginResult {
  /** Funded, pre-witness Pre-PegIn tx hex (shared across all vaults). */
  fundedPrePeginTxHex: string;
  /** Per-vault results (one per HTLC output) */
  perVault: PeginVaultResult[];
  selectedUTXOs: UTXO[];
  fee: bigint;
  /** x-only depositor pubkey snapshot used end-to-end across both passes. */
  depositorBtcPubkey: string;
  /** Per-vault WOTS public keys derived from the wallet root. */
  perVaultWotsKeys: WotsBlockPublicKey[][];
  /** Per-vault keccak256 of WOTS keys (for `depositorWotsPkHash`). */
  wotsPkHashes: Hex[];
  /** Per-vault HTLC preimage hex (no 0x prefix). Sensitive — do not log. */
  htlcSecretHexes: string[];
  /**
   * Raw 32-byte auth-anchor preimage as 64-char lowercase hex (no 0x).
   * Sent to the VP via `auth_createDepositorToken`. Sensitive — do
   * not log; do not persist.
   *
   * Known limitation: JS strings can't be wiped, so this value is
   * visible in any closure that captures it (incl. React DevTools)
   * until GC. Lifetime is bounded by `vpTokenRegistry.release` on
   * terminal flow paths.
   */
  authAnchorHex: string;
}

/**
 * Parameters for batch-registering multiple prepared pegins on-chain in a single ETH tx.
 */
export interface RegisterPeginBatchOnChainParams {
  /** Vault provider address (shared across all vaults) */
  vaultProviderAddress: Address;
  /** Shared Pre-PegIn tx hex for the whole batch */
  unsignedPrePeginTx: string;
  /** Per-vault registration data */
  requests: BatchPeginRequestItem[];
  /** Proof of possession from signProofOfPossession(). */
  popSignature: PopSignature;
}

/**
 * Result of batch-registering pegins on-chain.
 */
export interface RegisterPeginBatchResult {
  /** Ethereum transaction hash */
  ethTxHash: Hex;
  /** Per-vault results (same order as input requests) */
  vaults: Array<{
    vaultId: Hex;
    peginTxHash: Hex;
  }>;
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
    publicClient: ethClient.getPublicClient(),
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
 * signs each PegIn input, and derives per-vault WOTS keys + HTLC secrets from the
 * wallet root. Single-vault deposits pass a single-element `pegInAmounts` array.
 */
export async function preparePeginTransaction(
  btcWallet: BitcoinWallet,
  ethWallet: WalletClient,
  params: PreparePeginParams,
): Promise<PreparePeginResult> {
  const peginManager = createPeginManager(btcWallet, ethWallet);

  const { transaction, depositorBtcPubkey, derivedSecrets } =
    await peginManager.preparePegin({
      amounts: params.pegInAmounts,
      vaultProviderBtcPubkey: params.vaultProviderBtcPubkey,
      vaultKeeperBtcPubkeys: params.vaultKeeperBtcPubkeys,
      universalChallengerBtcPubkeys: params.universalChallengerBtcPubkeys,
      timelockPegin: params.timelockPegin,
      timelockRefund: params.timelockRefund,
      protocolFeeRate: params.protocolFeeRate,
      mempoolFeeRate: params.mempoolFeeRate,
      councilQuorum: params.councilQuorum,
      councilSize: params.councilSize,
      availableUTXOs: params.availableUTXOs,
      changeAddress: params.changeAddress,
    });

  return {
    fundedPrePeginTxHex: transaction.fundedPrePeginTxHex,
    perVault: transaction.perVault.map((v) => ({
      htlcVout: v.htlcVout,
      peginTxHash: ensureHexPrefix(v.peginTxid),
      peginTxHex: v.peginTxHex,
      peginTxid: v.peginTxid,
      peginInputSignature: v.peginInputSignature,
    })),
    selectedUTXOs: transaction.selectedUTXOs,
    fee: transaction.fee,
    depositorBtcPubkey,
    perVaultWotsKeys: derivedSecrets.perVaultWotsKeys,
    wotsPkHashes: derivedSecrets.wotsPkHashes,
    htlcSecretHexes: derivedSecrets.htlcSecretHexes,
    authAnchorHex: derivedSecrets.authAnchorHex,
  };
}

export async function signProofOfPossession(
  btcWallet: BitcoinWallet,
  ethWallet: WalletClient,
): Promise<PopSignature> {
  const peginManager = createPeginManager(btcWallet, ethWallet);
  return peginManager.signProofOfPossession();
}

/**
 * Batch-register multiple prepared pegins on Ethereum in a single transaction.
 * Uses submitPeginRequestBatch() so users only sign one ETH tx for N vaults.
 */
export async function registerPeginBatchOnChain(
  btcWallet: BitcoinWallet,
  ethWallet: WalletClient,
  params: RegisterPeginBatchOnChainParams,
): Promise<RegisterPeginBatchResult> {
  const peginManager = createPeginManager(btcWallet, ethWallet);

  const result = await peginManager.registerPeginBatchOnChain({
    vaultProvider: params.vaultProviderAddress,
    unsignedPrePeginTx: params.unsignedPrePeginTx,
    requests: params.requests,
    popSignature: params.popSignature,
  });

  return {
    ethTxHash: result.ethTxHash,
    vaults: result.vaults,
  };
}
