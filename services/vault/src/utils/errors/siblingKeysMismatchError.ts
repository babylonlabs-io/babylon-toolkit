import type { Hex } from "viem";

/**
 * Typed refusal when a sibling's depositor key or frozen participant keys differ
 * from the vault being broadcast. One Pre-PegIn's outputs cannot match both.
 * Thrown before any BTC wallet prompt.
 */
export class SiblingKeysMismatchError extends Error {
  /** The vault being broadcast. */
  readonly vaultId: Hex;
  /** The sibling whose keys differ. */
  readonly siblingId: Hex;

  constructor(fields: { vaultId: Hex; siblingId: Hex }) {
    super(
      `Vault ${fields.siblingId} shares vault ${fields.vaultId}'s Pre-PegIn, ` +
        `but its registered keys differ. ` +
        `Broadcast refused.`,
    );
    this.name = "SiblingKeysMismatchError";
    this.vaultId = fields.vaultId;
    this.siblingId = fields.siblingId;
  }
}
