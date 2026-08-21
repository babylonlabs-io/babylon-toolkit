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
 * Typed refusal from the DepositTerms rebuild's lifecycle gate.
 *
 * Thrown instead of a bare `Error` so the UI mappers can branch on the
 * machine-readable fields rather than the message: a presign-stage EXPIRED
 * target needs refund-path copy, while the broadcast-stage refusal keeps its
 * existing mapping. `status` always carries the ACTUAL on-chain status — an
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

/** True when `err` is the rebuild's typed lifecycle refusal. */
export function isVaultLifecycleStateError(
  err: unknown,
): err is VaultLifecycleStateError {
  return err instanceof VaultLifecycleStateError;
}
