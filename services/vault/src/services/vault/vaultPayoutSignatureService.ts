import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import { PayoutManager, type Network } from "@babylonlabs-io/ts-sdk/tbv/core";
import type { Hex } from "viem";

import { VaultProviderRpcApi } from "../../clients/vault-provider-rpc";
import type {
  ClaimerSignatures,
  ClaimerTransactions,
} from "../../clients/vault-provider-rpc/types";
import { getBTCNetworkForWASM } from "../../config/pegin";
import type { UniversalChallenger } from "../../types";
import {
  processPublicKeyToXOnly,
  stripHexPrefix,
  validateXOnlyPubkey,
} from "../../utils/btc";
import { fetchVaultKeepersByVersion } from "../providers/fetchProviders";

import { fetchVaultProviderById } from "./fetchVaultProviders";
import { fetchVaultById } from "./fetchVaults";

/** Vault provider info needed for payout signing */
export interface PayoutVaultProvider {
  /** Provider's Ethereum address */
  address: Hex;
  /** Provider's RPC URL */
  url: string;
  /** Provider's BTC public key (optional - will be fetched if not provided) */
  btcPubKey?: string;
}

/** Vault keeper info needed for payout signing */
export interface PayoutVaultKeeper {
  /** Vault keeper's BTC public key */
  btcPubKey: string;
}

/** Universal challenger info needed for payout signing */
export interface PayoutUniversalChallenger {
  /** Universal challenger's BTC public key */
  btcPubKey: string;
}

/** Provider data for payout signing */
export interface PayoutProviders {
  /** Vault provider info */
  vaultProvider: PayoutVaultProvider;
  /** Vault keepers for the application */
  vaultKeepers: PayoutVaultKeeper[];
  /** Universal challengers for the application */
  universalChallengers: PayoutUniversalChallenger[];
}

export interface SignAndSubmitPayoutSignaturesParams {
  peginTxId: string;
  depositorBtcPubkey: string;
  claimerTransactions: ClaimerTransactions[];
  providers: PayoutProviders;
  btcWallet: BitcoinWallet;
  /** Function to get UCs by version from context (for versioned payout signing) */
  getUniversalChallengersByVersion: (version: number) => UniversalChallenger[];
}

export interface PrepareSigningContextParams {
  peginTxId: string;
  depositorBtcPubkey: string;
  providers: PayoutProviders;
  /** Function to get UCs by version from context (avoids redundant fetch) */
  getUniversalChallengersByVersion: (version: number) => UniversalChallenger[];
}

export interface PreparedSigningData {
  context: SigningContext;
  vaultProviderUrl: string;
}

/**
 * Validate input parameters for payout signing.
 */
export function validatePayoutSignatureParams(params: {
  peginTxId: string;
  depositorBtcPubkey: string;
  claimerTransactions: ClaimerTransactions[];
  vaultProvider: PayoutVaultProvider;
  vaultKeepers: PayoutVaultKeeper[];
  universalChallengers: PayoutUniversalChallenger[];
}): void {
  const {
    peginTxId,
    depositorBtcPubkey,
    claimerTransactions,
    vaultProvider,
    vaultKeepers,
    universalChallengers,
  } = params;

  if (!peginTxId || typeof peginTxId !== "string") {
    throw new Error("Invalid peginTxId: must be a non-empty string");
  }

  validateXOnlyPubkey(depositorBtcPubkey);

  if (!claimerTransactions || claimerTransactions.length === 0) {
    throw new Error("Invalid claimerTransactions: must be a non-empty array");
  }

  if (!vaultProvider?.address || !vaultProvider?.url) {
    throw new Error(
      "Invalid vaultProvider: must have address and url properties",
    );
  }

  if (!vaultKeepers || vaultKeepers.length === 0) {
    throw new Error("Invalid vaultKeepers: must be a non-empty array");
  }

  if (!universalChallengers || universalChallengers.length === 0) {
    throw new Error("Invalid universalChallengers: must be a non-empty array");
  }
}

/**
 * Resolve vault provider's BTC public key.
 * Uses provided key or fetches from GraphQL if not provided.
 */
export async function resolveVaultProviderBtcPubkey(
  vaultProvider: PayoutVaultProvider,
): Promise<string> {
  if (vaultProvider.btcPubKey) {
    return stripHexPrefix(vaultProvider.btcPubKey);
  }

  const provider = await fetchVaultProviderById(vaultProvider.address);
  if (!provider) {
    throw new Error("Vault provider not found");
  }
  return stripHexPrefix(provider.btcPubKey);
}

/**
 * Get sorted vault keeper pubkeys.
 * Matches Rust backend behavior (lexicographic sort).
 */
export function getSortedVaultKeeperPubkeys(
  vaultKeepers: PayoutVaultKeeper[],
): string[] {
  return vaultKeepers.map((vk) => stripHexPrefix(vk.btcPubKey)).sort();
}

/**
 * Get sorted universal challenger pubkeys.
 * Matches Rust backend behavior (lexicographic sort).
 */
export function getSortedUniversalChallengerPubkeys(
  universalChallengers: PayoutUniversalChallenger[],
): string[] {
  return universalChallengers.map((uc) => stripHexPrefix(uc.btcPubKey)).sort();
}

/**
 * Submit payout signatures to vault provider RPC.
 * Now submits ClaimerSignatures (both PayoutOptimistic and Payout) for each claimer.
 */
export async function submitSignaturesToVaultProvider(
  vaultProviderUrl: string,
  peginTxId: string,
  depositorBtcPubkey: string,
  signatures: Record<string, ClaimerSignatures>,
): Promise<void> {
  const rpcClient = new VaultProviderRpcApi(vaultProviderUrl, 30000);
  await rpcClient.submitPayoutSignatures({
    pegin_txid: stripHexPrefix(peginTxId),
    depositor_pk: depositorBtcPubkey,
    signatures,
  });
}

/** Context required for signing payout transactions */
export interface SigningContext {
  peginTxHex: string;
  vaultProviderBtcPubkey: string;
  vaultKeeperBtcPubkeys: string[];
  universalChallengerBtcPubkeys: string[];
  depositorBtcPubkey: string;
  network: Network;
}

/**
 * A single claimer's transactions prepared for signing.
 * Contains both PayoutOptimistic and Payout transactions.
 */
export interface PreparedTransaction {
  claimerPubkeyXOnly: string;
  /** PayoutOptimistic transaction (optimistic path after Claim) */
  payoutOptimisticTxHex: string;
  /** Payout transaction (challenge path after Assert) */
  payoutTxHex: string;
  /** Claim transaction (for reference, used in PayoutOptimistic signing) */
  claimTxHex: string;
  /** Assert transaction (for reference, used in Payout signing) */
  assertTxHex: string;
}

/**
 * Prepare transactions for signing by extracting and normalizing pubkeys.
 */
export function prepareTransactionsForSigning(
  claimerTransactions: ClaimerTransactions[],
): PreparedTransaction[] {
  return claimerTransactions.map((tx) => ({
    claimerPubkeyXOnly: processPublicKeyToXOnly(tx.claimer_pubkey),
    payoutOptimisticTxHex: tx.payout_optimistic_tx.tx_hex,
    payoutTxHex: tx.payout_tx.tx_hex,
    claimTxHex: tx.claim_tx.tx_hex,
    assertTxHex: tx.assert_tx.tx_hex,
  }));
}

/** Type of payout transaction being signed */
export type SigningStepType = "payout_optimistic" | "payout";

/**
 * Sign a PayoutOptimistic transaction for a single claimer.
 *
 * @param btcWallet - Bitcoin wallet for signing
 * @param context - Signing context with vault data
 * @param transaction - Prepared transaction to sign
 * @returns PayoutOptimistic signature (64-byte hex)
 */
export async function signPayoutOptimistic(
  btcWallet: BitcoinWallet,
  context: SigningContext,
  transaction: PreparedTransaction,
): Promise<string> {
  try {
    const payoutManager = new PayoutManager({
      network: context.network,
      btcWallet,
    });

    const result = await payoutManager.signPayoutOptimisticTransaction({
      payoutOptimisticTxHex: transaction.payoutOptimisticTxHex,
      peginTxHex: context.peginTxHex,
      claimTxHex: transaction.claimTxHex,
      vaultProviderBtcPubkey: context.vaultProviderBtcPubkey,
      vaultKeeperBtcPubkeys: context.vaultKeeperBtcPubkeys,
      universalChallengerBtcPubkeys: context.universalChallengerBtcPubkeys,
      depositorBtcPubkey: context.depositorBtcPubkey,
    });

    return result.signature;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Failed to sign PayoutOptimistic transaction: ${error.message}`,
      );
    }
    throw new Error(
      "Failed to sign PayoutOptimistic transaction: Unknown error",
    );
  }
}

/**
 * Sign a Payout transaction for a single claimer.
 *
 * @param btcWallet - Bitcoin wallet for signing
 * @param context - Signing context with vault data
 * @param transaction - Prepared transaction to sign
 * @returns Payout signature (64-byte hex)
 */
export async function signPayout(
  btcWallet: BitcoinWallet,
  context: SigningContext,
  transaction: PreparedTransaction,
): Promise<string> {
  try {
    const payoutManager = new PayoutManager({
      network: context.network,
      btcWallet,
    });

    const result = await payoutManager.signPayoutTransaction({
      payoutTxHex: transaction.payoutTxHex,
      peginTxHex: context.peginTxHex,
      assertTxHex: transaction.assertTxHex,
      vaultProviderBtcPubkey: context.vaultProviderBtcPubkey,
      vaultKeeperBtcPubkeys: context.vaultKeeperBtcPubkeys,
      universalChallengerBtcPubkeys: context.universalChallengerBtcPubkeys,
      depositorBtcPubkey: context.depositorBtcPubkey,
    });

    return result.signature;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to sign Payout transaction: ${error.message}`);
    }
    throw new Error("Failed to sign Payout transaction: Unknown error");
  }
}

/** Detailed progress for payout signing (used by UI layer) */
export interface PayoutSigningProgress {
  /** Number of signing steps completed */
  completed: number;
  /** Total number of signing steps (2 per claimer) */
  total: number;
  /** Current step being signed */
  currentStep: SigningStepType | null;
  /** Current claimer index (1-based) */
  currentClaimer: number;
  /** Total number of claimers */
  totalClaimers: number;
}

/**
 * Sign all prepared transactions.
 * Returns ClaimerSignatures for each claimer pubkey.
 *
 * Note: For progress tracking, use signPayoutOptimistic/signPayout directly
 * in the UI layer to update progress between each signing step.
 *
 * @param btcWallet - Bitcoin wallet for signing
 * @param context - Signing context with vault data
 * @param transactions - Prepared transactions to sign
 */
export async function signAllTransactions(
  btcWallet: BitcoinWallet,
  context: SigningContext,
  transactions: PreparedTransaction[],
): Promise<Record<string, ClaimerSignatures>> {
  const signatures: Record<string, ClaimerSignatures> = {};

  for (const tx of transactions) {
    const payoutOptimisticSig = await signPayoutOptimistic(
      btcWallet,
      context,
      tx,
    );
    const payoutSig = await signPayout(btcWallet, context, tx);

    signatures[tx.claimerPubkeyXOnly] = {
      payout_optimistic_signature: payoutOptimisticSig,
      payout_signature: payoutSig,
    };
  }

  return signatures;
}

/**
 * Prepare the signing context by fetching all required data.
 * Call this once, then use signPayoutOptimistic/signPayout for each transaction.
 *
 * Uses versioned vault keepers (fetched) and universal challengers (from context)
 * based on the versions locked when the vault was created.
 */
export async function prepareSigningContext(
  params: PrepareSigningContextParams,
): Promise<PreparedSigningData> {
  const {
    peginTxId,
    depositorBtcPubkey,
    providers,
    getUniversalChallengersByVersion,
  } = params;
  const { vaultProvider } = providers;

  // Fetch vault data from GraphQL
  const vault = await fetchVaultById(peginTxId as Hex);
  if (!vault?.unsignedBtcTx) {
    throw new Error("Vault or pegin transaction not found");
  }

  // Fetch versioned vault keepers (per-application)
  const vaultKeepers = await fetchVaultKeepersByVersion(
    vault.applicationController,
    vault.appVaultKeepersVersion,
  );

  // Get versioned universal challengers from context (system-wide)
  const universalChallengers = getUniversalChallengersByVersion(
    vault.universalChallengersVersion,
  );

  if (universalChallengers.length === 0) {
    throw new Error(
      `No universal challengers found for version ${vault.universalChallengersVersion}`,
    );
  }

  // Resolve vault provider's BTC public key
  const vaultProviderBtcPubkey =
    await resolveVaultProviderBtcPubkey(vaultProvider);

  // Get pubkeys (sorted order matches Rust backend)
  const vaultKeeperBtcPubkeys = getSortedVaultKeeperPubkeys(
    vaultKeepers.map((vk) => ({ btcPubKey: vk.btcPubKey })),
  );
  const universalChallengerBtcPubkeys = getSortedUniversalChallengerPubkeys(
    universalChallengers.map((uc) => ({ btcPubKey: uc.btcPubKey })),
  );

  return {
    context: {
      peginTxHex: vault.unsignedBtcTx,
      vaultProviderBtcPubkey,
      vaultKeeperBtcPubkeys,
      universalChallengerBtcPubkeys,
      depositorBtcPubkey,
      network: getBTCNetworkForWASM(),
    },
    vaultProviderUrl: vaultProvider.url,
  };
}

/**
 * Sign payout transactions and submit signatures to vault provider.
 * Signs both PayoutOptimistic and Payout transactions for each claimer.
 * Convenience function that handles preparation, signing, and submission.
 *
 * Note: This function does not provide progress tracking. For progress updates,
 * use the lower-level functions (prepareSigningContext, signPayoutOptimistic,
 * signPayout) directly in the UI layer.
 */
export async function signAndSubmitPayoutSignatures(
  params: SignAndSubmitPayoutSignaturesParams,
): Promise<void> {
  const {
    peginTxId,
    depositorBtcPubkey,
    claimerTransactions,
    providers,
    btcWallet,
    getUniversalChallengersByVersion,
  } = params;

  // Validate inputs
  validatePayoutSignatureParams({
    peginTxId,
    depositorBtcPubkey,
    claimerTransactions,
    vaultProvider: providers.vaultProvider,
    vaultKeepers: providers.vaultKeepers,
    universalChallengers: providers.universalChallengers,
  });

  // Prepare signing context (uses versioned keepers and challengers)
  const { context, vaultProviderUrl } = await prepareSigningContext({
    peginTxId,
    depositorBtcPubkey,
    providers,
    getUniversalChallengersByVersion,
  });

  // Prepare and sign all transactions (both PayoutOptimistic and Payout)
  const preparedTransactions =
    prepareTransactionsForSigning(claimerTransactions);
  const signatures = await signAllTransactions(
    btcWallet,
    context,
    preparedTransactions,
  );

  // Submit signatures to vault provider RPC
  await submitSignaturesToVaultProvider(
    vaultProviderUrl,
    peginTxId,
    depositorBtcPubkey,
    signatures,
  );
}

/**
 * Check if wallet supports batch signing (signPsbts).
 * Batch signing allows signing all transactions with a single wallet interaction.
 */
export function walletSupportsBatchSigning(btcWallet: BitcoinWallet): boolean {
  return typeof btcWallet.signPsbts === "function";
}

/**
 * Sign all transactions in batch using signPsbts (single wallet popup).
 *
 * @param btcWallet - Bitcoin wallet with signPsbts support
 * @param context - Signing context with vault data
 * @param transactions - Prepared transactions to sign
 * @returns Signatures keyed by claimer pubkey
 */
export async function signAllTransactionsBatch(
  btcWallet: BitcoinWallet,
  context: SigningContext,
  transactions: PreparedTransaction[],
): Promise<Record<string, ClaimerSignatures>> {
  try {
    const payoutManager = new PayoutManager({
      network: context.network,
      btcWallet,
    });

    if (!payoutManager.supportsBatchSigning()) {
      throw new Error(
        "Wallet does not support batch signing (signPsbts method not available)",
      );
    }

    // Build batch signing params
    const results = await payoutManager.signPayoutTransactionsBatch(
      transactions.map((tx) => ({
        payoutOptimistic: {
          payoutOptimisticTxHex: tx.payoutOptimisticTxHex,
          peginTxHex: context.peginTxHex,
          claimTxHex: tx.claimTxHex,
          vaultProviderBtcPubkey: context.vaultProviderBtcPubkey,
          vaultKeeperBtcPubkeys: context.vaultKeeperBtcPubkeys,
          universalChallengerBtcPubkeys: context.universalChallengerBtcPubkeys,
          depositorBtcPubkey: context.depositorBtcPubkey,
        },
        payout: {
          payoutTxHex: tx.payoutTxHex,
          peginTxHex: context.peginTxHex,
          assertTxHex: tx.assertTxHex,
          vaultProviderBtcPubkey: context.vaultProviderBtcPubkey,
          vaultKeeperBtcPubkeys: context.vaultKeeperBtcPubkeys,
          universalChallengerBtcPubkeys: context.universalChallengerBtcPubkeys,
          depositorBtcPubkey: context.depositorBtcPubkey,
        },
      })),
    );

    // Map results to signatures record
    const signatures: Record<string, ClaimerSignatures> = {};
    for (let i = 0; i < transactions.length; i++) {
      signatures[transactions[i].claimerPubkeyXOnly] = {
        payout_optimistic_signature: results[i].payoutOptimisticSignature,
        payout_signature: results[i].payoutSignature,
      };
    }

    return signatures;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Failed to batch sign payout transactions: ${error.message}`,
      );
    }
    throw new Error("Failed to batch sign payout transactions: Unknown error");
  }
}
