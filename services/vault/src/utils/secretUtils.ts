import { sha256 } from "@noble/hashes/sha2.js";
import type { Hex } from "viem";

import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";

/** Length of the deposit secret in bytes (256-bit). */
const SECRET_LENGTH_BYTES = 32;

/** Application name used for deriveContextHash domain separation. */
const DERIVE_APP_NAME = "babylon-vault";

/**
 * Generate a cryptographically random secret hex string for the new peg-in flow.
 *
 * @returns 64-character lowercase hex string (32 bytes)
 */
export function generateSecretHex(): string {
  const bytes = new Uint8Array(SECRET_LENGTH_BYTES);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Compute the SHA-256 hash of a hex-encoded secret.
 *
 * @param secretHex - 64-character hex string (no 0x prefix)
 * @returns 0x-prefixed SHA-256 hash hex string
 */
export function hashSecret(secretHex: string): Hex {
  const secretBytes = Uint8Array.from(
    secretHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)),
  );
  const hashBytes = sha256(secretBytes);
  return `0x${Array.from(hashBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`;
}

/**
 * Parameters for building an HTLC secret derivation context.
 * All fields must be available at both deposit time and activation time.
 */
export interface HtlcSecretContextParams {
  /** Depositor's Ethereum address (0x-prefixed) */
  depositorEthAddress: string;
  /** Vault provider's Ethereum address (0x-prefixed) */
  vaultProviderAddress: string;
  /** Application entry point address (0x-prefixed) */
  applicationEntryPoint: string;
  /** Vault index (0-based) — differentiates split deposit vaults */
  vaultIndex: number;
}

/**
 * Build a deterministic context hex string for deriveContextHash.
 *
 * The context is: SHA-256(depositorEth || vpAddress || appEntryPoint || vaultIndex)
 * This produces a unique context per (depositor, VP, app, vault) tuple.
 *
 * All parameters are available at both deposit time (from form state) and
 * activation time (from VaultActivity / on-chain data).
 */
export function buildHtlcSecretContext(
  params: HtlcSecretContextParams,
): string {
  const strip0x = (hex: string) => (hex.startsWith("0x") ? hex.slice(2) : hex);

  // Concatenate raw hex: 20B depositor + 20B VP + 20B app + 4B index = 64 bytes
  const indexHex = params.vaultIndex.toString(16).padStart(8, "0");
  const preimage =
    strip0x(params.depositorEthAddress).toLowerCase() +
    strip0x(params.vaultProviderAddress).toLowerCase() +
    strip0x(params.applicationEntryPoint).toLowerCase() +
    indexHex;

  // Hash to get a fixed-size context (32 bytes)
  const preimageBytes = Uint8Array.from(
    preimage.match(/.{2}/g)!.map((b) => parseInt(b, 16)),
  );
  const contextHash = sha256(preimageBytes);
  return Array.from(contextHash)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Check whether a wallet supports deterministic secret derivation
 * via the deriveContextHash API.
 */
export function walletSupportsDeriveContextHash(
  wallet: BitcoinWallet | null,
): boolean {
  return wallet !== null && typeof wallet.deriveContextHash === "function";
}

/**
 * Derive an HTLC secret deterministically from the wallet using
 * the deriveContextHash API. Falls back to random generation if
 * the wallet doesn't support it or the call fails at runtime
 * (e.g., the underlying extension hasn't shipped the method yet).
 *
 * @returns The 64-character hex secret (no 0x prefix)
 */
export async function deriveOrGenerateSecret(
  wallet: BitcoinWallet | null,
  contextParams: HtlcSecretContextParams,
): Promise<string> {
  if (walletSupportsDeriveContextHash(wallet)) {
    try {
      const context = buildHtlcSecretContext(contextParams);
      return await wallet!.deriveContextHash!(DERIVE_APP_NAME, context);
    } catch {
      // The wallet wrapper declares deriveContextHash but the underlying
      // provider may not implement it yet. Fall back to random generation.
      return generateSecretHex();
    }
  }
  return generateSecretHex();
}
