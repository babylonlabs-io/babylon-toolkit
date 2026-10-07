import { OnChainBtcVaultStatus } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import type { Hex } from "viem";

/** Why the lifecycle gate refused the batch member. */
export type VaultLifecycleFailureReason =
  | "invalid-status"
  | "ack-window-elapsed";

/** Which resume flow ran the gate — the two flows accept different statuses. */
export type VaultLifecycleStage = "broadcast" | "presign";

/** Whether the refused vault is the resumed vault or a discovered sibling. */
export type VaultLifecycleRole = "target" | "sibling";

/**
 * Typed refusal from a lifecycle gate: the DepositTerms rebuild's status and
 * presign ack-window gates, and the Pre-PegIn broadcast ack-window gate.
 *
 * Thrown instead of a bare `Error` so the UI mappers can branch on the
 * machine-readable fields rather than the message: a presign-stage EXPIRED
 * target needs refund-path copy, while a broadcast-stage refusal maps to the
 * terminal batch callout (`invalid-status`) or the can't-complete callout
 * (`ack-window-elapsed`). `status` always carries the ACTUAL on-chain status — an
 * ack-window refusal reports `reason: "ack-window-elapsed"` with the still-
 * PENDING status, never a fabricated EXPIRED.
 */
export class VaultLifecycleStateError extends Error {
  readonly reason: VaultLifecycleFailureReason;
  readonly stage: VaultLifecycleStage;
  readonly role: VaultLifecycleRole;
  readonly status: OnChainBtcVaultStatus;
  readonly vaultId: Hex;

  constructor(
    message: string,
    fields: {
      reason: VaultLifecycleFailureReason;
      stage: VaultLifecycleStage;
      role: VaultLifecycleRole;
      status: OnChainBtcVaultStatus;
      vaultId: Hex;
    },
  ) {
    super(message);
    this.name = "VaultLifecycleStateError";
    this.reason = fields.reason;
    this.stage = fields.stage;
    this.role = fields.role;
    this.status = fields.status;
    this.vaultId = fields.vaultId;
  }
}

/** True when `err` is a lifecycle gate's typed refusal. */
export function isVaultLifecycleStateError(
  err: unknown,
): err is VaultLifecycleStateError {
  return err instanceof VaultLifecycleStateError;
}
