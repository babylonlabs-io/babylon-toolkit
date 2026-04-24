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
 * Options for signing a specific input in a PSBT.
 */
export interface SignInputOptions {
  /** Input index to sign */
  index: number;
  /** Address for signing (optional) */
  address?: string;
  /** Public key for signing (optional, hex string) */
  publicKey?: string;
  /** Sighash types (optional) */
  sighashTypes?: number[];
  /**
   * Whether the wallet should sign with the tweaked (key-path) signer.
   * Set `false` for Taproot script-path spends, where signing uses the
   * untweaked internal key. If omitted, the wallet's default behavior
   * applies.
   */
  useTweakedSigner?: boolean;
  /**
   * @deprecated Use `useTweakedSigner` instead. `disableTweakSigner: true`
   * is equivalent to `useTweakedSigner: false`; `useTweakedSigner` takes
   * precedence when both are set.
   *
   * `useTweakedSigner` is the canonical field used by UniSat and newer OKX
   * wallet versions. Migrating aligns our interface with the wallet-side
   * convention and avoids the historical divergence in OKX's
   * `disableTweakSigner` implementation.
   */
  disableTweakSigner?: boolean;
}

/**
 * SignPsbt options for advanced signing scenarios.
 */
export interface SignPsbtOptions {
  /** Whether to automatically finalize the PSBT after signing */
  autoFinalized?: boolean;
  /**
   * Specific inputs to sign.
   * If not provided, wallet will attempt to sign all inputs it can.
   * Use this to restrict signing to specific inputs (e.g., only depositor's input).
   */
  signInputs?: SignInputOptions[];
  /** Contract information for the signing operation. */
  contracts?: Array<{
    /** Contract identifier. */
    id: string;
    /** Contract parameters. */
    params: Record<string, string | number | string[] | number[]>;
  }>;
  /** Action metadata. */
  action?: {
    /** Action name for tracking. */
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
   * Signs multiple PSBTs and returns the signed PSBTs as hex.
   * This allows batch signing with a single wallet interaction.
   *
   * @param psbtsHexes - Array of PSBTs to sign in hex format
   * @param options - Optional array of signing parameters for each PSBT
   * @throws {Error} If any PSBT is invalid or signing fails
   */
  signPsbts(
    psbtsHexes: string[],
    options?: SignPsbtOptions[],
  ): Promise<string[]>;

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
