/**
 * Classifier for the registry reader's empty-vault-record error, and for the
 * sibling read's refusal when the registry's list lacks the target.
 *
 * The SDK reader (`getVaultData` / `getProtocolInfoBatch` /
 * `getVaultKeyEpochs` / `getVaultKeyEpochsBatch`) throws a bare
 * `Error` when `depositorSignedPeginTx` reads back as `"0x"`. That state
 * conflates a genuinely absent vault with an RPC node that has not yet
 * indexed the registration's block — a lagging node answers HTTP 200 with a
 * valid zero struct, so nothing below this layer can tell them apart.
 * `getPrePeginSiblingIdsFromChain` throws the same wording on purpose
 * (`COPY.deposit.errors.vaultMissingFromDepositorList`): a list behind the
 * target's registration has the same usual cause and takes the same copy.
 *
 * Centralized because four call sites need the same judgement (retry, two
 * message mappers, and one normalizer). Matching an English substring in four
 * places is how the phrasing drifts out of sync with the thrower.
 */

/**
 * Substring of those throws. Kept narrow enough to be unambiguous and
 * wide enough to match every reader, whose messages differ in their prefix.
 */
const EMPTY_VAULT_RECORD_MESSAGE = "not found on-chain";

/**
 * True when `err` is the registry reader reporting an empty vault record, or
 * the sibling read reporting a registry list that lacks the target.
 */
export function isVaultRecordEmptyError(err: unknown): boolean {
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return message.includes(EMPTY_VAULT_RECORD_MESSAGE);
}
