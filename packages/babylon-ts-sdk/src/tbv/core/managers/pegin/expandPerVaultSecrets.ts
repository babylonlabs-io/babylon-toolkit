/**
 * Per-vault HKDF expansion of WOTS keys + HTLC preimages from the
 * wallet root.
 *
 * @module managers/pegin/expandPerVaultSecrets
 */

import type { Hex } from "viem";

import type { WotsBlockPublicKey } from "../../clients/vault-provider/types";
import {
  ensureHexPrefix,
  uint8ArrayToHex,
} from "../../primitives/utils/bitcoin";
import { computeHashlock } from "../../services";
import {
  expandHashlockSecret,
  expandWotsSeed,
} from "../../vault-secrets";
import {
  computeWotsBlockPublicKeysHash,
  deriveWotsBlocksFromSeed,
} from "../../wots";

/**
 * Result of {@link expandPerVaultSecrets}.
 */
export interface PerVaultExpansionResult {
  perVaultWotsKeys: WotsBlockPublicKey[][];
  /** Keccak256 of WOTS keys, ready as `depositorWotsPkHash` (0x-prefixed). */
  wotsPkHashes: Hex[];
  /** HTLC preimage hex per vault (no 0x prefix). */
  htlcSecretHexes: string[];
  /** SHA-256 of each HTLC preimage as 64-char hex (no 0x prefix). */
  hashlocks: string[];
}

/**
 * Derive per-vault WOTS keys + HTLC preimages from the wallet root.
 *
 * Takes ownership of `root`: zeros the buffer (and per-vault secret
 * buffers) before returning, regardless of how the caller exits.
 *
 * @param root        32-byte wallet-derived root from `deriveVaultRoot`.
 * @param vaultCount  Number of vaults (= length of `amounts`).
 */
export async function expandPerVaultSecrets(
  root: Uint8Array,
  vaultCount: number,
): Promise<PerVaultExpansionResult> {
  const perVaultWotsKeys: WotsBlockPublicKey[][] = [];
  const wotsPkHashes: Hex[] = [];
  const htlcSecretHexes: string[] = [];
  const hashlocks: string[] = [];

  try {
    for (let i = 0; i < vaultCount; i++) {
      const wotsSeed = expandWotsSeed(root, i);
      try {
        const wotsPublicKeys = await deriveWotsBlocksFromSeed(wotsSeed);
        perVaultWotsKeys.push(wotsPublicKeys);
        wotsPkHashes.push(computeWotsBlockPublicKeysHash(wotsPublicKeys));
      } finally {
        wotsSeed.fill(0);
      }

      const secretBytes = expandHashlockSecret(root, i);
      try {
        const secretHex = uint8ArrayToHex(secretBytes);
        htlcSecretHexes.push(secretHex);
        hashlocks.push(computeHashlock(ensureHexPrefix(secretHex)).slice(2));
      } finally {
        secretBytes.fill(0);
      }
    }
  } finally {
    root.fill(0);
  }

  return { perVaultWotsKeys, wotsPkHashes, htlcSecretHexes, hashlocks };
}
