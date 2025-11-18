/**
 * Bitcoin network types supported by the wallet interface.
 */
export type BitcoinNetwork = "mainnet" | "testnet" | "signet" | "regtest";

/**
 * Framework-agnostic Bitcoin wallet interface.
 * Supports Unisat, Ledger, OKX, OneKey, Keystone, and other Bitcoin wallets.
 */
export interface BitcoinWallet {
  /**
   * Returns the wallet's public key as a hex string (x-only for Taproot).
   */
  getPublicKey(): Promise<string>;

  /**
   * Returns the wallet's Bitcoin address.
   */
  getAddress(): Promise<string>;

  /**
   * Signs a PSBT and returns the signed PSBT as hex.
   *
   * @param psbtHex - The PSBT to sign in hex format
   * @throws {Error} If the PSBT is invalid or signing fails
   */
  signPsbt(psbtHex: string): Promise<string>;

  /**
   * Signs a message for authentication or proof of ownership.
   *
   * @param message - The message to sign
   */
  signMessage(message: string): Promise<string>;

  /**
   * Returns the Bitcoin network the wallet is connected to.
   */
  getNetwork(): Promise<BitcoinNetwork>;
}
