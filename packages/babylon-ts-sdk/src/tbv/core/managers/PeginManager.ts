/**
 * Peg-in Manager - Wallet Orchestration for Peg-in Operations
 *
 * This module provides the PeginManager class that orchestrates the complete
 * peg-in flow using SDK primitives, utilities, and wallet interfaces.
 *
 * @module managers/PeginManager
 */

import { Psbt, Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { encodeFunctionData, type Hex } from "viem";

import type {
  Address,
  EthereumWallet,
  Hash,
} from "../../../shared/wallets/interfaces/EthereumWallet";
import type { BitcoinWallet } from "../../../shared/wallets/interfaces/BitcoinWallet";
import { getUtxoInfo, pushTx, MEMPOOL_API_URLS } from "../clients/mempool";
import { BTCVaultsManagerABI } from "../contracts";
import { buildPeginPsbt, type Network } from "../primitives";
import {
  fundPeginTransaction,
  getNetwork,
  getPsbtInputFields,
  selectUtxosForPegin,
  type UTXO,
} from "../utils";

/**
 * Configuration for the PeginManager.
 */
export interface PeginManagerConfig {
  /**
   * Bitcoin network to use for transactions.
   */
  network: Network;

  /**
   * Bitcoin wallet for signing peg-in transactions.
   */
  btcWallet: BitcoinWallet;

  /**
   * Ethereum wallet for registering peg-in on-chain.
   */
  ethWallet: EthereumWallet;

  /**
   * Vault contract addresses.
   */
  vaultContracts: {
    /**
     * BTCVaultsManager contract address on Ethereum.
     */
    btcVaultsManager: Address;
  };

  /**
   * Optional custom mempool API URL.
   * Defaults to mempool.space for the configured network.
   */
  mempoolApiUrl?: string;
}

/**
 * Parameters for creating a peg-in transaction.
 */
export interface CreatePeginParams {
  /**
   * Amount to peg in (in satoshis).
   */
  amount: bigint;

  /**
   * Vault provider's Ethereum address.
   */
  vaultProvider: Address;

  /**
   * Vault provider's BTC public key (x-only, 64-char hex without 0x prefix).
   */
  vaultProviderBtcPubkey: string;

  /**
   * Liquidator BTC public keys (x-only, 64-char hex).
   */
  liquidatorBtcPubkeys: string[];

  /**
   * Available UTXOs from the depositor's wallet for funding the transaction.
   */
  availableUTXOs: UTXO[];

  /**
   * Fee rate in satoshis per vbyte for the transaction.
   */
  feeRate: number;

  /**
   * Bitcoin address for receiving change from the transaction.
   */
  changeAddress: string;
}

/**
 * Result of a peg-in preparation.
 */
export interface PeginResult {
  /**
   * Bitcoin transaction ID (will change after signing).
   */
  btcTxid: string;

  /**
   * Funded but unsigned transaction hex.
   * This transaction has inputs and outputs but is not yet signed.
   */
  fundedTxHex: string;

  /**
   * Vault script pubkey hex.
   */
  vaultScriptPubKey: string;

  /**
   * UTXOs selected for funding the transaction.
   */
  selectedUTXOs: UTXO[];

  /**
   * Transaction fee in satoshis.
   */
  fee: bigint;

  /**
   * Change amount in satoshis (if any).
   */
  changeAmount: bigint;

  /**
   * Ethereum transaction hash (peg-in registration).
   * Will be null until registerPeginOnChain is called.
   */
  ethTxHash: Hash | null;
}

/**
 * Parameters for signing and broadcasting a transaction.
 */
export interface SignAndBroadcastParams {
  /**
   * Funded transaction hex from preparePegin().
   */
  fundedTxHex: string;

  /**
   * Depositor's BTC public key (x-only, 64-char hex).
   * Can be provided with or without "0x" prefix.
   * Required for Taproot signing.
   */
  depositorBtcPubkey: string;
}

/**
 * Parameters for registering a peg-in on Ethereum.
 */
export interface RegisterPeginParams {
  /**
   * Depositor's BTC public key (x-only, 64-char hex).
   * Can be provided with or without "0x" prefix.
   */
  depositorBtcPubkey: string;

  /**
   * Funded but unsigned BTC transaction hex.
   */
  unsignedBtcTx: string;

  /**
   * Vault provider's Ethereum address.
   */
  vaultProvider: Address;
}

/**
 * Manager for orchestrating peg-in operations.
 *
 * This manager provides a high-level API for creating peg-in transactions
 * by coordinating between SDK primitives, utilities, and wallet interfaces.
 *
 * The complete peg-in flow consists of:
 * 1. preparePegin() - Build and fund the transaction
 * 2. registerPeginOnChain() - Submit to Ethereum contract
 * 3. signAndBroadcast() - Sign and broadcast to Bitcoin network
 */
export class PeginManager {
  private readonly config: PeginManagerConfig;

  /**
   * Creates a new PeginManager instance.
   *
   * @param config - Manager configuration including wallets and contract addresses
   */
  constructor(config: PeginManagerConfig) {
    this.config = config;
  }

  /**
   * Prepares a peg-in transaction by building and funding it.
   *
   * This method orchestrates the following steps:
   * 1. Get depositor BTC public key from wallet
   * 2. Build unfunded PSBT using primitives
   * 3. Select UTXOs using iterative fee calculation
   * 4. Fund transaction by adding inputs and change output
   *
   * The returned transaction is funded but unsigned. Use `signAndBroadcast()`
   * to complete the Bitcoin side, and `registerPeginOnChain()` for Ethereum.
   *
   * @param params - Peg-in parameters including amount, provider, UTXOs, and fee rate
   * @returns Peg-in result with funded transaction and selection details
   * @throws Error if wallet operations fail or insufficient funds
   */
  async preparePegin(params: CreatePeginParams): Promise<PeginResult> {
    // Step 1: Get depositor BTC public key from wallet
    const depositorBtcPubkeyRaw = await this.config.btcWallet.getPublicKeyHex();
    // Convert 33-byte compressed (66 chars) to 32-byte x-only (64 chars) if needed
    const depositorBtcPubkey = depositorBtcPubkeyRaw.length === 66
      ? depositorBtcPubkeyRaw.slice(2)  // Strip first byte (02 or 03)
      : depositorBtcPubkeyRaw;           // Already x-only

    // Step 2: Build unfunded PSBT using primitives
    // This creates a transaction with 0 inputs and 1 output (the vault output)
    const peginPsbt = await buildPeginPsbt({
      depositorPubkey: depositorBtcPubkey,
      claimerPubkey: params.vaultProviderBtcPubkey,
      challengerPubkeys: params.liquidatorBtcPubkeys,
      pegInAmount: params.amount,
      network: this.config.network,
    });

    // Step 3: Select UTXOs using iterative fee calculation
    // This handles the complexity of fee estimation based on input count
    const utxoSelection = selectUtxosForPegin(
      params.availableUTXOs,
      params.amount,
      params.feeRate,
    );

    // Step 4: Fund the transaction by adding inputs and change output
    const network = getNetwork(this.config.network);
    const fundedTxHex = fundPeginTransaction({
      unfundedTxHex: peginPsbt.psbtHex,
      selectedUTXOs: utxoSelection.selectedUTXOs,
      changeAddress: params.changeAddress,
      changeAmount: utxoSelection.changeAmount,
      network,
    });

    return {
      btcTxid: peginPsbt.txid,
      fundedTxHex,
      vaultScriptPubKey: peginPsbt.vaultScriptPubKey,
      selectedUTXOs: utxoSelection.selectedUTXOs,
      fee: utxoSelection.fee,
      changeAmount: utxoSelection.changeAmount,
      ethTxHash: null,
    };
  }

  /**
   * Signs and broadcasts a funded peg-in transaction to the Bitcoin network.
   *
   * This method:
   * 1. Parses the funded transaction hex
   * 2. Fetches UTXO data from mempool for each input
   * 3. Creates a PSBT with proper witnessUtxo/tapInternalKey
   * 4. Signs via btcWallet.signPsbt()
   * 5. Finalizes and extracts the transaction
   * 6. Broadcasts via mempool API
   *
   * @param params - Transaction hex and depositor public key
   * @returns The broadcasted Bitcoin transaction ID
   * @throws Error if signing or broadcasting fails
   */
  async signAndBroadcast(params: SignAndBroadcastParams): Promise<string> {
    const { fundedTxHex, depositorBtcPubkey } = params;

    // Step 1: Parse the funded transaction
    const cleanHex = fundedTxHex.startsWith("0x")
      ? fundedTxHex.slice(2)
      : fundedTxHex;
    const tx = Transaction.fromHex(cleanHex);

    if (tx.ins.length === 0) {
      throw new Error("Transaction has no inputs");
    }

    // Step 2: Create PSBT and add inputs with UTXO data from mempool
    const psbt = new Psbt();
    psbt.setVersion(tx.version);
    psbt.setLocktime(tx.locktime);

    // Strip 0x prefix if present before converting to Buffer
    const cleanPubkey = depositorBtcPubkey.startsWith("0x")
      ? depositorBtcPubkey.slice(2)
      : depositorBtcPubkey;
    // Validate x-only pubkey length and format (32 bytes = 64 hex chars)
    if (cleanPubkey.length !== 64 || !/^[0-9a-fA-F]+$/.test(cleanPubkey)) {
      throw new Error(
        "Invalid depositorBtcPubkey: expected 64 hex characters (x-only pubkey)",
      );
    }
    const publicKeyNoCoord = Buffer.from(cleanPubkey, "hex");
    if (publicKeyNoCoord.length !== 32) {
      throw new Error(
        `Invalid depositorBtcPubkey length: expected 32 bytes, got ${publicKeyNoCoord.length}`,
      );
    }
    const apiUrl = this.getMempoolApiUrl();

    // Fetch all UTXO data in parallel for better performance
    const utxoDataPromises = tx.ins.map((input) => {
      const txid = Buffer.from(input.hash).reverse().toString("hex");
      const vout = input.index;
      return getUtxoInfo(txid, vout, apiUrl).then((utxoData) => ({
        input,
        utxoData,
        txid,
        vout,
      }));
    });

    const inputsWithUtxoData = await Promise.all(utxoDataPromises);

    // Add inputs with proper PSBT fields based on script type
    for (const { input, utxoData, txid, vout } of inputsWithUtxoData) {
      const psbtInputFields = getPsbtInputFields(
        {
          txid,
          vout,
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

    // Step 3: Add outputs
    for (const output of tx.outs) {
      psbt.addOutput({
        script: output.script,
        value: output.value,
      });
    }

    // Step 4: Sign PSBT via wallet
    const signedPsbtHex = await this.config.btcWallet.signPsbt(psbt.toHex());
    const signedPsbt = Psbt.fromHex(signedPsbtHex);

    // Step 5: Finalize and extract transaction
    try {
      signedPsbt.finalizeAllInputs();
    } catch {
      // Some wallets finalize automatically, ignore errors
    }

    const signedTxHex = signedPsbt.extractTransaction().toHex();

    // Step 6: Broadcast to Bitcoin network
    const btcTxid = await pushTx(signedTxHex, apiUrl);

    return btcTxid;
  }

  /**
   * Registers a peg-in on Ethereum by calling the BTCVaultsManager contract.
   *
   * This method:
   * 1. Gets depositor ETH address from wallet
   * 2. Creates proof of possession (BTC signature of ETH address)
   * 3. Encodes the contract call using viem
   * 4. Sends transaction via ethWallet.sendTransaction()
   *
   * @param params - Registration parameters including BTC pubkey and unsigned tx
   * @returns Ethereum transaction hash
   * @throws Error if signing or transaction fails
   */
  async registerPeginOnChain(params: RegisterPeginParams): Promise<Hash> {
    const { depositorBtcPubkey, unsignedBtcTx, vaultProvider } = params;

    // Step 1: Get depositor ETH address
    const depositorEthAddress = await this.config.ethWallet.getAddress();

    // Step 2: Create proof of possession
    // The depositor signs their ETH address with their BTC key using ECDSA
    const popMessage = depositorEthAddress.toLowerCase();
    const btcPopSignatureRaw = await this.config.btcWallet.signMessage(popMessage, "ecdsa");

    // Convert PoP signature to hex format
    // BTC wallets return base64, Ethereum contracts expect hex
    let btcPopSignature: Hex;
    if (btcPopSignatureRaw.startsWith("0x")) {
      btcPopSignature = btcPopSignatureRaw as Hex;
    } else {
      const signatureBytes = Buffer.from(btcPopSignatureRaw, "base64");
      btcPopSignature = `0x${signatureBytes.toString("hex")}` as Hex;
    }

    // Step 3: Format parameters for contract call
    // Ensure depositor BTC pubkey is 32 bytes (bytes32)
    const depositorBtcPubkeyHex = depositorBtcPubkey.startsWith("0x")
      ? (depositorBtcPubkey as Hex)
      : (`0x${depositorBtcPubkey}` as Hex);

    // Ensure unsigned tx has 0x prefix
    const unsignedPegInTx = unsignedBtcTx.startsWith("0x")
      ? (unsignedBtcTx as Hex)
      : (`0x${unsignedBtcTx}` as Hex);

    // Step 4: Encode the contract call
    const callData = encodeFunctionData({
      abi: BTCVaultsManagerABI,
      functionName: "submitPeginRequest",
      args: [
        depositorEthAddress,
        depositorBtcPubkeyHex,
        btcPopSignature,
        unsignedPegInTx,
        vaultProvider,
      ],
    });

    // Step 5: Send transaction via wallet interface
    const txHash = await this.config.ethWallet.sendTransaction({
      to: this.config.vaultContracts.btcVaultsManager,
      data: callData,
    });

    return txHash;
  }

  /**
   * Gets the mempool API URL for the configured network.
   *
   * @returns The mempool API URL
   */
  private getMempoolApiUrl(): string {
    if (this.config.mempoolApiUrl) {
      return this.config.mempoolApiUrl;
    }

    // Map SDK network to mempool network
    const networkMap: Record<Network, keyof typeof MEMPOOL_API_URLS> = {
      bitcoin: "mainnet",
      testnet: "testnet",
      signet: "signet",
      regtest: "signet", // Use signet for regtest (no public regtest mempool)
    };

    const mempoolNetwork = networkMap[this.config.network] || "signet";
    return MEMPOOL_API_URLS[mempoolNetwork];
  }

  /**
   * Gets the configured Bitcoin network.
   *
   * @returns The Bitcoin network (mainnet, testnet, signet, regtest)
   */
  getNetwork(): Network {
    return this.config.network;
  }

  /**
   * Gets the configured BTCVaultsManager contract address.
   *
   * @returns The Ethereum address of the BTCVaultsManager contract
   */
  getVaultContractAddress(): Address {
    return this.config.vaultContracts.btcVaultsManager;
  }
}
