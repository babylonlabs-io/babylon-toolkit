/**
 * Peg-in Manager - Wallet Orchestration for Peg-in Operations
 *
 * This module provides the PeginManager class that orchestrates the complete
 * peg-in flow using SDK primitives, utilities, and wallet interfaces.
 *
 * @module managers/PeginManager
 */

import type {
  Address,
  EthereumWallet,
  Hash,
} from "../../../shared/wallets/interfaces/EthereumWallet";
import type { BitcoinWallet } from "../../../shared/wallets/interfaces/BitcoinWallet";
import { buildPeginPsbt, type Network } from "../primitives";
import {
  fundPeginTransaction,
  getNetwork,
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
   * Will be null until registerPeginOnChain is implemented.
   */
  ethTxHash: Hash | null;
}

/**
 * Manager for orchestrating peg-in operations.
 *
 * This manager provides a high-level API for creating peg-in transactions
 * by coordinating between SDK primitives, utilities, and wallet interfaces.
 *
 * Current implementation covers:
 * - Building unfunded peg-in PSBT using primitives
 * - Selecting UTXOs for funding
 * - Funding the transaction with inputs and change output
 *
 * Future implementation will add:
 * - Signing with Bitcoin wallet
 * - Broadcasting to Bitcoin network
 * - Registering on Ethereum
 *
 * @example
 * ```typescript
 * import { PeginManager } from '@babylonlabs-io/ts-sdk/tbv/core';
 * import { UnisatWallet, WagmiWallet } from './wallet-adapters';
 *
 * const peginManager = new PeginManager({
 *   network: 'signet',
 *   btcWallet: new UnisatWallet(),
 *   ethWallet: new WagmiWallet(),
 *   vaultContracts: {
 *     btcVaultsManager: '0x...',
 *   },
 * });
 *
 * // Prepare a peg-in transaction (build + fund)
 * const result = await peginManager.preparePegin({
 *   amount: 90000n,
 *   vaultProvider: '0x...',
 *   vaultProviderBtcPubkey: 'abc123...',
 *   liquidatorBtcPubkeys: ['def456...'],
 *   availableUTXOs: [...],
 *   feeRate: 10,
 *   changeAddress: 'tb1p...',
 * });
 *
 * console.log('Funded TX:', result.fundedTxHex);
 * console.log('Selected UTXOs:', result.selectedUTXOs);
 * console.log('Fee:', result.fee);
 * ```
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
   * (when implemented) to complete the flow.
   *
   * @param params - Peg-in parameters including amount, provider, UTXOs, and fee rate
   * @returns Peg-in result with funded transaction and selection details
   * @throws Error if wallet operations fail or insufficient funds
   *
   * @example
   * ```typescript
   * const result = await peginManager.preparePegin({
   *   amount: 90000n,
   *   vaultProvider: '0x1234...',
   *   vaultProviderBtcPubkey: 'abc123...',
   *   liquidatorBtcPubkeys: ['def456...'],
   *   availableUTXOs: utxos,
   *   feeRate: 10,
   *   changeAddress: 'tb1p...',
   * });
   * ```
   */
  async preparePegin(params: CreatePeginParams): Promise<PeginResult> {
    // Step 1: Get depositor BTC public key from wallet
    const depositorBtcPubkey = await this.config.btcWallet.getPublicKey();

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
      ethTxHash: null, // Will be populated when registerPeginOnChain is implemented
    };
  }

  /**
   * Signs and broadcasts a funded peg-in transaction.
   *
   * This method will:
   * 1. Convert funded transaction to PSBT format
   * 2. Sign PSBT with Bitcoin wallet
   * 3. Extract and broadcast signed transaction
   *
   * @param fundedTxHex - Funded transaction hex from preparePegin()
   * @returns Bitcoin transaction ID after broadcasting
   * @throws Error - Not yet implemented
   *
   * @remarks
   * This method is a placeholder for future implementation.
   * Currently throws an error indicating it's not implemented.
   */
  async signAndBroadcast(fundedTxHex: string): Promise<string> {
    // TODO: Implement in future PR
    // 1. Create PSBT from funded transaction
    // 2. Add witness UTXO data for each input
    // 3. Sign PSBT with Bitcoin wallet
    // 4. Finalize and extract transaction
    // 5. Broadcast to Bitcoin network via mempool API
    throw new Error(
      `signAndBroadcast not yet implemented. Received fundedTxHex length: ${fundedTxHex.length}`,
    );
  }

  /**
   * Registers a peg-in on Ethereum by calling the BTCVaultsManager contract.
   *
   * This method will:
   * 1. Create proof of possession (BTC signature of ETH address)
   * 2. Submit peg-in request to BTCVaultsManager contract
   * 3. Wait for transaction confirmation
   *
   * @param params - Registration parameters
   * @returns Ethereum transaction hash
   * @throws Error - Not yet implemented
   *
   * @remarks
   * This method is a placeholder for future implementation.
   * Currently throws an error indicating it's not implemented.
   */
  async registerPeginOnChain(params: {
    depositorBtcPubkey: string;
    unsignedBtcTx: string;
    vaultProvider: Address;
  }): Promise<Hash> {
    // TODO: Implement in future PR
    // 1. Get depositor ETH address from wallet
    // 2. Create proof of possession (BTC signs ETH address)
    // 3. Call BTCVaultsManager.submitPeginRequest()
    // 4. Wait for transaction confirmation
    // 5. Return transaction hash
    throw new Error(
      `registerPeginOnChain not yet implemented. Params: ${JSON.stringify({
        depositorBtcPubkey: params.depositorBtcPubkey.slice(0, 8) + "...",
        unsignedBtcTxLength: params.unsignedBtcTx.length,
        vaultProvider: params.vaultProvider,
      })}`,
    );
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





