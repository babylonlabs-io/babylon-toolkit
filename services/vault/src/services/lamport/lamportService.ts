/**
 * @module lamportService
 *
 * Deterministic Lamport one-time-signature key derivation for Babylon vault
 * deposits. Each depositor generates a BIP-39 mnemonic that seeds a
 * hierarchical derivation tree, producing one unique Lamport keypair per
 * vault.
 *
 * ## High-level flow
 *
 * 1. **Mnemonic generation** — A standard 12-word BIP-39 mnemonic (128 bits
 *    of entropy) is generated using the English wordlist from `@scure/bip39`.
 *
 * 2. **Seed derivation** — The mnemonic is converted to a 64-byte BIP-39
 *    seed via PBKDF2 (2048 rounds of HMAC-SHA-512, per the BIP-39 spec).
 *    The first 32 bytes become the *parent key* and the last 32 bytes become
 *    the *chain code*, following a structure inspired by BIP-32.
 *
 * 3. **Per-vault child derivation** — A vault-specific child key is derived
 *    by computing `HMAC-SHA-512(chainCode, parentKey || vaultData)` where
 *    `vaultData` is the length-prefixed concatenation of the vault ID,
 *    depositor public key, and application contract address. The first 32
 *    bytes of the result become the *derived key* and the last 32 bytes
 *    become the *derived chain code*. This ensures that the same mnemonic
 *    yields a unique keypair for every (vault, depositor, contract) tuple.
 *
 * 4. **Lamport keypair expansion** — For each of the {@link PI_1_BITS} bits
 *    (508, matching the garbled circuit label count in the protocol):
 *    - Two HMAC-SHA-512 values are computed using the derived chain code as
 *      key and `derivedKey || <bitFlag><bitIndex>` as data, where bitFlag
 *      is `0x00` (false) or `0x01` (true).
 *    - The first {@link GC_LABEL_SIZE} bytes (16) of each HMAC output
 *      become the *preimage* (private key component) for that bit.
 *    - Each preimage is hashed with Hash160 (SHA-256 then RIPEMD-160) to
 *      produce the corresponding *hash* (public key component).
 *
 *    The result is four arrays of length 508:
 *    - `falsePreimages` / `truePreimages` — secret preimages (16 bytes each)
 *    - `falseHashes`    / `trueHashes`    — public hashes   (20 bytes each)
 *
 * 5. **Public key serialization** — The public key is the pair of hex-encoded
 *    hash lists (`false_list`, `true_list`), submitted on-chain so the vault
 *    provider can later verify a one-time Lamport signature.
 *
 * ## Security considerations
 *
 * - All intermediate key material (parent key, chain code, HMAC outputs) is
 *   zeroed after use to limit exposure in memory.
 * - Preimages are secret and must never leave the client; only the hashes
 *   (public key) are shared.
 * - Each Lamport keypair is single-use: revealing a preimage to sign a
 *   message consumes that bit position.
 *
 * ## Dependencies
 *
 * | Library                      | Purpose                                |
 * |------------------------------|----------------------------------------|
 * | `@scure/bip39`               | BIP-39 mnemonic generation & seed      |
 * | `@noble/hashes` (ripemd160)  | RIPEMD-160 for Hash160                 |
 * | Web Crypto API               | HMAC-SHA-512, SHA-256                  |
 */
import { ripemd160 } from "@noble/hashes/legacy.js";
import {
  generateMnemonic,
  mnemonicToSeedSync,
  validateMnemonic,
} from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

/**
 * Number of bit positions in the Lamport keypair. Corresponds to the number
 * of garbled-circuit labels used in the BitVM-style protocol (PI_1 circuit).
 */
const PI_1_BITS = 508;

/**
 * Size in bytes of each Lamport preimage (garbled-circuit label size).
 * Preimages are truncated from HMAC-SHA-512 output to this length.
 */
const GC_LABEL_SIZE = 16;

/**
 * A Lamport keypair consisting of preimages (private) and their hashes
 * (public) for both the `false` and `true` branch of each bit position.
 *
 * - `falsePreimages[i]` / `truePreimages[i]` — 16-byte secret preimages.
 * - `falseHashes[i]`    / `trueHashes[i]`    — 20-byte Hash160 digests.
 *
 * All arrays have length {@link PI_1_BITS} (508).
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
 * A challenge used during the mnemonic backup verification flow. The user
 * is asked to enter the words at the given indices to prove they wrote
 * down the mnemonic.
 */
export interface VerificationChallenge {
  indices: number[];
  expectedWords: string[];
}

/**
 * Generate a new 12-word BIP-39 mnemonic with 128 bits of entropy.
 *
 * Uses the standard English wordlist (2048 words). The resulting mnemonic
 * includes a checksum per the BIP-39 specification.
 *
 * @returns A space-separated 12-word mnemonic string.
 */
export function generateLamportMnemonic(): string {
  return generateMnemonic(wordlist, 128);
}

/**
 * Validate whether a string is a well-formed BIP-39 mnemonic.
 *
 * Checks word count, wordlist membership, and checksum validity.
 *
 * @param mnemonic - The mnemonic string to validate.
 * @returns `true` if the mnemonic is valid BIP-39 with correct checksum.
 */
export function isValidMnemonic(mnemonic: string): boolean {
  return validateMnemonic(mnemonic, wordlist);
}

/**
 * Split a mnemonic string into its individual words.
 *
 * @param mnemonic - A space-separated mnemonic string.
 * @returns Array of individual words.
 */
export function getMnemonicWords(mnemonic: string): string[] {
  return mnemonic.split(" ");
}

/**
 * Create a verification challenge by randomly selecting word positions from
 * the mnemonic. Used during the backup flow to confirm the user has written
 * down their recovery phrase.
 *
 * @param mnemonic - The mnemonic to create a challenge for.
 * @param count    - Number of words to challenge (default 3).
 * @returns An object with the selected `indices` (sorted ascending) and
 *          the `expectedWords` at those positions.
 * @throws If `count` is out of the valid range `[1, wordCount]`.
 */
export function createVerificationChallenge(
  mnemonic: string,
  count: number = 3,
): VerificationChallenge {
  const words = getMnemonicWords(mnemonic);
  if (count <= 0 || count > words.length) {
    throw new Error(`Invalid count: must be between 1 and ${words.length}`);
  }
  const indices: number[] = [];

  while (indices.length < count) {
    const index = Math.floor(Math.random() * words.length);
    if (!indices.includes(index)) {
      indices.push(index);
    }
  }

  indices.sort((a, b) => a - b);

  return {
    indices,
    expectedWords: indices.map((i) => words[i]),
  };
}

/**
 * Verify user-provided answers against a verification challenge.
 *
 * Comparison is case-insensitive and trims whitespace from answers.
 *
 * @param challenge - The challenge created by {@link createVerificationChallenge}.
 * @param answers   - User-provided words in the same order as `challenge.indices`.
 * @returns `true` if all answers match the expected words.
 */
export function verifyMnemonicWords(
  challenge: VerificationChallenge,
  answers: string[],
): boolean {
  if (answers.length !== challenge.expectedWords.length) return false;
  return challenge.expectedWords.every(
    (word, i) => word.toLowerCase() === answers[i].toLowerCase().trim(),
  );
}

// ---------------------------------------------------------------------------
// Internal byte-manipulation utilities
// ---------------------------------------------------------------------------

/** Concatenate multiple `Uint8Array` buffers into a single array. */
function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/** Encode a UTF-8 string as bytes. */
function stringToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/**
 * Prepend a 4-byte big-endian length prefix to `data`.
 * Used to unambiguously concatenate variable-length fields in the vault
 * derivation path.
 */
function lengthPrefixed(data: Uint8Array): Uint8Array {
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, data.length, false);
  return concatBytes(len, data);
}

// ---------------------------------------------------------------------------
// Internal cryptographic primitives (Web Crypto API wrappers)
// ---------------------------------------------------------------------------

/**
 * Compute HMAC-SHA-512.
 *
 * @param key  - HMAC key bytes.
 * @param data - Message bytes.
 * @returns 64-byte HMAC digest.
 */
async function hmacSha512(
  key: Uint8Array,
  data: Uint8Array,
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key.buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    data.buffer as ArrayBuffer,
  );
  return new Uint8Array(signature);
}

/**
 * Compute SHA-256 digest.
 *
 * @param data - Input bytes.
 * @returns 32-byte hash.
 */
async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    data.buffer as ArrayBuffer,
  );
  return new Uint8Array(hash);
}

/**
 * Compute Hash160: `RIPEMD-160(SHA-256(data))`.
 *
 * This is the same hash function used in Bitcoin for address derivation.
 *
 * @param data - Input bytes.
 * @returns 20-byte hash.
 */
async function hash160(data: Uint8Array): Promise<Uint8Array> {
  const sha = await sha256(data);
  return ripemd160(sha);
}

// ---------------------------------------------------------------------------
// Seed and keypair derivation
// ---------------------------------------------------------------------------

/**
 * Convert a BIP-39 mnemonic into a 64-byte seed.
 *
 * Internally uses PBKDF2 with 2048 rounds of HMAC-SHA-512 and the passphrase
 * `"mnemonic"` (no user password), per the BIP-39 specification.
 *
 * @param mnemonic - A valid 12-word BIP-39 mnemonic.
 * @returns 64-byte seed suitable for {@link deriveLamportKeypair}.
 */
export function mnemonicToLamportSeed(mnemonic: string): Uint8Array {
  const seed = mnemonicToSeedSync(mnemonic);
  return new Uint8Array(seed);
}

/**
 * Derive a deterministic Lamport keypair for a specific vault.
 *
 * ### Derivation steps
 *
 * 1. **Split the seed** — bytes `[0..32)` = parent key, `[32..64)` = chain code.
 *
 * 2. **Child key derivation** —
 *    ```
 *    vaultData = lenPrefix(vaultId) || lenPrefix(depositorPk) || lenPrefix(appContractAddress)
 *    hmac      = HMAC-SHA-512(chainCode, parentKey || vaultData)
 *    derivedKey       = hmac[0..32)
 *    derivedChainCode = hmac[32..64)
 *    ```
 *
 * 3. **Bit-level key expansion** — For each bit index `i` in `[0, 508)`:
 *    ```
 *    falseHmac = HMAC-SHA-512(derivedChainCode, derivedKey || 0x00 || bigEndian32(i))
 *    trueHmac  = HMAC-SHA-512(derivedChainCode, derivedKey || 0x01 || bigEndian32(i))
 *
 *    falsePreimage = falseHmac[0..16)     // 16 bytes = GC_LABEL_SIZE
 *    truePreimage  = trueHmac[0..16)
 *
 *    falseHash = Hash160(falsePreimage)    // 20 bytes
 *    trueHash  = Hash160(truePreimage)
 *    ```
 *
 * 4. **Cleanup** — All intermediate key material is zeroed.
 *
 * The same (mnemonic, vaultId, depositorPk, appContractAddress) tuple always
 * produces the same keypair, enabling recovery from the mnemonic alone.
 *
 * @param seed               - 64-byte seed from {@link mnemonicToLamportSeed}.
 * @param vaultId            - Unique identifier of the vault (e.g. pegin tx hash).
 * @param depositorPk        - Depositor's public key (hex string).
 * @param appContractAddress - Ethereum address of the application contract.
 * @returns A {@link LamportKeypair} with 508 preimage/hash pairs per branch.
 */
export async function deriveLamportKeypair(
  seed: Uint8Array,
  vaultId: string,
  depositorPk: string,
  appContractAddress: string,
): Promise<LamportKeypair> {
  const chainCode = seed.slice(32, 64);
  const parentKey = seed.slice(0, 32);

  const vaultData = concatBytes(
    lengthPrefixed(stringToBytes(vaultId)),
    lengthPrefixed(stringToBytes(depositorPk)),
    lengthPrefixed(stringToBytes(appContractAddress)),
  );

  const hmac = await hmacSha512(chainCode, concatBytes(parentKey, vaultData));
  const derivedKey = hmac.slice(0, 32);
  const derivedChainCode = hmac.slice(32, 64);

  const falsePreimages: Uint8Array[] = [];
  const truePreimages: Uint8Array[] = [];
  const falseHashes: Uint8Array[] = [];
  const trueHashes: Uint8Array[] = [];

  for (let bit = 0; bit < PI_1_BITS; bit++) {
    const falseIndex = new Uint8Array(5);
    falseIndex[0] = 0;
    new DataView(falseIndex.buffer).setUint32(1, bit, false);

    const trueIndex = new Uint8Array(5);
    trueIndex[0] = 1;
    new DataView(trueIndex.buffer).setUint32(1, bit, false);

    const falseHmac = await hmacSha512(
      derivedChainCode,
      concatBytes(derivedKey, falseIndex),
    );
    const trueHmac = await hmacSha512(
      derivedChainCode,
      concatBytes(derivedKey, trueIndex),
    );

    const falsePreimage = falseHmac.slice(0, GC_LABEL_SIZE);
    const truePreimage = trueHmac.slice(0, GC_LABEL_SIZE);

    falsePreimages.push(falsePreimage);
    truePreimages.push(truePreimage);
    falseHashes.push(await hash160(falsePreimage));
    trueHashes.push(await hash160(truePreimage));

    falseHmac.fill(0);
    trueHmac.fill(0);
  }

  chainCode.fill(0);
  parentKey.fill(0);
  hmac.fill(0);
  derivedKey.fill(0);
  derivedChainCode.fill(0);

  return { falsePreimages, truePreimages, falseHashes, trueHashes };
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

/** Convert a byte array to a lowercase hex string. */
const toHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

/**
 * Extract the public key from a Lamport keypair.
 *
 * The public key consists of the Hash160 digests (hex-encoded) for both
 * the `false` and `true` branch of each bit position. This is the value
 * submitted on-chain and to the vault provider for later signature
 * verification.
 *
 * @param keypair - A derived {@link LamportKeypair}.
 * @returns The {@link LamportPublicKey} with `false_list` and `true_list`,
 *          each containing 508 hex strings of 40 characters (20 bytes).
 */
export function keypairToPublicKey(keypair: LamportKeypair): LamportPublicKey {
  return {
    false_list: keypair.falseHashes.map(toHex),
    true_list: keypair.trueHashes.map(toHex),
  };
}
