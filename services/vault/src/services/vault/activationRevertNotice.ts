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
  if (mode === "withdraw") {
    return `${message} ${COPY.deposit.errors.withdrawRevertedSecretPublic}`;
  }
  // Names Withdraw only where the failure screen offers it for this revert.
  const notice =
    classifyActivationFailure(err) === "mined-revert"
      ? COPY.deposit.errors.activationRevertedSecretPublic
      : COPY.deposit.errors.activationRevertedSecretPublicRetryOnly;
  return `${message} ${notice}`;
}
