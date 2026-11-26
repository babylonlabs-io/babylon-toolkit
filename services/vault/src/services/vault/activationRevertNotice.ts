import { COPY } from "@/copy";
import {
  classifyActivationFailure,
  isActivationDeadlineExpiredError,
  isMinedRevertError,
} from "@/utils/errors";

/** Which reveal was mined and reverted: the normal activation or Withdraw. */
export type RevealMode = "activate" | "withdraw";

// Every mined revert of the reveal publishes the HTLC secret in calldata, whatever
// the reason; a simulation refusal (ours or the wallet's) sent nothing, so no notice.
export function appendActivationRevertNotice(
  err: unknown,
  message: string,
  mode: RevealMode,
): string {
  if (!isMinedRevertError(err)) {
    return message;
  }
  // Past the deadline neither reveal can be retried, so the notice names no retry.
  if (isActivationDeadlineExpiredError(err)) {
    return `${message} ${COPY.deposit.errors.deadlineRevertedSecretPublic}`;
  }
  // A revert both reveals share: retrying either one now may not land.
  if (classifyActivationFailure(err) !== "mined-revert") {
    return `${message} ${COPY.deposit.errors.revertedSecretPublicCheckStatus}`;
  }
  // The failure screen offers Withdraw for this revert, so the activation notice names it.
  const notice =
    mode === "withdraw"
      ? COPY.deposit.errors.withdrawRevertedSecretPublic
      : COPY.deposit.errors.activationRevertedSecretPublic;
  return `${message} ${notice}`;
}
