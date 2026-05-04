/**
 * Per-vault wallet derivation of WOTS keys + HTLC preimages.
 *
 * Loops over each BTC vault funded by the Pre-PegIn and calls the
 * per-purpose `deriveWotsSeed` and `deriveHashlockSecret` helpers,
 * which in turn touch the wallet via `deriveContextHash` (one popup
 * for hashlock + two for WOTS per vault, by spec).
 *
 * @module managers/pegin/derivePerVaultSecrets
 */

import type { Hex } from "viem";

import type { WotsBlockPublicKey } from "../../clients/vault-provider/types";
import type { BitcoinWallet } from "../../../../shared";
import {
  ensureHexPrefix,
  uint8ArrayToHex,
} from "../../primitives/utils/bitcoin";
import { computeHashlock } from "../../services";
import {
  deriveHashlockSecret,
  deriveWotsSeed,
  type VaultContextInput,
} from "../../vault-secrets";
import {
  computeWotsBlockPublicKeysHash,
  deriveWotsBlocksFromSeed,
} from "../../wots";

/**
 * Result of {@link derivePerVaultSecrets}.
 */
export interface PerVaultDerivationResult {
  perVaultWotsKeys: WotsBlockPublicKey[][];
  /** Keccak256 of WOTS keys, ready as `depositorWotsPkHash` (0x-prefixed). */
  wotsPkHashes: Hex[];
  /** HTLC preimage hex per vault (no 0x prefix). */
  htlcSecretHexes: string[];
  /** SHA-256 of each HTLC preimage as 64-char hex (no 0x prefix). */
  hashlocks: string[];
}

/**
 * Derive per-vault WOTS keys + HTLC preimages by calling the wallet
 * once per per-purpose label per vault.
 *
 * Buffers returned by the wallet helpers are zeroed before returning.
 *
 * @param wallet      The BTC wallet (must implement `deriveContextHash`).
 * @param input       Per-Pre-PegIn context (depositor pubkey + funding outpoints).
 * @param vaultCount  Number of vaults (= length of `amounts`).
 */
export async function derivePerVaultSecrets(
  wallet: BitcoinWallet,
  input: VaultContextInput,
  vaultCount: number,
): Promise<PerVaultDerivationResult> {
  const perVaultWotsKeys: WotsBlockPublicKey[][] = [];
  const wotsPkHashes: Hex[] = [];
  const htlcSecretHexes: string[] = [];
  const hashlocks: string[] = [];

  for (let i = 0; i < vaultCount; i++) {
    const wotsSeed = await deriveWotsSeed(wallet, input, i);
    try {
      const wotsPublicKeys = await deriveWotsBlocksFromSeed(wotsSeed);
      perVaultWotsKeys.push(wotsPublicKeys);
      wotsPkHashes.push(computeWotsBlockPublicKeysHash(wotsPublicKeys));
    } finally {
      wotsSeed.fill(0);
    }

    const secretBytes = await deriveHashlockSecret(wallet, input, i);
    try {
      const secretHex = uint8ArrayToHex(secretBytes);
      htlcSecretHexes.push(secretHex);
      hashlocks.push(computeHashlock(ensureHexPrefix(secretHex)).slice(2));
    } finally {
      secretBytes.fill(0);
    }
  }

  return { perVaultWotsKeys, wotsPkHashes, htlcSecretHexes, hashlocks };
}
