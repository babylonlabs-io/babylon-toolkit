import type { Hex } from "viem";

import { VaultProviderRpcApi } from "../../clients/vault-provider-rpc";
import type { ClaimerTransactions } from "../../clients/vault-provider-rpc/types";
import { getBTCNetworkForWASM } from "../../config/pegin";
import { stripHexPrefix, type Network } from "../../utils/btc";

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

export interface BtcWalletProvider {
  signPsbt: (psbtHex: string) => Promise<string>;
}

export interface SignAndSubmitPayoutSignaturesParams {
  peginTxId: string;
  depositorBtcPubkey: string;
  claimerTransactions: ClaimerTransactions[];
  providers: PayoutProviders;
  btcWalletProvider: BtcWalletProvider;
}

/**
 * Sign payout transactions and submit signatures to vault provider.
 * Fetches pegin data, signs each claimer transaction, and submits to VP RPC.
 */
export async function signAndSubmitPayoutSignatures(
  params: SignAndSubmitPayoutSignaturesParams,
): Promise<void> {
  const {
    peginTxId,
    depositorBtcPubkey,
    claimerTransactions,
    providers,
    btcWalletProvider,
  } = params;

  const { vaultProvider, liquidators } = providers;

  // Validate inputs
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

  // Fetch vault data from GraphQL
  const vault = await fetchVaultById(peginTxId as Hex);

  if (!vault || !vault.vault.unsignedBtcTx) {
    throw new Error("Vault or pegin transaction not found");
  }

  const peginTxHex = vault.vault.unsignedBtcTx;

  // Fetch vault provider's BTC public key (if not provided)
  let vaultProviderBtcPubkey: string;
  if (vaultProvider.btcPubKey) {
    vaultProviderBtcPubkey = stripHexPrefix(vaultProvider.btcPubKey);
  } else {
    const provider = await fetchVaultProviderById(vaultProvider.address);
    if (!provider) {
      throw new Error("Vault provider not found");
    }
    vaultProviderBtcPubkey = stripHexPrefix(provider.btcPubKey);
  }

  // Get liquidator BTC public keys
  const cleanLiquidatorPubkeys = liquidators.map((liq) =>
    stripHexPrefix(liq.btcPubKey),
  );

  // Pre-sort liquidators to match Rust backend behavior (lexicographic sort)
  // Rust: crates/vault/src/connectors/script_utils.rs:30 - sorted_signers.sort()
  const sortedLiquidatorPubkeys = [...cleanLiquidatorPubkeys].sort();

  // Fetch transaction graph from vault provider to get exact liquidator order
  // The VP's graph contains the canonical order used for script generation
  const rpcClient = new VaultProviderRpcApi(vaultProvider.url, 30000);
  let finalLiquidatorPubkeys = cleanLiquidatorPubkeys;

  try {
    const graphResponse = await rpcClient.getPeginClaimTxGraph({
      pegin_tx_id: stripHexPrefix(peginTxId),
    });

    const graph = JSON.parse(graphResponse.graph_json);

    if (graph.liquidator_pubkeys && Array.isArray(graph.liquidator_pubkeys)) {
      finalLiquidatorPubkeys = graph.liquidator_pubkeys.map((pk: string) =>
        stripHexPrefix(pk),
      );
    } else {
      finalLiquidatorPubkeys = sortedLiquidatorPubkeys;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    // Fallback to sorted order if VP graph fetch fails
    finalLiquidatorPubkeys = sortedLiquidatorPubkeys;
  }

  const network: Network = getBTCNetworkForWASM();
  const signatures: Record<string, string> = {};

  for (const claimerTx of claimerTransactions) {
    const payoutTxHex = claimerTx.payout_tx.tx_hex;
    const claimTxHex = claimerTx.claim_tx.tx_hex;
    const claimerPubkey = claimerTx.claimer_pubkey;

    // Convert claimer pubkey to x-only format (VP expects 32-byte x-only keys)
    let claimerPubkeyXOnly = claimerPubkey;
    if (claimerPubkey.length === 66) {
      claimerPubkeyXOnly = claimerPubkey.substring(2);
    } else if (claimerPubkey.length !== 64) {
      throw new Error(
        `Unexpected claimer pubkey length: ${claimerPubkey.length} chars (expected 64 or 66)`,
      );
    }

    // Sign using VP's canonical liquidator order to ensure correct sighash
    const signature = await signPayoutTransaction({
      payoutTxHex,
      peginTxHex,
      claimTxHex,
      depositorBtcPubkey,
      vaultProviderBtcPubkey,
      liquidatorBtcPubkeys: finalLiquidatorPubkeys,
      network,
      btcWalletProvider,
    });

    signatures[claimerPubkeyXOnly] = signature;
  }

  // Submit signatures to vault provider RPC
  await rpcClient.submitPayoutSignatures({
    pegin_tx_id: stripHexPrefix(peginTxId),
    depositor_pk: depositorBtcPubkey,
    signatures,
  });
}
