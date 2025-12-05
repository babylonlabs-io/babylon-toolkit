/**
 * Bitcoin network types.
 * Using string literal union for maximum compatibility with wallet providers.
 */
export type BitcoinNetwork = "mainnet" | "testnet" | "signet";

/**
 * Bitcoin network constants
 */
export const BitcoinNetworks = {
  MAINNET: "mainnet",
  TESTNET: "testnet",
  SIGNET: "signet",
} as const;

/**
 * SignPsbt options for advanced signing scenarios.
 */
export interface SignPsbtOptions {
  /** Whether to automatically finalize the PSBT after signing */
  autoFinalized?: boolean;
  /** Contract information for the signing operation */
  contracts?: Array<{
    id: string;
    params: Record<string, string | number | string[] | number[]>;
  }>;
  /** Action metadata */
  action?: {
    name: string;
  };
}

/**
 * This interface is designed to be compatible with @babylonlabs-io/wallet-connector's IBTCProvider
 *
 * Supports Unisat, Ledger, OKX, OneKey, Keystone, and other Bitcoin wallets.
 */
export interface BitcoinWallet {
  /**
   * Returns the wallet's public key as a hex string.
   *
   * For Taproot addresses, this should return the x-only public key
   * (32 bytes = 64 hex characters without 0x prefix).
   *
   * For compressed public keys (33 bytes = 66 hex characters),
   * consumers should strip the first byte to get x-only format.
   */
  getPublicKeyHex(): Promise<string>;

  /**
   * Returns the wallet's Bitcoin address.
   */
  getAddress(): Promise<string>;

  /**
   * Signs a PSBT and returns the signed PSBT as hex.
   *
   * @param psbtHex - The PSBT to sign in hex format
   * @param options - Optional signing parameters (e.g., autoFinalized, contracts)
   * @throws {Error} If the PSBT is invalid or signing fails
   */
  signPsbt(psbtHex: string, options?: SignPsbtOptions): Promise<string>;

  /**
   * Signs a message for authentication or proof of ownership.
   *
   * @param message - The message to sign
   * @param type - The signing method: "ecdsa" for standard signatures, "bip322-simple" for BIP-322
   * @returns Base64-encoded signature
   */
  signMessage(
    message: string,
    type: "bip322-simple" | "ecdsa",
  ): Promise<string>;

  /**
   * Returns the Bitcoin network the wallet is connected to.
   *
   * @returns BitcoinNetwork enum value (MAINNET, TESTNET, SIGNET)
   */
  getNetwork(): Promise<BitcoinNetwork>;
}
