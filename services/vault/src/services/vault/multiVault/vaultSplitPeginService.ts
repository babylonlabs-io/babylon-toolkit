/**
 * Split Pegin Service
 *
 * Provides pegin creation for the SPLIT allocation strategy, where each vault's
 * pegin transaction spends an output from an **unconfirmed** split transaction
 * instead of a confirmed wallet UTXO.
 *
 * The standard SDK PeginManager flow fetches UTXO data from the mempool API,
 * which fails for outputs that do not yet exist on-chain. This service replicates
 * the same pegin construction logic but uses **local UTXO data** supplied by the
 * caller — data that was captured when the split transaction was built.
 *
 * Three entry points:
 *  1. `preparePeginFromSplitOutput`  – builds the pegin tx using local UTXO data
 *  2. `registerSplitPeginOnChain`    – submits the pegin to Ethereum (reuses SDK)
 *  3. `broadcastPeginWithLocalUtxo`  – signs and broadcasts the pegin without
 *                                      fetching anything from the mempool
 *
 * @module services/vault/multiVault/vaultSplitPeginService
 */

import { getETHChain } from "@babylonlabs-io/config";
import { pushTx } from "@babylonlabs-io/ts-sdk";
import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import type { UTXO } from "@babylonlabs-io/ts-sdk/tbv/core";
import {
  buildPeginPsbt,
  fundPeginTransaction,
  getNetwork,
  getPsbtInputFields,
  PeginManager,
  selectUtxosForPegin,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import { Psbt, Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import type { Address, Hex, WalletClient } from "viem";

import { getMempoolApiUrl } from "../../../clients/btc/config";
import { CONTRACTS } from "../../../config/contracts";
import { getBTCNetworkForWASM } from "../../../config/pegin";
import { stripHexPrefix, validateXOnlyPubkey } from "../../../utils/btc";

// ============================================================================
// Types
// ============================================================================

export interface PrepareSplitPeginParams {
  /** Vault deposit amount in satoshis */
  pegInAmount: bigint;
  /** Fee rate in sat/vByte */
  feeRate: number;
  /** BTC address for change output */
  changeAddress: string;
  /** Ethereum address of the vault provider */
  vaultProviderAddress: Address;
  /** Depositor's x-only BTC pubkey (64 hex chars, no "0x" prefix) */
  depositorBtcPubkey: string;
  /** Vault provider BTC pubkey (x-only, 64 hex chars; "0x" prefix stripped automatically) */
  vaultProviderBtcPubkey: string;
  /** Vault keeper BTC public keys */
  vaultKeeperBtcPubkeys: string[];
  /** Universal challenger BTC public keys */
  universalChallengerBtcPubkeys: string[];
  /** CSV timelock in blocks for the PegIn output */
  timelockPegin: number;
  /** Amount in satoshis for the depositor's claim output */
  depositorClaimValue: bigint;
  /**
   * The split transaction output that funds this pegin.
   * Must include `txid`, `vout`, `value`, and `scriptPubKey`.
   */
  splitOutput: UTXO;
}

export interface PrepareSplitPeginResult {
  /** Unsigned transaction hash (deterministic, computed before signing) */
  btcTxHash: string;
  /** Unsigned funded transaction hex (inputs + outputs, no signatures) */
  fundedTxHex: string;
  /** Vault script pubkey hex */
  vaultScriptPubKey: string;
  /** UTXOs consumed by the pegin (always just the single split output) */
  selectedUTXOs: UTXO[];
  /** Transaction fee in satoshis */
  fee: bigint;
  /** Change amount in satoshis */
  changeAmount: bigint;
  /** Depositor's x-only BTC pubkey (64 hex chars, no "0x") */
  depositorBtcPubkey: string;
}

export interface RegisterSplitPeginParams {
  /** Depositor's x-only BTC pubkey (64 hex chars) */
  depositorBtcPubkey: string;
  /** Unsigned pegin transaction hex */
  unsignedBtcTx: string;
  /** Ethereum address of the vault provider */
  vaultProviderAddress: Address;
  /**
   * Optional callback invoked after BIP-322 PoP signing but before the
   * Ethereum transaction. Useful for updating UI between signing steps.
   */
  onPopSigned?: () => void | Promise<void>;
  /** Keccak256 hash of the depositor's Lamport public key */
  depositorLamportPkHash?: Hex;
}

export interface RegisterSplitPeginResult {
  /** Ethereum transaction hash */
  ethTxHash: Hex;
  /** Vault ID returned by the contract — primary identifier for downstream flow */
  vaultId: Hex;
}

export interface BroadcastSplitPeginParams {
  /** Unsigned funded pegin transaction hex */
  fundedTxHex: string;
  /** Depositor's x-only BTC pubkey (64 hex chars) */
  depositorBtcPubkey: string;
  /**
   * All split transaction outputs.
   * Each input in the pegin tx is matched by txid:vout against this array.
   * No mempool lookup is performed — all UTXO data comes from here.
   */
  splitOutputs: UTXO[];
  /**
   * Function to sign a PSBT and return the signed PSBT hex.
   * Should be bound to the wallet's signPsbt method.
   */
  signPsbt: (psbtHex: string) => Promise<string>;
}

// ============================================================================
// Function 1: preparePeginFromSplitOutput
// ============================================================================

/**
 * Build a pegin transaction using local split UTXO data.
 *
 * Unlike `PeginManager.preparePegin()`, this function does **not** fetch UTXO
 * data from the mempool. Instead it accepts the split output directly, making
 * it suitable for spending outputs from unconfirmed split transactions.
 *
 * Steps:
 *  1. Validate depositor's x-only BTC pubkey format.
 *  2. Normalise all BTC pubkeys (strip "0x") via `stripHexPrefix()`.
 *  3. Build an unfunded PSBT with the vault output via `buildPeginPsbt()`.
 *  4. Select UTXOs (just the single split output) via `selectUtxosForPegin()`.
 *  5. Fund the transaction (add input + change) via `fundPeginTransaction()`.
 *
 * @param params - Pegin parameters including the local split output and depositor pubkey
 * @returns Unsigned funded transaction and associated metadata
 */
export async function preparePeginFromSplitOutput(
  params: PrepareSplitPeginParams,
): Promise<PrepareSplitPeginResult> {
  try {
    const network = getBTCNetworkForWASM();
    const btcNetwork = getNetwork(network);

    // Step 1: Validate depositor BTC public key (must be x-only: 32 bytes, 64 hex chars)
    validateXOnlyPubkey(params.depositorBtcPubkey);

    // Step 2: Strip "0x" prefix from BTC public keys if present
    const vaultProviderBtcPubkey = stripHexPrefix(
      params.vaultProviderBtcPubkey,
    );
    const vaultKeeperBtcPubkeys =
      params.vaultKeeperBtcPubkeys.map(stripHexPrefix);
    const universalChallengerBtcPubkeys =
      params.universalChallengerBtcPubkeys.map(stripHexPrefix);

    // Step 3: Build unfunded PSBT (creates vault output, no inputs yet)
    const peginPsbt = await buildPeginPsbt({
      depositorPubkey: params.depositorBtcPubkey,
      vaultProviderPubkey: vaultProviderBtcPubkey,
      vaultKeeperPubkeys: vaultKeeperBtcPubkeys,
      universalChallengerPubkeys: universalChallengerBtcPubkeys,
      timelockPegin: params.timelockPegin,
      pegInAmount: params.pegInAmount,
      depositorClaimValue: params.depositorClaimValue,
      network,
    });

    // Step 4: Select UTXOs — only the split output; no mempool fetch
    const utxoSelection = selectUtxosForPegin(
      [params.splitOutput],
      params.pegInAmount,
      params.feeRate,
    );

    // Step 5: Fund the transaction (add input + change output)
    const fundedTxHex = fundPeginTransaction({
      unfundedTxHex: peginPsbt.psbtHex,
      selectedUTXOs: utxoSelection.selectedUTXOs,
      changeAddress: params.changeAddress,
      changeAmount: utxoSelection.changeAmount,
      network: btcNetwork,
    });

    return {
      btcTxHash: peginPsbt.txid,
      fundedTxHex,
      vaultScriptPubKey: peginPsbt.vaultScriptPubKey,
      selectedUTXOs: utxoSelection.selectedUTXOs,
      fee: utxoSelection.fee,
      changeAmount: utxoSelection.changeAmount,
      depositorBtcPubkey: params.depositorBtcPubkey,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Failed to prepare pegin from split output: ${message}`);
  }
}

// ============================================================================
// Function 2: registerSplitPeginOnChain
// ============================================================================

/**
 * Submit a split pegin to the Ethereum vault contract.
 *
 * Reuses the SDK's `PeginManager.registerPeginOnChain()` which handles:
 *  - BIP-322 Proof-of-Possession signature creation
 *  - Ethereum transaction submission to the BTC Vaults Manager contract
 *
 * This step does **not** interact with the Bitcoin mempool.
 *
 * @param btcWallet - Bitcoin wallet for signing BIP-322 PoP
 * @param ethWallet - Ethereum wallet client for submitting transaction
 * @param params - Registration parameters including depositor pubkey and unsigned BTC tx
 * @returns Ethereum transaction hash and vault ID (primary identifier)
 */
export async function registerSplitPeginOnChain(
  btcWallet: BitcoinWallet,
  ethWallet: WalletClient,
  params: RegisterSplitPeginParams,
): Promise<RegisterSplitPeginResult> {
  try {
    const peginManager = new PeginManager({
      btcNetwork: getBTCNetworkForWASM(),
      btcWallet,
      ethWallet,
      ethChain: getETHChain(),
      vaultContracts: {
        btcVaultsManager: CONTRACTS.BTC_VAULTS_MANAGER,
      },
      mempoolApiUrl: getMempoolApiUrl(),
    });

    const result = await peginManager.registerPeginOnChain({
      depositorBtcPubkey: params.depositorBtcPubkey,
      unsignedBtcTx: params.unsignedBtcTx,
      vaultProvider: params.vaultProviderAddress,
      onPopSigned: params.onPopSigned,
      depositorLamportPkHash: params.depositorLamportPkHash,
    });

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Failed to register split pegin on-chain: ${message}`);
  }
}

// ============================================================================
// Function 3: broadcastPeginWithLocalUtxo
// ============================================================================

/**
 * Sign and broadcast a split pegin transaction using local UTXO data.
 *
 * Unlike `broadcastPeginTransaction()` in the standard flow, this function does
 * **not** fetch UTXO data from the mempool. Each input is matched against the
 * provided `splitOutputs` array by `txid:vout`. This is required because the
 * split transaction may still be unconfirmed when this function runs.
 *
 * Steps:
 *  1. Parse the unsigned funded transaction.
 *  2. Create a PSBT with version and locktime from the original transaction.
 *  3. For each input, look up the corresponding split output to get its
 *     `value` and `scriptPubKey` without any mempool fetch.
 *  4. Sign the PSBT via the wallet's signPsbt function.
 *  5. Finalize and broadcast to the Bitcoin network.
 *
 * @param params - Broadcast parameters including local split output data and signPsbt function
 * @returns The broadcasted Bitcoin transaction ID
 * @throws Error if a matching split output cannot be found for any input
 */
export async function broadcastPeginWithLocalUtxo(
  params: BroadcastSplitPeginParams,
): Promise<string> {
  const { fundedTxHex, depositorBtcPubkey, splitOutputs, signPsbt } = params;

  try {
    // Number of hex chars to show per txid in error messages (4 bytes = readable, unambiguous enough)
    const TXID_PREFIX_LENGTH = 8;

    // Step 1: Parse the funded transaction
    const tx = Transaction.fromHex(stripHexPrefix(fundedTxHex));

    if (tx.ins.length === 0) {
      throw new Error("Transaction has no inputs");
    }

    // Step 2: Create PSBT
    const psbt = new Psbt();
    psbt.setVersion(tx.version);
    psbt.setLocktime(tx.locktime);

    // Step 3: Validate and prepare x-only public key for Taproot signing
    const xOnlyPubkey = stripHexPrefix(depositorBtcPubkey);
    validateXOnlyPubkey(xOnlyPubkey);
    const publicKeyNoCoord = Buffer.from(xOnlyPubkey, "hex");

    // Step 4: Add inputs using LOCAL UTXO data — no mempool fetch
    for (let i = 0; i < tx.ins.length; i++) {
      const input = tx.ins[i];
      // Bitcoin stores txid in reverse byte order in raw transactions
      const txid = Buffer.from(input.hash).reverse().toString("hex");
      const vout = input.index;

      // Match against the provided split outputs by txid:vout
      const utxoData = splitOutputs.find(
        (u) => u.txid === txid && u.vout === vout,
      );

      if (!utxoData) {
        throw new Error(
          `Missing UTXO data for input ${txid}:${vout}. ` +
            `Available split outputs: ${splitOutputs
              .map((u) => `${u.txid.slice(0, TXID_PREFIX_LENGTH)}:${u.vout}`)
              .join(", ")}`,
        );
      }

      // Build PSBT input fields from local data (no mempool lookup)
      const psbtInputFields = getPsbtInputFields(
        {
          txid: utxoData.txid,
          vout: utxoData.vout,
          value: utxoData.value,
          scriptPubKey: utxoData.scriptPubKey,
        },
        publicKeyNoCoord,
      );

      psbt.addInput({
        hash: input.hash,
        index: input.index,
        sequence: input.sequence,
        ...psbtInputFields,
      });
    }

    // Step 5: Add outputs
    for (const output of tx.outs) {
      psbt.addOutput({
        script: output.script,
        value: output.value,
      });
    }

    // Step 6: Sign PSBT via wallet's signPsbt function
    const signedPsbtHex = await signPsbt(psbt.toHex());
    const signedPsbt = Psbt.fromHex(signedPsbtHex);

    // Step 7: Finalize inputs (some wallets finalize automatically)
    try {
      signedPsbt.finalizeAllInputs();
    } catch {
      // Ignore — wallet may have already finalized
    }

    const signedTxHex = signedPsbt.extractTransaction().toHex();

    // Step 8: Broadcast to Bitcoin network
    const btcTxid = await pushTx(signedTxHex, getMempoolApiUrl());

    return btcTxid;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Failed to broadcast split pegin transaction: ${message}`);
  }
}
