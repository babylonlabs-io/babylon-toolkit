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
 * Ethereum wallet interface that exactly matches viem's WalletClient.
 * Can be used as a drop-in replacement for viem's WalletClient.
 */
export interface EthereumWallet {
  /**
   * Wallet account information
   */
  account: {
    address: Address;
  };

  /**
   * Chain information
   */
  chain: {
    /** Chain ID (1: Mainnet, 11155111: Sepolia, etc.) */
    id: number;
  };

  /**
   * Signs a message using EIP-191 personal_sign.
   *
   * @param args - Message signing arguments
   * @param args.message - The message to sign
   * @param args.account - Optional account to sign with (defaults to wallet.account)
   * @returns A promise that resolves to the signature
   */
  signMessage(args: { message: string; account?: Address }): Promise<Hash>;

  /**
   * Signs and broadcasts a transaction to the network.
   * Compatible with viem's walletClient.sendTransaction()
   *
   * @param tx - The transaction request
   * @throws {Error} If the transaction fails
   * @returns A promise that resolves to the transaction hash
   */
  sendTransaction(tx: TransactionRequest): Promise<Hash>;

  /**
   * Signs structured data using EIP-712.
   * Required method matching viem's WalletClient interface.
   * Used for permits, approvals, and meta-transactions.
   *
   * @param typedData - The EIP-712 structured data to sign
   * @throws {Error} If signing fails or data is invalid
   * @returns A promise that resolves to the signature
   * @see https://eips.ethereum.org/EIPS/eip-712
   */
  signTypedData(typedData: TypedData): Promise<Hash>;
}
