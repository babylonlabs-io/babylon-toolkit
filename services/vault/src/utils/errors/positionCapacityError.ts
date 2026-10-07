import type { Hex } from "viem";

/**
 * Typed refusal when the application says the depositor's position cannot take
 * the vaults a resumed Pre-PegIn would add. Thrown before any BTC wallet
 * prompt, so this attempt broadcast nothing. The user can act on it (free room in
 * the position, or wait for limits to change), so the mapper branches on the
 * class and renders the position-capacity callout.
 */
export class PositionCapacityExceededError extends Error {
  readonly vaultId: Hex;
  /** Vaults the check asked the position to accept (the whole batch). */
  readonly vaultCount: number;
  /** Their total amount in satoshis. */
  readonly amount: bigint;

  constructor(fields: { vaultId: Hex; vaultCount: number; amount: bigint }) {
    super(
      `The application refused ${fields.vaultCount} BTCVault(s) totalling ` +
        `${fields.amount} sats into the depositor's position for vault ` +
        `${fields.vaultId}: the position would exceed its BTCVault count or ` +
        `BTC limit. Broadcast refused.`,
    );
    this.name = "PositionCapacityExceededError";
    this.vaultId = fields.vaultId;
    this.vaultCount = fields.vaultCount;
    this.amount = fields.amount;
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
 * chain read failed, or the batch has no single application to ask. The check
 * fails closed rather than defaulting to "allowed", and this attempt broadcast
 * nothing. The underlying failure, when there is one, stays on `cause` for the
 * log.
 */
export class PositionCapacityUnavailableError extends Error {
  readonly vaultId: Hex;

  constructor(message: string, fields: { vaultId: Hex; cause?: unknown }) {
    super(message, { cause: fields.cause });
    this.name = "PositionCapacityUnavailableError";
    this.vaultId = fields.vaultId;
  }
}

/** True when `err` is the typed no-verdict position-capacity refusal. */
export function isPositionCapacityUnavailableError(
  err: unknown,
): err is PositionCapacityUnavailableError {
  return err instanceof PositionCapacityUnavailableError;
}
