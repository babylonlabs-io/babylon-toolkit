import { COPY } from "@/copy";
import { isMinedRevertError } from "@/utils/errors";

// Every mined revert of the reveal publishes the HTLC secret in calldata, whatever
// the reason; a simulation refusal (ours or the wallet's) sent nothing, so no notice.
export function appendActivationRevertNotice(
  err: unknown,
  message: string,
): string {
  if (!isMinedRevertError(err)) {
    return message;
  }
  return `${message} ${COPY.deposit.errors.activationRevertedSecretPublic}`;
}
