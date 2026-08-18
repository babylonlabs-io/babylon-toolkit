/**
 * Classifier for the registry reader's empty-vault-record error.
 *
 * The SDK reader (`getVaultData` / `getProtocolInfoBatch`) throws a bare
 * `Error` when `depositorSignedPeginTx` reads back as `"0x"`. That state
 * conflates a genuinely absent vault with an RPC node that has not yet
 * indexed the registration's block — a lagging node answers HTTP 200 with a
 * valid zero struct, so nothing below this layer can tell them apart.
 *
 * Centralized because four call sites need the same judgement (retry, two
 * message mappers, and one normalizer). Matching an English substring in four
 * places is how the phrasing drifts out of sync with the thrower.
 */

/**
 * Substring of the reader's throw. Kept narrow enough to be unambiguous and
 * wide enough to match both readers, whose messages differ in their prefix.
 */
const EMPTY_VAULT_RECORD_MESSAGE = "not found on-chain";

/** True when `err` is the registry reader reporting an empty vault record. */
export function isVaultRecordEmptyError(err: unknown): boolean {
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return message.includes(EMPTY_VAULT_RECORD_MESSAGE);
}
