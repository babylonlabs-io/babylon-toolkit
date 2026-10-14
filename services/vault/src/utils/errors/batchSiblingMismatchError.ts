import type { Hex } from "viem";

/** The on-chain field a listed sibling disagrees with the target vault on. */
export type BatchSiblingMismatchField =
  | "prePeginTxHash"
  | "depositor"
  | "applicationEntryPoint";

/**
 * Typed refusal when a vault the indexer lists under the resumed Pre-PegIn is
 * registered on chain to a different Pre-PegIn, depositor or application than
 * the vault being broadcast. The listing is the indexer's, so it cannot decide
 * which vaults a broadcast funds or confirms: every listed sibling is checked
 * against the registry first. Thrown before any BTC wallet prompt, so this
 * attempt broadcast nothing. The mapper branches on the class and renders the
 * batch-mismatch callout.
 */
export class BatchSiblingMismatchError extends Error {
  /** The vault being broadcast. */
  readonly vaultId: Hex;
  /** The listed sibling whose on-chain record disagrees. */
  readonly siblingId: Hex;
  /** The field that disagrees. */
  readonly field: BatchSiblingMismatchField;

  constructor(fields: {
    vaultId: Hex;
    siblingId: Hex;
    field: BatchSiblingMismatchField;
  }) {
    super(
      `Vault ${fields.siblingId} is listed in vault ${fields.vaultId}'s ` +
        `batch, but its on-chain ${fields.field} differs from vault ` +
        `${fields.vaultId}'s. Broadcast refused.`,
    );
    this.name = "BatchSiblingMismatchError";
    this.vaultId = fields.vaultId;
    this.siblingId = fields.siblingId;
    this.field = fields.field;
  }
}

/** True when `err` is the typed batch-sibling refusal. */
export function isBatchSiblingMismatchError(
  err: unknown,
): err is BatchSiblingMismatchError {
  return err instanceof BatchSiblingMismatchError;
}
