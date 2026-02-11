/**
 * Vault Split Pegin Service
 *
 * Custom pegin creation for unbroadcasted split transaction outputs.
 * Bypasses SDK's PeginManager to avoid mempool fetches for UTXOs that don't exist on-chain yet.
 *
 * This service replicates PeginManager.preparePegin() logic but uses local UTXO data
 * from the split transaction instead of fetching from mempool.
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

import { getMempoolApiUrl } from "../../clients/btc/config";
import { CONTRACTS } from "../../config/contracts";
import { getBTCNetworkForWASM } from "../../config/pegin";

/**
 * Parameters for preparing a pegin from split output
 */
export interface PrepareSplitPeginParams {
  pegInAmount: bigint;
  feeRate: number;
  changeAddress: string;
  vaultProviderAddress: Address;
  vaultProviderBtcPubkey: string;
  vaultKeeperBtcPubkeys: string[];
  universalChallengerBtcPubkeys: string[];
  /** The split transaction output to use (with full UTXO data) */
  splitOutput: UTXO;
  btcWallet: BitcoinWallet;
}

/**
 * Result of preparing a split pegin
 */
export interface PrepareSplitPeginResult {
  btcTxHash: string;
  fundedTxHex: string;
  vaultScriptPubKey: string;
  selectedUTXOs: UTXO[];
  fee: bigint;
  changeAmount: bigint;
  depositorBtcPubkey: string;
}

/**
 * Parameters for registering a split pegin on-chain
 */
export interface RegisterSplitPeginParams {
  depositorBtcPubkey: string;
  unsignedBtcTx: string;
  vaultProviderAddress: Address;
  btcWallet: BitcoinWallet;
  ethWallet: WalletClient;
  onPopSigned?: () => void | Promise<void>;
}

/**
 * Result of registering a split pegin
 */
export interface RegisterSplitPeginResult {
  ethTxHash: Hex;
  vaultId: Hex;
}

/**
 * Parameters for broadcasting a pegin with local UTXO data
 */
export interface BroadcastSplitPeginParams {
  fundedTxHex: string;
  depositorBtcPubkey: string;
  /** Split outputs with full UTXO data (no mempool fetch needed) */
  splitOutputs: UTXO[];
  btcWallet: BitcoinWallet;
}

/**
 * Prepare a pegin transaction using an unbroadcasted split output
 *
 * This function replicates PeginManager.preparePegin() but uses local UTXO data
 * instead of fetching from mempool. This allows creating pegins that reference
 * split transaction outputs before the split TX is broadcasted.
 *
 * @param params - Pegin parameters with split output data
 * @returns Prepared pegin result with funded transaction
 */
export async function preparePeginFromSplitOutput(
  params: PrepareSplitPeginParams,
): Promise<PrepareSplitPeginResult> {
  try {
    const network = getBTCNetworkForWASM();
    const btcNetwork = getNetwork(network);

    // Step 1: Get depositor BTC public key
    const depositorBtcPubkeyRaw = await params.btcWallet.getPublicKeyHex();
    const depositorBtcPubkey =
      depositorBtcPubkeyRaw.length === 66
        ? depositorBtcPubkeyRaw.slice(2) // Strip first byte (02 or 03)
        : depositorBtcPubkeyRaw; // Already x-only

    // Strip "0x" prefix from BTC public keys if present
    const vaultProviderBtcPubkey = params.vaultProviderBtcPubkey.startsWith(
      "0x",
    )
      ? params.vaultProviderBtcPubkey.slice(2)
      : params.vaultProviderBtcPubkey;
    const vaultKeeperBtcPubkeys = params.vaultKeeperBtcPubkeys.map((k) =>
      k.startsWith("0x") ? k.slice(2) : k,
    );
    const universalChallengerBtcPubkeys =
      params.universalChallengerBtcPubkeys.map((k) =>
        k.startsWith("0x") ? k.slice(2) : k,
      );

    // Step 2: Build unfunded PSBT using primitives
    const peginPsbt = await buildPeginPsbt({
      depositorPubkey: depositorBtcPubkey,
      vaultProviderPubkey: vaultProviderBtcPubkey,
      vaultKeeperPubkeys: vaultKeeperBtcPubkeys,
      universalChallengerPubkeys: universalChallengerBtcPubkeys,
      pegInAmount: params.pegInAmount,
      network,
    });

    // Step 3: Select UTXOs (just the split output)
    const utxoSelection = selectUtxosForPegin(
      [params.splitOutput],
      params.pegInAmount,
      params.feeRate,
    );

    // Step 4: Fund the transaction
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
      depositorBtcPubkey,
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Register a split pegin on Ethereum
 *
 * Uses SDK's PeginManager.registerPeginOnChain() which doesn't require mempool access.
 *
 * @param params - Registration parameters
 * @returns Ethereum transaction hash and vault ID
 */
export async function registerSplitPeginOnChain(
  params: RegisterSplitPeginParams,
): Promise<RegisterSplitPeginResult> {
  try {
    // Create PeginManager instance (only for registerPeginOnChain)
    const peginManager = new PeginManager({
      btcNetwork: getBTCNetworkForWASM(),
      btcWallet: params.btcWallet,
      ethWallet: params.ethWallet,
      ethChain: getETHChain(),
      vaultContracts: {
        btcVaultsManager: CONTRACTS.BTC_VAULTS_MANAGER,
      },
      mempoolApiUrl: getMempoolApiUrl(),
    });

    // Register on-chain (this doesn't fetch from mempool)
    const result = await peginManager.registerPeginOnChain({
      depositorBtcPubkey: params.depositorBtcPubkey,
      unsignedBtcTx: params.unsignedBtcTx,
      vaultProvider: params.vaultProviderAddress,
      onPopSigned: params.onPopSigned,
    });

    return result;
  } catch (error) {
    throw error;
  }
}

/**
 * Broadcast a pegin transaction using local UTXO data
 *
 * This function signs and broadcasts a pegin transaction without fetching from mempool.
 * It uses the split output data provided locally to construct the PSBT.
 *
 * @param params - Broadcast parameters with local UTXO data
 * @returns Bitcoin transaction ID
 */
export async function broadcastPeginWithLocalUtxo(
  params: BroadcastSplitPeginParams,
): Promise<string> {
  try {
    const { fundedTxHex, depositorBtcPubkey, splitOutputs, btcWallet } = params;

    // Step 1: Parse the funded transaction
    const cleanHex = fundedTxHex.startsWith("0x")
      ? fundedTxHex.slice(2)
      : fundedTxHex;
    const tx = Transaction.fromHex(cleanHex);

    if (tx.ins.length === 0) {
      throw new Error("Transaction has no inputs");
    }

    // Step 2: Create PSBT
    const psbt = new Psbt();
    psbt.setVersion(tx.version);
    psbt.setLocktime(tx.locktime);

    // Prepare public key for Taproot signing
    const cleanPubkey = depositorBtcPubkey.startsWith("0x")
      ? depositorBtcPubkey.slice(2)
      : depositorBtcPubkey;
    if (cleanPubkey.length !== 64 || !/^[0-9a-fA-F]+$/.test(cleanPubkey)) {
      throw new Error(
        "Invalid depositorBtcPubkey: expected 64 hex characters (x-only pubkey)",
      );
    }
    const publicKeyNoCoord = Buffer.from(cleanPubkey, "hex");

    // Step 3: Add inputs using LOCAL UTXO data (no mempool fetch!)
    for (let i = 0; i < tx.ins.length; i++) {
      const input = tx.ins[i];
      const txid = Buffer.from(input.hash).reverse().toString("hex");
      const vout = input.index;

      // Find matching split output by txid:vout
      const utxoData = splitOutputs.find(
        (u) => u.txid === txid && u.vout === vout,
      );

      if (!utxoData) {
        throw new Error(
          `Missing UTXO data for input ${txid}:${vout}. ` +
            `Available split outputs: ${splitOutputs.map((u) => `${u.txid.slice(0, 8)}:${u.vout}`).join(", ")}`,
        );
      }

      // Get PSBT input fields using local data
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

    // Step 4: Add outputs
    for (const output of tx.outs) {
      psbt.addOutput({
        script: output.script,
        value: output.value,
      });
    }

    // Step 5: Sign PSBT via wallet
    const signedPsbtHex = await btcWallet.signPsbt(psbt.toHex());
    const signedPsbt = Psbt.fromHex(signedPsbtHex);

    // Step 6: Finalize and extract transaction
    try {
      signedPsbt.finalizeAllInputs();
    } catch {
      // Some wallets finalize automatically, ignore errors
    }

    const signedTxHex = signedPsbt.extractTransaction().toHex();

    // Step 7: Broadcast to Bitcoin network
    const btcTxid = await pushTx(signedTxHex, getMempoolApiUrl());

    return btcTxid;
  } catch (error) {
    throw error;
  }
}
