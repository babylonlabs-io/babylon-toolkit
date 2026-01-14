import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import type { Hex } from "viem";

import { VaultProviderRpcApi } from "../../clients/vault-provider-rpc";
import type {
  ClaimerSignatures,
  ClaimerTransactions,
} from "../../clients/vault-provider-rpc/types";
import { getBTCNetworkForWASM } from "../../config/pegin";
import {
  processPublicKeyToXOnly,
  stripHexPrefix,
  type Network,
} from "../../utils/btc";
import { fetchKeepersAndChallengersByVersion } from "../providers/fetchProviders";

import { signPayoutTransaction } from "./btcPayoutSigner";
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
}

export interface PrepareSigningContextParams {
  peginTxId: string;
  depositorBtcPubkey: string;
  providers: PayoutProviders;
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

  if (!depositorBtcPubkey || typeof depositorBtcPubkey !== "string") {
    throw new Error("Invalid depositorBtcPubkey: must be a non-empty string");
  }

  if (!/^[0-9a-fA-F]{64}$/.test(depositorBtcPubkey)) {
    throw new Error(
      "Invalid depositorBtcPubkey format: must be 64 hex characters (32-byte x-only public key, no 0x prefix)",
    );
  }

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

/**
 * Sign both PayoutOptimistic and Payout transactions for a single claimer.
 * Returns ClaimerSignatures containing both signatures.
 *
 * TODO: Currently this is "blind signing" - the Claim and Assert transactions
 * are provided by the vault provider and we sign them without verification.
 * In the future, we should:
 * 1. Verify that the Claim tx structure matches expected format
 * 2. Verify that the Assert tx structure matches expected format
 * 3. Validate that outputs go to expected addresses
 * 4. Display transaction details to user before signing
 */
export async function signSingleClaimerTransactions(
  btcWallet: BitcoinWallet,
  context: SigningContext,
  transaction: PreparedTransaction,
): Promise<ClaimerSignatures> {
  // TODO: Verify Claim tx before using it for PayoutOptimistic signing
  // Currently blind signing - Claim tx is trusted from vault provider
  // Sign PayoutOptimistic transaction (uses Claim tx as input 1 reference)
  const payoutOptimisticSignature = await signPayoutTransaction(btcWallet, {
    payoutTxHex: transaction.payoutOptimisticTxHex,
    peginTxHex: context.peginTxHex,
    claimTxHex: transaction.claimTxHex,
    vaultProviderBtcPubkey: context.vaultProviderBtcPubkey,
    vaultKeeperBtcPubkeys: context.vaultKeeperBtcPubkeys,
    universalChallengerBtcPubkeys: context.universalChallengerBtcPubkeys,
    network: context.network,
    depositorBtcPubkey: context.depositorBtcPubkey,
  });

  // TODO: Verify Assert tx before using it for Payout signing
  // Currently blind signing - Assert tx is trusted from vault provider
  // Sign Payout transaction (uses Assert tx as input 1 reference)
  // Note: For the challenge path Payout tx, input 1 comes from Assert:0
  // We pass assertTxHex as claimTxHex since the PSBT builder uses it for input 1 prevout
  const payoutSignature = await signPayoutTransaction(btcWallet, {
    payoutTxHex: transaction.payoutTxHex,
    peginTxHex: context.peginTxHex,
    claimTxHex: transaction.assertTxHex, // Assert tx for challenge path
    vaultProviderBtcPubkey: context.vaultProviderBtcPubkey,
    vaultKeeperBtcPubkeys: context.vaultKeeperBtcPubkeys,
    universalChallengerBtcPubkeys: context.universalChallengerBtcPubkeys,
    network: context.network,
    depositorBtcPubkey: context.depositorBtcPubkey,
  });

  return {
    payout_optimistic_signature: payoutOptimisticSignature,
    payout_signature: payoutSignature,
  };
}

/**
 * Sign all prepared transactions.
 * Returns ClaimerSignatures for each claimer pubkey.
 */
export async function signAllTransactions(
  btcWallet: BitcoinWallet,
  context: SigningContext,
  transactions: PreparedTransaction[],
): Promise<Record<string, ClaimerSignatures>> {
  const signatures: Record<string, ClaimerSignatures> = {};

  for (const tx of transactions) {
    signatures[tx.claimerPubkeyXOnly] = await signSingleClaimerTransactions(
      btcWallet,
      context,
      tx,
    );
  }

  return signatures;
}

/**
 * Prepare the signing context by fetching all required data.
 * Call this once, then use signSingleClaimerTransactions for each transaction.
 *
 * Note: This function fetches versioned vault keepers and universal challengers
 * based on the versions locked when the vault was created, ignoring any
 * keepers/challengers passed in the providers param.
 */
export async function prepareSigningContext(
  params: PrepareSigningContextParams,
): Promise<PreparedSigningData> {
  const { peginTxId, depositorBtcPubkey, providers } = params;
  const { vaultProvider } = providers;

  // Fetch vault data from GraphQL
  const vault = await fetchVaultById(peginTxId as Hex);
  if (!vault?.unsignedBtcTx) {
    throw new Error("Vault or pegin transaction not found");
  }

  // Fetch versioned vault keepers and universal challengers
  // These are the keepers/challengers that were active when the vault was created
  const { vaultKeepers, universalChallengers } =
    await fetchKeepersAndChallengersByVersion(
      vault.applicationController,
      vault.appVaultKeepersVersion,
      vault.universalChallengersVersion,
    );

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
 * For progress tracking, use prepareSigningContext + signSingleClaimerTransactions instead.
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

  // Prepare signing context
  const { context, vaultProviderUrl } = await prepareSigningContext({
    peginTxId,
    depositorBtcPubkey,
    providers,
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
