import { ChainInfo, OfflineAminoSigner, OfflineDirectSigner } from "@keplr-wallet/types";
import { ComponentType } from "react";

export type Fees = {
  // fee for inclusion in the next block
  fastestFee: number;
  // fee for inclusion in a block in 30 mins
  halfHourFee: number;
  // fee for inclusion in a block in 1 hour
  hourFee: number;
  // economy fee: inclusion not guaranteed
  economyFee: number;
  // minimum fee: the minimum fee of the network
  minimumFee: number;
};

// UTXO is a structure defining attributes for a UTXO
export interface UTXO {
  // hash of transaction that holds the UTXO
  txid: string;
  // index of the output in the transaction
  vout: number;
  // amount of satoshis the UTXO holds
  value: number;
  // the script that the UTXO contains
  scriptPubKey: string;
}

export interface InscriptionIdentifier {
  // hash of transaction that holds the ordinals/brc-2-/runes etc in the UTXO
  txid: string;
  // index of the output in the transaction
  vout: number;
}
// supported networks
export enum Network {
  MAINNET = "mainnet",
  TESTNET = "testnet",
  SIGNET = "signet",
}

// WalletInfo is a structure defining attributes for a wallet
export type WalletInfo = {
  publicKeyHex: string;
  address: string;
};

export interface BTCConfig {
  coinName: string;
  coinSymbol: string;
  networkName: string;
  mempoolApiUrl: string;
  network: Network;
}

export type BBNConfig = {
  chainId: string;
  rpc: string;
  chainData: ChainInfo;
  networkName: string;
  networkFullName: string;
  coinSymbol: string;
};

export interface ETHConfig {
  chainId: number;
  chainName: string;
  rpcUrl: string;
  explorerUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

// Ethereum specific types
export interface ETHTransactionRequest {
  to: string;
  value?: string;
  data?: string;
  gasLimit?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  nonce?: number;
}

export interface ETHTypedData {
  domain: {
    name?: string;
    version?: string;
    chainId?: number;
    verifyingContract?: string;
    salt?: string;
  };
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  message: Record<string, any>;
}

export interface NetworkInfo {
  name: string;
  chainId: string;
}

export interface IETHProvider extends IProvider {
  /**
   * Signs a human-readable message using personal_sign
   * @param message - The message to sign
   * @returns A promise that resolves to the signature
   */
  signMessage(message: string): Promise<string>;

  /**
   * Signs structured data using eth_signTypedData_v4 (EIP-712)
   * @param typedData - The structured data to sign
   * @returns A promise that resolves to the signature
   */
  signTypedData(typedData: ETHTypedData): Promise<string>;

  /**
   * Sends a transaction to the blockchain
   * @param tx - The transaction request
   * @returns A promise that resolves to the transaction hash
   */
  sendTransaction(tx: ETHTransactionRequest): Promise<string>;

  /**
   * Estimates gas for a transaction
   * @param tx - The transaction request
   * @returns A promise that resolves to the estimated gas
   */
  estimateGas(tx: ETHTransactionRequest): Promise<bigint>;

  /**
   * Gets the current chain ID
   * @returns A promise that resolves to the chain ID
   */
  getChainId(): Promise<number>;

  /**
   * Switches to a different chain
   * @param chainId - The chain ID to switch to
   * @returns A promise that resolves when the switch is complete
   */
  switchChain(chainId: number): Promise<void>;

  /**
   * Gets the account balance
   * @returns A promise that resolves to the balance in wei
   */
  getBalance(): Promise<bigint>;

  /**
   * Gets the account nonce
   * @returns A promise that resolves to the nonce
   */
  getNonce(): Promise<number>;

  /**
   * Gets network information
   * @returns A promise that resolves to network info
   */
  getNetworkInfo(): Promise<NetworkInfo>;

  /**
   * Gets the wallet provider name
   * @returns The name of the wallet provider
   */
  getWalletProviderName(): string;

  /**
   * Gets the wallet provider icon
   * @returns The icon of the wallet provider
   */
  getWalletProviderIcon(): string;

  /**
   * Registers an event listener for the specified event
   * @param eventName - The name of the event to listen for
   * @param handler - The callback function to be executed when the event occurs
   */
  on(eventName: string, handler: Function): void;

  /**
   * Unregisters an event listener for the specified event
   * @param eventName - The name of the event to listen for
   * @param handler - The callback function to be executed when the event occurs
   */
  off(eventName: string, handler: Function): void;
}

export interface IProvider {
  connectWallet: () => Promise<void>;
  getAddress: () => Promise<string>;
  getPublicKeyHex: () => Promise<string>;
}

export interface IWallet<P extends IProvider = IProvider> {
  id: string;
  name: string;
  icon: string;
  docs: string;
  installed: boolean;
  provider: P | null;
  account: Account | null;
  label: string;
}

export interface IChain<K extends string = string, P extends IProvider = IProvider, C = any> {
  id: K;
  name: string;
  icon: string;
  wallets: IWallet<P>[];
  config: C;
}

export interface IConnector<K extends string = string, P extends IProvider = IProvider, C = any>
  extends IChain<K, P, C> {
  connect(wallet: string | IWallet<P>): Promise<IWallet<P> | null>;
  disconnect(): Promise<void>;
  on(event: string, cb: (wallet: IWallet<P>) => void): () => void;
}

export interface Account {
  address: string;
  publicKeyHex: string;
}

export interface WalletMetadata<P extends IProvider, C> {
  id: string;
  wallet?: string | ((context: any, config: C) => any);
  label?: string;
  name: string | ((wallet: any, config: C) => Promise<string>);
  icon: string | ((wallet: any, config: C) => Promise<string>);
  docs: string;
  networks: Network[];
  createProvider: (wallet: any, config: C) => P;
}

export interface ChainMetadata<N extends string, P extends IProvider, C> {
  chain: N;
  name: string;
  icon: string;
  wallets: WalletMetadata<P, C>[];
}

export interface ExternalWalletProps<P extends IProvider> {
  id: string;
  name: string;
  icon: string;
  provider: P;
}
export interface WalletConnectorProps<N extends string, P extends IProvider, C> {
  persistent: boolean;
  metadata: ChainMetadata<N, P, C>;
  context: any;
  config: C;
  accountStorage: HashMap;
  disabledWallets?: string[];
}

export interface WalletProps<P extends IProvider, C> {
  metadata: WalletMetadata<P, C>;
  context: any;
  config: C;
}

export interface WidgetProps<P extends IProvider = IProvider> {
  id: string;
  connector: IConnector;
  createWallet: (props: ExternalWalletProps<P>) => IWallet<P>;
  onError?: (e: Error) => void;
}

export type WidgetComponent<P extends IProvider = IProvider> = ComponentType<WidgetProps<P>>;

export interface ExternalConnector<P extends IProvider = IProvider> {
  id: string;
  widget: WidgetComponent<P>;
}

export interface Contract {
  id: string;
  params: Record<string, string | number | string[] | number[]>;
}

export interface Action {
  name: string;
}

export interface SignPsbtOptions {
  autoFinalized?: boolean;
  contracts?: Contract[];
  action?: Action;
}

export interface IBTCProvider extends IProvider {
  /**
   * Signs the given PSBT in hex format.
   * @param psbtHex - The hex string of the unsigned PSBT to sign.
   * @param options - Optional parameters for signing the PSBT.
   * @returns A promise that resolves to the hex string of the signed PSBT.
   */
  signPsbt(psbtHex: string, options?: SignPsbtOptions): Promise<string>;

  /**
   * Signs multiple PSBTs in hex format.
   * @param psbtsHexes - The hex strings of the unsigned PSBTs to sign.
   * @param options - Optional parameters for signing the PSBTs.
   * @returns A promise that resolves to an array of hex strings, each representing a signed PSBT.
   */
  signPsbts(psbtsHexes: string[], options?: SignPsbtOptions[]): Promise<string[]>;

  /**
   * Gets the network of the current account.
   * @returns A promise that resolves to the network of the current account.
   */
  getNetwork(): Promise<Network>;

  /**
   * Signs a message using either BIP322-Simple or ECDSA signing method.
   * @param message - The message to sign.
   * @param type - The signing method to use.
   * @returns A promise that resolves to the signed message.
   */
  signMessage(message: string, type: "bip322-simple" | "ecdsa"): Promise<string>;

  /**
   * Retrieves the inscriptions for the connected wallet.
   * @returns A promise that resolves to an array of inscriptions.
   */
  getInscriptions(): Promise<InscriptionIdentifier[]>;

  /**
   * Registers an event listener for the specified event.
   * At the moment, only the "accountChanged" event is supported.
   * @param eventName - The name of the event to listen for.
   * @param callBack - The callback function to be executed when the event occurs.
   */
  on(eventName: string, callBack: () => void): void;

  /**
   * Unregisters an event listener for the specified event.
   * @param eventName - The name of the event to listen for.
   * @param callBack - The callback function to be executed when the event occurs.
   */
  off(eventName: string, callBack: () => void): void;

  /**
   * Gets the name of the wallet provider.
   * @returns A promise that resolves to the name of the wallet provider.
   */
  getWalletProviderName(): Promise<string>;

  /**
   * Gets the icon of the wallet provider.
   * @returns A promise that resolves to the icon of the wallet provider.
   */
  getWalletProviderIcon(): Promise<string>;

  /**
   * Gets the version of the wallet provider.
   * @returns A promise that resolves to the version of the wallet provider.
   */
  getVersion?(): Promise<string>;
}

export interface IBBNProvider extends IProvider {
  /**
   * Gets the name of the wallet provider.
   * @returns A promise that resolves to the name of the wallet provider.
   */
  getWalletProviderName(): Promise<string>;

  /**
   * Gets the icon of the wallet provider.
   * @returns A promise that resolves to the icon of the wallet provider.
   */
  getWalletProviderIcon(): Promise<string>;

  /**
   * Retrieves an offline signer that supports both Amino and Direct signing methods.
   * This signer is used for signing transactions offline before broadcasting them to the network.
   *
   * @returns {Promise<OfflineAminoSigner & OfflineDirectSigner>} A promise that resolves to a signer supporting both Amino and Direct signing
   * @throws {Error} If wallet connection is not established or signer cannot be retrieved
   */
  getOfflineSigner(): Promise<OfflineAminoSigner & OfflineDirectSigner>;

  /**
   * Retrieves an offline signer that supports either Amino or Direct signing methods.
   * This is required for compatibility with older wallets and hardware wallets (like Ledger) that do not support both signing methods.
   * This signer is used for signing transactions offline before broadcasting them to the network.
   *
   * @returns {Promise<OfflineAminoSigner & OfflineDirectSigner>} A promise that resolves to a signer supporting either Amino or Direct signing
   * @throws {Error} If wallet connection is not established or signer cannot be retrieved
   */
  getOfflineSignerAuto?(): Promise<OfflineAminoSigner | OfflineDirectSigner>;

  /**
   * Registers an event listener for the specified event.
   * At the moment, only the "accountChanged" event is supported.
   * @param eventName - The name of the event to listen for.
   * @param callBack - The callback function to be executed when the event occurs.
   */
  on(eventName: string, callBack: () => void): void;

  /**
   * Unregisters an event listener for the specified event.
   * @param eventName - The name of the event to listen for.
   * @param callBack - The callback function to be executed when the event occurs.
   */
  off(eventName: string, callBack: () => void): void;

  /**
   * Gets the version of the wallet provider.
   * @returns A promise that resolves to the version of the wallet provider.
   */
  getVersion?(): Promise<string>;
}

export interface HashMap {
  get: (key: string) => string | undefined;
  set: (key: string, value: any) => void;
  has: (key: string) => boolean;
  delete: (key: string) => boolean;
}
