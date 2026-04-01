/**
 * A Lamport keypair consisting of preimages (private) and their hashes
 * (public) for both the `false` and `true` branch of each bit position.
 *
 * - `falsePreimages[i]` / `truePreimages[i]` — 16-byte secret preimages.
 * - `falseHashes[i]`    / `trueHashes[i]`    — 20-byte Hash160 digests.
 *
 * All arrays have length 508 (PI_1_BITS).
 */
export interface LamportKeypair {
  falsePreimages: Uint8Array[];
  truePreimages: Uint8Array[];
  falseHashes: Uint8Array[];
  trueHashes: Uint8Array[];
}

/**
 * Serialized Lamport public key as two lists of hex-encoded Hash160 digests.
 * This is the format submitted on-chain and to the vault provider.
 */
export interface LamportPublicKey {
  false_list: string[];
  true_list: string[];
}

/**
 * Provider interface for Lamport key operations.
 * Frontend implements with mnemonic-based derivation;
 * backend services can implement with HSM/KMS.
 */
export interface LamportKeyProvider {
  deriveLamportKeypair(vaultId: string): Promise<LamportKeypair>;
  getLamportPublicKey(vaultId: string): Promise<LamportPublicKey>;
}
