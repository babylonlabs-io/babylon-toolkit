import type { Hex } from 'viem';
import { VaultProviderRpcApi } from '../../clients/vault-provider-rpc';
import type { ClaimerTransactions } from '../../clients/vault-provider-rpc/types';
import { signPayoutTransaction } from './vaultPayoutSigningService';
import { stripHexPrefix } from '../../utils/btc';
import { getPeginRequest, getProviderBTCKey } from './vaultQueryService';
import { CONTRACTS } from '../../config/contracts';
import type { Network } from '../../utils/btc';
import { getBTCNetworkForWASM } from '../../config/pegin';

/**
 * Vault provider information
 */
export interface VaultProviderInfo {
  /** Ethereum address of the vault provider */
  address: Hex;
  /** RPC URL of the vault provider */
  url: string;
  /** BTC public key of the vault provider (x-only, 32 bytes hex) */
  btcPubkey?: string;
  /** Liquidator BTC public keys (x-only, 32 bytes hex, no 0x prefix) */
  liquidatorBtcPubkeys?: string[];
}

/**
 * BTC wallet provider for signing
 */
export interface BtcWalletProvider {
  signPsbt: (psbtHex: string) => Promise<string>;
}

/**
 * Parameters for signing and submitting payout signatures
 */
export interface SignAndSubmitPayoutSignaturesParams {
  /** Peg-in transaction ID */
  peginTxId: string;
  /** Depositor's BTC public key (32-byte x-only, no 0x prefix) */
  depositorBtcPubkey: string;
  /** Transactions to sign from vault provider */
  claimerTransactions: ClaimerTransactions[];
  /** Vault provider information */
  vaultProvider: VaultProviderInfo;
  /** BTC wallet provider for signing */
  btcWalletProvider: BtcWalletProvider;
}

/**
 * Sign payout transactions and submit signatures to vault provider
 *
 * This function:
 * 1. Fetches the pegin transaction from the smart contract
 * 2. Fetches the vault provider's BTC public key
 * 3. Extracts liquidator BTC public keys from vault provider info
 * 4. For each claimer transaction (VP and liquidators):
 *    a. Signs the payout transaction using the complete Taproot spend info
 *    b. Extracts the Schnorr signature
 * 5. Submits all signatures to the vault provider's RPC
 *
 * @param params - Signing and submission parameters
 */
export async function signAndSubmitPayoutSignatures(
  params: SignAndSubmitPayoutSignaturesParams,
): Promise<void> {
  const {
    peginTxId,
    depositorBtcPubkey,
    claimerTransactions,
    vaultProvider,
    btcWalletProvider,
  } = params;

  console.log('[signAndSubmitPayoutSignatures] Starting payout signature flow');
  console.log('[signAndSubmitPayoutSignatures] PeginTxId:', peginTxId);
  console.log('[signAndSubmitPayoutSignatures] Depositor BTC pubkey:', depositorBtcPubkey);
  console.log('[signAndSubmitPayoutSignatures] Claimer transactions:', claimerTransactions.length);

  // Validate inputs
  if (!peginTxId || typeof peginTxId !== 'string') {
    throw new Error('Invalid peginTxId: must be a non-empty string');
  }

  if (!depositorBtcPubkey || typeof depositorBtcPubkey !== 'string') {
    throw new Error('Invalid depositorBtcPubkey: must be a non-empty string');
  }

  // Validate BTC public key format (should be 64 hex chars = 32 bytes, no 0x prefix)
  if (!/^[0-9a-fA-F]{64}$/.test(depositorBtcPubkey)) {
    throw new Error(
      'Invalid depositorBtcPubkey format: must be 64 hex characters (32-byte x-only public key, no 0x prefix)',
    );
  }

  if (!claimerTransactions || claimerTransactions.length === 0) {
    throw new Error(
      'Invalid claimerTransactions: must be a non-empty array',
    );
  }

  if (!vaultProvider?.address || !vaultProvider?.url) {
    throw new Error(
      'Invalid vaultProvider: must have address and url properties',
    );
  }

  // Step 1: Fetch pegin transaction from smart contract
  console.log('[signAndSubmitPayoutSignatures] Fetching pegin transaction from contract...');
  const peginRequest = await getPeginRequest(
    CONTRACTS.BTC_VAULTS_MANAGER,
    peginTxId as Hex,
  );

  if (!peginRequest.unsignedBtcTx) {
    throw new Error('Pegin transaction not found in contract');
  }

  const peginTxHex = peginRequest.unsignedBtcTx;
  console.log('[signAndSubmitPayoutSignatures] Pegin transaction hex length:', peginTxHex.length);

  // Step 2: Fetch vault provider's BTC public key (if not provided)
  let vaultProviderBtcPubkey: string;
  if (vaultProvider.btcPubkey) {
    vaultProviderBtcPubkey = stripHexPrefix(vaultProvider.btcPubkey);
  } else {
    console.log('[signAndSubmitPayoutSignatures] Fetching vault provider BTC pubkey...');
    const btcPubkeyHex = await getProviderBTCKey(
      CONTRACTS.BTC_VAULTS_MANAGER,
      vaultProvider.address,
    );
    vaultProviderBtcPubkey = stripHexPrefix(btcPubkeyHex);
  }

  console.log('[signAndSubmitPayoutSignatures] Vault provider BTC pubkey:', vaultProviderBtcPubkey);

  // Step 3: Get liquidator BTC public keys
  const liquidatorBtcPubkeys: string[] = vaultProvider.liquidatorBtcPubkeys || [];
  if (liquidatorBtcPubkeys.length === 0) {
    throw new Error('No liquidator BTC public keys provided in vault provider info');
  }

  // Strip 0x prefix from liquidator pubkeys
  const cleanLiquidatorPubkeys = liquidatorBtcPubkeys.map(stripHexPrefix);

  // IMPORTANT: The Rust backend SORTS liquidators lexicographically when building the payout script!
  // See: crates/vault/src/connectors/script_utils.rs line 30: sorted_signers.sort()
  const sortedLiquidatorPubkeys = [...cleanLiquidatorPubkeys].sort();

  // Step 4: Fetch transaction graph from vault provider to get exact liquidator order
  // The liquidator order in the graph is the canonical order used for script generation
  const rpcClient = new VaultProviderRpcApi(vaultProvider.url, 30000);
  let finalLiquidatorPubkeys = cleanLiquidatorPubkeys;

  try {
    const graphResponse = await rpcClient.getPeginClaimTxGraph({
      pegin_tx_id: stripHexPrefix(peginTxId),
    });

    const graph = JSON.parse(graphResponse.graph_json);

    // Use the exact liquidator order from the vault provider's graph
    // This is the order used to generate the payout script
    if (graph.liquidator_pubkeys && Array.isArray(graph.liquidator_pubkeys)) {
      finalLiquidatorPubkeys = graph.liquidator_pubkeys.map((pk: string) => stripHexPrefix(pk));
    } else {
      // CRITICAL FIX: Use sorted order to match Rust backend behavior
      finalLiquidatorPubkeys = sortedLiquidatorPubkeys;
    }
  } catch (error) {
    // CRITICAL FIX: The Rust backend ALWAYS sorts liquidators when building the script
    // We must use the sorted order to match the sighash computation
    finalLiquidatorPubkeys = sortedLiquidatorPubkeys;
  }

  // Step 5: Get BTC network
  const network: Network = getBTCNetworkForWASM();

  // Step 6: Sign payout transactions for each claimer
  // Each payout transaction needs a Schnorr signature (64 bytes) from the depositor
  const signatures: Record<string, string> = {};

  for (const claimerTx of claimerTransactions) {
    const payoutTxHex = claimerTx.payout_tx.tx_hex;
    const claimTxHex = claimerTx.claim_tx.tx_hex;
    const claimerPubkey = claimerTx.claimer_pubkey;

    // Convert claimer pubkey to x-only format (32 bytes, no prefix)
    // The RPC returns 33-byte compressed public keys (with 02/03 prefix)
    // But the vault provider's signature verification expects 32-byte x-only keys
    let claimerPubkeyXOnly = claimerPubkey;
    if (claimerPubkey.length === 66) {  // 33 bytes = compressed key with prefix
      // Strip the first byte (02 or 03 prefix) to get x-only coordinate
      claimerPubkeyXOnly = claimerPubkey.substring(2);
    } else if (claimerPubkey.length !== 64) {
      throw new Error(
        `Unexpected claimer pubkey length: ${claimerPubkey.length} chars (expected 64 or 66)`
      );
    }

    // Sign the payout transaction using the complete Taproot spend info
    // This extracts the Schnorr signature (64 bytes, no sighash flag)
    // IMPORTANT: Use finalLiquidatorPubkeys (from VP graph) to ensure correct script/sighash
    const signature = await signPayoutTransaction({
      payoutTxHex,
      peginTxHex,
      claimTxHex,
      depositorBtcPubkey,
      vaultProviderBtcPubkey,
      liquidatorBtcPubkeys: finalLiquidatorPubkeys,  // Use VP's canonical order
      network,
      btcWalletProvider,
    });

    // Map x-only claimer pubkey to depositor's signature
    // The vault provider expects x-only keys (32 bytes) as map keys
    signatures[claimerPubkeyXOnly] = signature;
  }

  // Step 7: Submit signatures to vault provider RPC (rpcClient already created earlier)

  // Note: Bitcoin Txid expects hex without "0x" prefix (64 chars)
  // Frontend uses Ethereum-style "0x"-prefixed hex, so we strip it
  await rpcClient.submitPayoutSignatures({
    pegin_tx_id: stripHexPrefix(peginTxId),
    depositor_pk: depositorBtcPubkey,
    signatures,
  });
}
