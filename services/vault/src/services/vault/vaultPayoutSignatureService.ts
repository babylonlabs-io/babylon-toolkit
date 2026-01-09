import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import type { Hex } from "viem";

import { VaultProviderRpcApi } from "../../clients/vault-provider-rpc";
import type { ClaimerTransactions } from "../../clients/vault-provider-rpc/types";
import { getBTCNetworkForWASM } from "../../config/pegin";
import {
  processPublicKeyToXOnly,
  stripHexPrefix,
  type Network,
} from "../../utils/btc";

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

/** Liquidator info needed for payout signing */
export interface PayoutLiquidator {
  /** Liquidator's BTC public key */
  btcPubKey: string;
}

/** Provider data for payout signing */
export interface PayoutProviders {
  /** Vault provider info */
  vaultProvider: PayoutVaultProvider;
  /** Liquidators for the application */
  liquidators: PayoutLiquidator[];
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
  liquidators: PayoutLiquidator[];
}): void {
  const {
    peginTxId,
    depositorBtcPubkey,
    claimerTransactions,
    vaultProvider,
    liquidators,
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

  if (!liquidators || liquidators.length === 0) {
    throw new Error("Invalid liquidators: must be a non-empty array");
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
 * Extract liquidator pubkeys from transaction graph JSON.
 * Returns pubkeys from graph if available, otherwise returns fallback.
 */
export function extractLiquidatorPubkeysFromGraph(
  graphJson: string | null,
  fallbackPubkeys: string[],
): string[] {
  if (!graphJson) {
    return fallbackPubkeys;
  }

  try {
    const graph = JSON.parse(graphJson);
    if (graph.liquidator_pubkeys && Array.isArray(graph.liquidator_pubkeys)) {
      return graph.liquidator_pubkeys.map((pk: string) => stripHexPrefix(pk));
    }
    return fallbackPubkeys;
  } catch {
    return fallbackPubkeys;
  }
}

/**
 * Get sorted liquidator pubkeys as fallback order.
 * Matches Rust backend behavior (lexicographic sort).
 */
export function getSortedLiquidatorPubkeys(
  liquidators: PayoutLiquidator[],
): string[] {
  return liquidators.map((liq) => stripHexPrefix(liq.btcPubKey)).sort();
}

/**
 * Fetch the PegIn claim transaction graph JSON from vault provider.
 * Returns null if the fetch fails.
 */
export async function fetchPeginClaimTxGraphJson(
  vaultProviderUrl: string,
  peginTxId: string,
): Promise<string | null> {
  const rpcClient = new VaultProviderRpcApi(vaultProviderUrl, 30000);
  try {
    const response = await rpcClient.getPeginClaimTxGraph({
      pegin_tx_id: stripHexPrefix(peginTxId),
    });
    return response.graph_json;
  } catch {
    return null;
  }
}

/**
 * Submit payout signatures to vault provider RPC.
 */
export async function submitSignaturesToVaultProvider(
  vaultProviderUrl: string,
  peginTxId: string,
  depositorBtcPubkey: string,
  signatures: Record<string, string>,
): Promise<void> {
  const rpcClient = new VaultProviderRpcApi(vaultProviderUrl, 30000);
  await rpcClient.submitPayoutSignatures({
    pegin_tx_id: stripHexPrefix(peginTxId),
    depositor_pk: depositorBtcPubkey,
    signatures,
  });
}

/** Context required for signing payout transactions */
export interface SigningContext {
  peginTxHex: string;
  vaultProviderBtcPubkey: string;
  liquidatorBtcPubkeys: string[];
  depositorBtcPubkey: string;
  network: Network;
}

/** A single transaction prepared for signing */
export interface PreparedTransaction {
  claimerPubkeyXOnly: string;
  payoutTxHex: string;
  claimTxHex: string;
}

/**
 * Prepare transactions for signing by extracting and normalizing pubkeys.
 */
export function prepareTransactionsForSigning(
  claimerTransactions: ClaimerTransactions[],
): PreparedTransaction[] {
  return claimerTransactions.map((tx) => ({
    claimerPubkeyXOnly: processPublicKeyToXOnly(tx.claimer_pubkey),
    payoutTxHex: tx.payout_tx.tx_hex,
    claimTxHex: tx.claim_tx.tx_hex,
  }));
}

/**
 * Sign a single payout transaction.
 * Returns the signature for the given prepared transaction.
 */
export async function signSingleTransaction(
  btcWallet: BitcoinWallet,
  context: SigningContext,
  transaction: PreparedTransaction,
): Promise<string> {
  return signPayoutTransaction(btcWallet, {
    payoutTxHex: transaction.payoutTxHex,
    peginTxHex: context.peginTxHex,
    claimTxHex: transaction.claimTxHex,
    vaultProviderBtcPubkey: context.vaultProviderBtcPubkey,
    liquidatorBtcPubkeys: context.liquidatorBtcPubkeys,
    network: context.network,
    depositorBtcPubkey: context.depositorBtcPubkey,
  });
}

/**
 * Sign all prepared transactions.
 * For use when caller doesn't need progress tracking.
 */
export async function signAllTransactions(
  btcWallet: BitcoinWallet,
  context: SigningContext,
  transactions: PreparedTransaction[],
): Promise<Record<string, string>> {
  const signatures: Record<string, string> = {};

  for (const tx of transactions) {
    signatures[tx.claimerPubkeyXOnly] = await signSingleTransaction(
      btcWallet,
      context,
      tx,
    );
  }

  return signatures;
}

/**
 * Prepare the signing context by fetching all required data.
 * Call this once, then use signSingleTransaction for each transaction.
 */
export async function prepareSigningContext(
  params: PrepareSigningContextParams,
): Promise<PreparedSigningData> {
  const { peginTxId, depositorBtcPubkey, providers } = params;
  const { vaultProvider, liquidators } = providers;

  // Fetch vault data from GraphQL
  const vault = await fetchVaultById(peginTxId as Hex);
  if (!vault?.unsignedBtcTx) {
    throw new Error("Vault or pegin transaction not found");
  }

  // Resolve vault provider's BTC public key
  const vaultProviderBtcPubkey =
    await resolveVaultProviderBtcPubkey(vaultProvider);

  // Get liquidator pubkey order from VP graph (with sorted fallback)
  const graphJson = await fetchPeginClaimTxGraphJson(
    vaultProvider.url,
    peginTxId,
  );
  const sortedFallback = getSortedLiquidatorPubkeys(liquidators);
  const liquidatorBtcPubkeys = extractLiquidatorPubkeysFromGraph(
    graphJson,
    sortedFallback,
  );

  return {
    context: {
      peginTxHex: vault.unsignedBtcTx,
      vaultProviderBtcPubkey,
      liquidatorBtcPubkeys,
      depositorBtcPubkey,
      network: getBTCNetworkForWASM(),
    },
    vaultProviderUrl: vaultProvider.url,
  };
}

/**
 * Sign payout transactions and submit signatures to vault provider.
 * Convenience function that handles preparation, signing, and submission.
 * For progress tracking, use prepareSigningContext + signSingleTransaction instead.
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
    liquidators: providers.liquidators,
  });

  // Prepare signing context
  const { context, vaultProviderUrl } = await prepareSigningContext({
    peginTxId,
    depositorBtcPubkey,
    providers,
  });

  // Prepare and sign all transactions
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
