import { VAULT_ERROR_ABI } from "@babylonlabs-io/ts-sdk/tbv/core";

import {
  ACTIVATION_DEADLINE_EXPIRED_REASON,
  isActivationDeadlineExpiredError,
  isMinedRevertError,
  isSimulationPhaseError,
} from "./contract";
import {
  ActivationPausedError,
  ActivationWouldRedeemError,
  ErrorCode,
  WithdrawUnconfirmedError,
} from "./types";

/**
 * What kind of failure ended a reveal attempt (Activate or Withdraw).
 * - `mined-revert`: mined and reverted for a reason Withdraw does not share,
 *   or one that could not be decoded; the secret is public.
 * - `mined-deadline-expired`: mined and reverted `ActivationDeadlineExpired`;
 *   the secret is public and no reveal can land any more.
 * - `pre-send-refusal`: nothing was sent; a decoded contract error that
 *   Withdraw does not share, or the would-redeem refusal.
 * - `aave-paused`: nothing was sent; only the Aave scope is paused.
 * - `withdraw-unconfirmed`: a Withdraw confirmed without its redeem log.
 * - `other`: everything else, a mined revert Withdraw would also hit included.
 *
 * Withdraw may be offered after `mined-revert`, `pre-send-refusal` and
 * `aave-paused` only.
 */
export type ActivationFailureKind =
  | "mined-revert"
  | "mined-deadline-expired"
  | "pre-send-refusal"
  | "aave-paused"
  | "withdraw-unconfirmed"
  | "other";

/** Names of the custom errors the vault contracts can raise. */
const VAULT_CONTRACT_ERROR_NAMES: ReadonlySet<string> = new Set(
  VAULT_ERROR_ABI.flatMap((item) => (item.type === "error" ? [item.name] : [])),
);

/**
 * Reverts both reveals share, so Withdraw would hit them too (BTCVaultRegistry
 * `whenNotPaused`, `_activateVaultWithSecret`, `BTCVaultActivationUniquenessLib.reserve`).
 */
const REVERTS_WITHDRAW_SHARES: ReadonlySet<string> = new Set([
  "TBV_Paused",
  "BTCVaultNotFound",
  "Unauthorized",
  "InvalidBTCVaultStatus",
  "InvalidHashlock",
  "InvalidSecret",
  ACTIVATION_DEADLINE_EXPIRED_REASON,
  "PrePeginOutputAlreadyUsed",
  "PeginTransactionAlreadyUsed",
]);

/** The activation floor: Withdraw is exempt, but before a send it is a wait. */
const ACTIVATION_DELAY_NOT_ELAPSED_REASON = "ActivationDelayNotElapsed";

// A deny list: any decoded vault-contract error offers Withdraw unless it is
// one Withdraw shares, or the floor.
function isPreSendRefusalWithdrawEscapes(err: unknown): boolean {
  return (
    isSimulationPhaseError(err) &&
    err.code === ErrorCode.CONTRACT_REVERT &&
    err.reason !== undefined &&
    VAULT_CONTRACT_ERROR_NAMES.has(err.reason) &&
    !REVERTS_WITHDRAW_SHARES.has(err.reason) &&
    err.reason !== ACTIVATION_DELAY_NOT_ELAPSED_REASON
  );
}

/** Classify a reveal failure from its typed error, never from its message. */
export function classifyActivationFailure(err: unknown): ActivationFailureKind {
  if (isMinedRevertError(err)) {
    if (isActivationDeadlineExpiredError(err)) return "mined-deadline-expired";
    // An undecoded reason stays `mined-revert`: Withdraw's own simulation decides.
    return err.reason !== undefined && REVERTS_WITHDRAW_SHARES.has(err.reason)
      ? "other"
      : "mined-revert";
  }
  if (err instanceof WithdrawUnconfirmedError) return "withdraw-unconfirmed";
  if (err instanceof ActivationPausedError) {
    return err.scope === "aave" ? "aave-paused" : "other";
  }
  if (
    err instanceof ActivationWouldRedeemError ||
    isPreSendRefusalWithdrawEscapes(err)
  ) {
    return "pre-send-refusal";
  }
  return "other";
}
