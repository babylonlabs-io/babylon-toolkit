/**
 * Ethereum address type (checksummed hex string with 0x prefix).
 */
export type Address = `0x${string}`;

/**
 * Ethereum transaction hash type (hex string with 0x prefix).
 */
export type Hash = `0x${string}`;

/**
 * Transaction request for sending ETH or calling contracts.
 */
export interface TransactionRequest {
  /** Recipient address */
  to: Address;
  /** Amount in wei (optional) */
  value?: string;
  /** Encoded contract call data (optional) */
  data?: string;
  /** Max gas to use (optional, estimated if omitted) */
  gasLimit?: bigint;
  /** Max fee per gas - EIP-1559 (optional) */
  maxFeePerGas?: bigint;
  /** Max priority fee per gas - EIP-1559 (optional) */
  maxPriorityFeePerGas?: bigint;
  /** Transaction nonce (optional) */
  nonce?: number;
}

/**
 * EIP-712 typed data for structured signing (permits, approvals, meta-transactions).
 *
 * @see https://eips.ethereum.org/EIPS/eip-712
 */
export interface TypedData {
  /** Domain separator to prevent replay attacks */
  domain: {
    name?: string;
    version?: string;
    chainId?: number;
    verifyingContract?: string;
    salt?: string;
  };
  /** Type definitions for the structured data */
  types: Record<string, Array<{ name: string; type: string }>>;
  /** Primary type name being signed */
  primaryType: string;
  /** Message data conforming to primaryType */
  message: Record<string, any>;
}

/**
 * Framework-agnostic Ethereum wallet interface.
 * Supports MetaMask, WalletConnect, Ledger, and other Ethereum wallets.
 */
export interface EthereumWallet {
  /**
   * Returns the wallet's Ethereum address.
   */
  getAddress(): Promise<Address>;

  /**
   * Returns the chain ID (1: Mainnet, 11155111: Sepolia, 31337: Anvil).
   */
  getChainId(): Promise<number>;

  /**
   * Signs a message using EIP-191 personal_sign.
   *
   * @param message - The message to sign
   */
  signMessage(message: string): Promise<Hash>;

  /**
   * Signs structured data using EIP-712.
   * Used for permits, approvals, and meta-transactions.
   *
   * @param typedData - The EIP-712 structured data to sign
   * @throws {Error} If signing fails or data is invalid
   * @see https://eips.ethereum.org/EIPS/eip-712
   */
  signTypedData(typedData: TypedData): Promise<Hash>;

  /**
   * Signs and broadcasts a transaction to the network.
   *
   * @param tx - The transaction request
   * @throws {Error} If the transaction fails
   */
  sendTransaction(tx: TransactionRequest): Promise<Hash>;
}
