import type { Hex } from "viem";

/**
 * Where a position-capacity check ran. Before registration no vault exists
 * yet, so only the broadcast checkpoint names one; the stage also decides
 * what the refusal stopped ("Registration refused." / "Broadcast refused.").
 */
export type PositionCapacityCheckpoint =
  | { stage: "registration" }
  | { stage: "broadcast"; vaultId: Hex };

function refusedSuffix(checkpoint: PositionCapacityCheckpoint): string {
  return checkpoint.stage === "registration"
    ? "Registration refused."
    : "Broadcast refused.";
}

/**
 * Typed refusal when the application says the depositor's position cannot take
 * the vaults a new deposit would register, or a new or resumed Pre-PegIn would
 * fund. Thrown before the Ethereum registration or before the Pre-PegIn is
 * signed for broadcast, so this attempt broadcast nothing. The user can act on
 * it (free room in the position, or wait for limits to change), so the mapper
 * branches on the class and renders the position-capacity callout.
 */
export class PositionCapacityExceededError extends Error {
  readonly checkpoint: PositionCapacityCheckpoint;
  /** Vaults this deposit adds (the whole batch). */
  readonly vaultCount: number;
  /** Their total amount in satoshis. */
  readonly amount: bigint;
  /**
   * The depositor's other registered, not yet activated vaults in the same
   * application, which the check counted on top of this deposit.
   */
  readonly inFlightVaultCount: number;
  /** Their total amount in satoshis. */
  readonly inFlightAmount: bigint;

  constructor(fields: {
    checkpoint: PositionCapacityCheckpoint;
    vaultCount: number;
    amount: bigint;
    inFlightVaultCount: number;
    inFlightAmount: bigint;
  }) {
    const subject =
      fields.checkpoint.stage === "broadcast"
        ? ` for vault ${fields.checkpoint.vaultId}`
        : "";
    const inFlight =
      fields.inFlightVaultCount > 0
        ? ` on top of ${fields.inFlightVaultCount} registered, unactivated ` +
          `BTCVault(s) totalling ${fields.inFlightAmount} sats`
        : "";
    super(
      `The application refused ${fields.vaultCount} BTCVault(s) totalling ` +
        `${fields.amount} sats${inFlight} into the depositor's position` +
        `${subject}: the position would exceed its BTCVault count or BTC ` +
        `limit. ${refusedSuffix(fields.checkpoint)}`,
    );
    this.name = "PositionCapacityExceededError";
    this.checkpoint = fields.checkpoint;
    this.vaultCount = fields.vaultCount;
    this.amount = fields.amount;
    this.inFlightVaultCount = fields.inFlightVaultCount;
    this.inFlightAmount = fields.inFlightAmount;
  }
}

/** True when `err` is the typed position-capacity refusal. */
export function isPositionCapacityExceededError(
  err: unknown,
): err is PositionCapacityExceededError {
  return err instanceof PositionCapacityExceededError;
}

/**
 * Typed refusal when the position-capacity check could not reach a verdict: a
 * chain read failed, a registered vault is in a state the check does not
 * model, the transaction could not be sized, or the vaults found do not hold
 * every HTLC output exactly once. The check fails closed rather than
 * defaulting to "allowed", and this attempt broadcast nothing. The underlying
 * failure, when there is one, stays on `cause` for the log.
 */
export class PositionCapacityUnavailableError extends Error {
  readonly checkpoint: PositionCapacityCheckpoint;

  constructor(
    reason: string,
    fields: { checkpoint: PositionCapacityCheckpoint; cause?: unknown },
  ) {
    super(`${reason} ${refusedSuffix(fields.checkpoint)}`, {
      cause: fields.cause,
    });
    this.name = "PositionCapacityUnavailableError";
    this.checkpoint = fields.checkpoint;
  }
}

/** True when `err` is the typed no-verdict position-capacity refusal. */
export function isPositionCapacityUnavailableError(
  err: unknown,
): err is PositionCapacityUnavailableError {
  return err instanceof PositionCapacityUnavailableError;
}
