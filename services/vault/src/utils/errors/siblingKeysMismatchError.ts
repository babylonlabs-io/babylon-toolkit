import type { Hex } from "viem";

/**
 * Typed refusal when a sibling's frozen epochs resolve to different keys than
 * the vault being broadcast. One Pre-PegIn's outputs cannot match both, so a
 * refund would fail for one of them. Thrown before any BTC wallet prompt.
 */
export class SiblingKeysMismatchError extends Error {
  /** The vault being broadcast. */
  readonly vaultId: Hex;
  /** The sibling whose frozen keys differ. */
  readonly siblingId: Hex;

  constructor(fields: { vaultId: Hex; siblingId: Hex }) {
    super(
      `Vault ${fields.siblingId} shares vault ${fields.vaultId}'s Pre-PegIn, ` +
        `but its frozen epochs resolve to different participant keys. ` +
        `Broadcast refused.`,
    );
    this.name = "SiblingKeysMismatchError";
    this.vaultId = fields.vaultId;
    this.siblingId = fields.siblingId;
  }
}
