/**
 * The recovery kit's `claim.json`: the vault identity, the graph and the
 * per-session hashes, written last in the tar.
 */

export const CLAIM_FILE_NAME = "claim.json";
export const SHA256_HEX_LENGTH = 64;
/** Largest `claim.json` a reader accepts (format spec, Reading step 2). */
export const MAX_CLAIM_FILE_BYTES = 64 * 1024 * 1024;

const RECOVERY_KIT_FORMAT = "babylon-btc-vault-recovery-kit";
const RECOVERY_KIT_FORMAT_VERSION = 1;
const SESSION_ENTRY_PREFIX = "sessions/";
const SESSION_ENTRY_SUFFIX = ".cbor";
/** Hashes, txids, x-only keys and fingerprints: 32 bytes, lowercase, no prefix. */
const HEX_32_BYTES = /^[0-9a-f]{64}$/;
const VAULT_ID_HEX = /^0x[0-9a-f]{64}$/;
const ETH_ADDRESS_HEX = /^0x[0-9a-f]{40}$/;

/** Every field below is written lowercased; any other shape is refused. */
export interface RecoveryKitIdentity {
  /** `0x` + 64 hex; any case. */
  vaultId: string;
  /** 64 hex, no prefix; any case. */
  peginTxid: string;
  /** x-only, 64 hex, no prefix; any case. */
  depositorPk: string;
  depositorEthAddress: string;
  /** `0x` + 40 hex; any case. */
  providerAddress: string;
  /** 64 hex; any case. */
  signedGraphFingerprint: string;
}

export interface ClaimFileSession {
  byteLength: number;
  sha256: string;
}

interface ClaimFileManifest {
  txGraphJson: string;
  verifyingKeyHex: string;
}

const encoder = new TextEncoder();

export function sessionEntryName(pk: string): string {
  return `${SESSION_ENTRY_PREFIX}${pk}${SESSION_ENTRY_SUFFIX}`;
}

/** Session keys in ascending bytewise order; a duplicate is refused. */
export function sortSessionKeys(keys: Iterable<string>): string[] {
  const sorted = [...keys].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1]) {
      throw new RangeError(`Duplicate session key: ${sorted[i]}`);
    }
  }
  return sorted;
}

/** `value` lowercased, refused unless it has the spec's shape for `field`. */
function requireShape(field: string, value: string, shape: RegExp): string {
  const lower = value.toLowerCase();
  if (!shape.test(lower)) {
    throw new RangeError(`claim.json ${field} must match ${shape}: ${value}`);
  }
  return lower;
}

export function buildClaimFile(
  identity: RecoveryKitIdentity,
  manifest: ClaimFileManifest,
  sessions: ReadonlyMap<string, ClaimFileSession>,
): Uint8Array<ArrayBuffer> {
  const sessionEntries: Record<
    string,
    { byte_length: number; sha256: string }
  > = {};
  for (const pk of sortSessionKeys(sessions.keys())) {
    const session = sessions.get(pk)!;
    if (!HEX_32_BYTES.test(session.sha256)) {
      throw new RangeError(
        `Session ${pk} hash must be ${SHA256_HEX_LENGTH} lowercase hex`,
      );
    }
    sessionEntries[pk] = {
      byte_length: session.byteLength,
      sha256: session.sha256,
    };
  }

  const claim = {
    format: RECOVERY_KIT_FORMAT,
    format_version: RECOVERY_KIT_FORMAT_VERSION,
    pegin_txid: requireShape("pegin_txid", identity.peginTxid, HEX_32_BYTES),
    vault_id: requireShape("vault_id", identity.vaultId, VAULT_ID_HEX),
    depositor_pk: requireShape(
      "depositor_pk",
      identity.depositorPk,
      HEX_32_BYTES,
    ),
    vault_provider: requireShape(
      "vault_provider",
      identity.providerAddress,
      ETH_ADDRESS_HEX,
    ),
    signed_graph_fingerprint: requireShape(
      "signed_graph_fingerprint",
      identity.signedGraphFingerprint,
      HEX_32_BYTES,
    ),
    tx_graph_json: manifest.txGraphJson,
    verifying_key_hex: manifest.verifyingKeyHex,
    sessions: sessionEntries,
  };
  return encoder.encode(JSON.stringify(claim));
}

/**
 * The UTF-8 length `buildClaimFile` will produce, known before any session is
 * fetched: every real hash is 64 ASCII characters, like the placeholder.
 */
export function claimFileByteLength(
  identity: RecoveryKitIdentity,
  manifest: ClaimFileManifest,
  byteLengths: ReadonlyMap<string, number>,
): number {
  const placeholders = new Map<string, ClaimFileSession>();
  for (const [pk, byteLength] of byteLengths) {
    placeholders.set(pk, {
      byteLength,
      sha256: "0".repeat(SHA256_HEX_LENGTH),
    });
  }
  return buildClaimFile(identity, manifest, placeholders).byteLength;
}
