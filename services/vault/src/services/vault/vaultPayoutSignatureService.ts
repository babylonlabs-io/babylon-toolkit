import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import { PayoutManager, type Network } from "@babylonlabs-io/ts-sdk/tbv/core";
import type { Address, Hex } from "viem";

import { getVaultFromChain } from "../../clients/eth-contract/btc-vault-registry/query";
import { getTimelockPeginByVersion } from "../../clients/eth-contract/protocol-params";
import { VaultProviderRpcApi } from "../../clients/vault-provider-rpc";
import type {
  ClaimerSignatures,
  ClaimerTransactions,
  DepositorAsClaimerPresignatures,
} from "../../clients/vault-provider-rpc/types";
import { getBTCNetworkForWASM } from "../../config/pegin";
import type { UniversalChallenger } from "../../types";
import {
  processPublicKeyToXOnly,
  stripHexPrefix,
  validateXOnlyPubkey,
} from "../../utils/btc";
import { getVpProxyUrl } from "../../utils/rpc";
import { fetchVaultKeepersByVersion } from "../providers/fetchProviders";

import { fetchVaultProviderById } from "./fetchVaultProviders";

/** Vault provider info needed for payout signing */
export interface PayoutVaultProvider {
  /** Provider's BTC public key (optional - will be fetched from GraphQL if not provided) */
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

export interface PrepareSigningContextParams {
  /** Derived vault ID (for contract calls) */
  vaultId: string;
  depositorBtcPubkey: string;
  providers: PayoutProviders;
  /** Function to get UCs by version from context (avoids redundant fetch) */
  getUniversalChallengersByVersion: (version: number) => UniversalChallenger[];
  /** Depositor's registered payout scriptPubKey (hex) for payout output validation */
  registeredPayoutScriptPubKey: string;
}

export interface PreparedSigningData {
  context: SigningContext;
  vaultProviderAddress: Hex;
}

/**
 * Validate input parameters for payout signing.
 */
export function validatePayoutSignatureParams(params: {
  vaultId: string;
  depositorBtcPubkey: string;
  claimerTransactions: ClaimerTransactions[];
  vaultKeepers: PayoutVaultKeeper[];
  universalChallengers: PayoutUniversalChallenger[];
}): void {
  const {
    vaultId,
    depositorBtcPubkey,
    claimerTransactions,
    vaultKeepers,
    universalChallengers,
  } = params;

  if (!vaultId || typeof vaultId !== "string") {
    throw new Error("Invalid vaultId: must be a non-empty string");
  }

  validateXOnlyPubkey(depositorBtcPubkey);

  if (!claimerTransactions || claimerTransactions.length === 0) {
    throw new Error("Invalid claimerTransactions: must be a non-empty array");
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
  address: Address,
  btcPubKey?: string,
): Promise<string> {
  if (btcPubKey) {
    return stripHexPrefix(btcPubKey);
  }

  const provider = await fetchVaultProviderById(address);
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
 */
export async function submitSignaturesToVaultProvider(
  vaultProviderAddress: string,
  peginTxHash: string,
  depositorBtcPubkey: string,
  signatures: Record<string, ClaimerSignatures>,
  depositorClaimerPresignatures: DepositorAsClaimerPresignatures,
): Promise<void> {
  const rpcClient = new VaultProviderRpcApi(
    getVpProxyUrl(vaultProviderAddress),
    30000,
  );

  // The VP expects signatures for ALL claimers (VP + VKs + depositor).
  // The depositor's own payout signature comes from depositorClaimerPresignatures
  // and must be included in the signatures map.
  const allSignatures = { ...signatures };
  const depositorXOnly = stripHexPrefix(depositorBtcPubkey);
  allSignatures[depositorXOnly] =
    depositorClaimerPresignatures.payout_signatures;

  await rpcClient.submitDepositorPresignatures({
    pegin_txid: stripHexPrefix(peginTxHash),
    depositor_pk: stripHexPrefix(depositorBtcPubkey),
    signatures: allSignatures,
    depositor_claimer_presignatures: depositorClaimerPresignatures,
  });
}

/** Context required for signing payout transactions */
export interface SigningContext {
  peginTxHex: string;
  vaultProviderBtcPubkey: string;
  vaultKeeperBtcPubkeys: string[];
  universalChallengerBtcPubkeys: string[];
  depositorBtcPubkey: string;
  timelockPegin: number;
  network: Network;
  /** On-chain registered depositor payout scriptPubKey (hex) for payout output validation */
  registeredPayoutScriptPubKey: string;
}

/**
 * A single claimer's transactions prepared for signing.
 */
export interface PreparedTransaction {
  claimerPubkeyXOnly: string;
  /** Payout transaction (after Assert) */
  payoutTxHex: string;
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
    payoutTxHex: tx.payout_tx.tx_hex,
    assertTxHex: tx.assert_tx.tx_hex,
  }));
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
      timelockPegin: context.timelockPegin,
      registeredPayoutScriptPubKey: context.registeredPayoutScriptPubKey,
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
  /** Total number of claimers */
  totalClaimers: number;
}

/**
 * Prepare the signing context by fetching all required data.
 * Call this once, then use signPayout for each transaction.
 *
 * Uses versioned vault keepers (fetched) and universal challengers (from context)
 * based on the versions locked when the vault was created.
 */
export async function prepareSigningContext(
  params: PrepareSigningContextParams,
): Promise<PreparedSigningData> {
  const {
    vaultId,
    depositorBtcPubkey,
    providers,
    getUniversalChallengersByVersion,
    registeredPayoutScriptPubKey,
  } = params;
  // Fetch signing-critical vault fields from the contract (authoritative source).
  // Never use the GraphQL indexer for these values — a compromised indexer could
  // substitute a different pegin transaction or signer-set versions and obtain
  // signatures over attacker-chosen graph parameters.
  // Note: registeredPayoutScriptPubKey is passed in separately — the contract only
  // emits it in the PegInSubmitted event, it's not stored in the BTCVault struct.
  const vault = await getVaultFromChain(vaultId as Hex);

  const timelockPegin = await getTimelockPeginByVersion(
    vault.offchainParamsVersion,
  );

  // Fetch versioned vault keepers (per-application)
  const vaultKeepers = await fetchVaultKeepersByVersion(
    vault.applicationEntryPoint,
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

  // Resolve vault provider's BTC public key using the contract-authoritative address
  const vaultProviderBtcPubkey = await resolveVaultProviderBtcPubkey(
    vault.vaultProvider,
    providers.vaultProvider?.btcPubKey,
  );

  // Get pubkeys (sorted order matches Rust backend)
  const vaultKeeperBtcPubkeys = getSortedVaultKeeperPubkeys(
    vaultKeepers.map((vk) => ({ btcPubKey: vk.btcPubKey })),
  );
  const universalChallengerBtcPubkeys = getSortedUniversalChallengerPubkeys(
    universalChallengers.map((uc) => ({ btcPubKey: uc.btcPubKey })),
  );

  const signingContext = {
    peginTxHex: vault.depositorSignedPeginTx,
    vaultProviderBtcPubkey,
    vaultKeeperBtcPubkeys,
    universalChallengerBtcPubkeys,
    depositorBtcPubkey,
    timelockPegin,
    network: getBTCNetworkForWASM(),
    registeredPayoutScriptPubKey,
  };

  return {
    context: signingContext,
    vaultProviderAddress: vault.vaultProvider,
  };
}

/**
 * Check if wallet supports batch signing (signPsbts).
 * Batch signing allows signing all transactions with a single wallet interaction.
 *
 * Mobile wallets may not inject signPsbts, so callers should fall back to
 * sequential signPsbt when this returns false.
 *
 * @see signPsbtsWithFallback in utils/btc for the lower-level batch-or-sequential helper.
 */
export function walletSupportsBatchSigning(btcWallet: BitcoinWallet): boolean {
  return typeof btcWallet.signPsbts === "function";
}

/**
 * Sign all payout transactions in batch using signPsbts (single wallet popup).
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

    // Build batch signing params (1 Payout PSBT per claimer)
    const results = await payoutManager.signPayoutTransactionsBatch(
      transactions.map((tx) => ({
        payoutTxHex: tx.payoutTxHex,
        peginTxHex: context.peginTxHex,
        assertTxHex: tx.assertTxHex,
        vaultProviderBtcPubkey: context.vaultProviderBtcPubkey,
        vaultKeeperBtcPubkeys: context.vaultKeeperBtcPubkeys,
        universalChallengerBtcPubkeys: context.universalChallengerBtcPubkeys,
        depositorBtcPubkey: context.depositorBtcPubkey,
        timelockPegin: context.timelockPegin,
        registeredPayoutScriptPubKey: context.registeredPayoutScriptPubKey,
      })),
    );

    // Map results to signatures record
    const signatures: Record<string, ClaimerSignatures> = {};
    for (let i = 0; i < transactions.length; i++) {
      signatures[transactions[i].claimerPubkeyXOnly] = {
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

/**
 * Sign payout transactions with automatic batch/sequential detection.
 *
 * If the wallet supports batch signing (signPsbts), all transactions are signed
 * with a single wallet popup. Otherwise, transactions are signed one by one.
 *
 * @param btcWallet - Bitcoin wallet for signing
 * @param context - Signing context with vault data
 * @param transactions - Prepared transactions to sign
 * @param onProgress - Optional callback fired as signing progresses
 * @returns Signatures keyed by claimer pubkey
 */
export async function signPayoutTransactions(
  btcWallet: BitcoinWallet,
  context: SigningContext,
  transactions: PreparedTransaction[],
  onProgress?: (progress: PayoutSigningProgress) => void,
): Promise<Record<string, ClaimerSignatures>> {
  const totalClaimers = transactions.length;

  if (walletSupportsBatchSigning(btcWallet)) {
    onProgress?.({ completed: 0, totalClaimers });
    const signatures = await signAllTransactionsBatch(
      btcWallet,
      context,
      transactions,
    );
    onProgress?.({ completed: totalClaimers, totalClaimers });
    return signatures;
  }

  const signatures: Record<string, ClaimerSignatures> = {};

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    onProgress?.({ completed: i, totalClaimers });

    const payoutSig = await signPayout(btcWallet, context, tx);
    signatures[tx.claimerPubkeyXOnly] = {
      payout_signature: payoutSig,
    };
  }

  onProgress?.({ completed: totalClaimers, totalClaimers });
  return signatures;
}
