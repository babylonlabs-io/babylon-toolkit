import { Text } from "@babylonlabs-io/core-ui";
import { IoWarningOutline } from "react-icons/io5";

import { COPY } from "@/copy";

/**
 * Inline caution shown while the depositor signs the peg-in BTC transaction.
 * The security design requires a comparatively high fee, so we surface it in
 * the step itself rather than letting the wallet's number come as a surprise.
 */
export function PeginFeeWarning() {
  return (
    <div className="mt-3 flex items-center gap-2 rounded-lg bg-warning-main/10 p-3">
      <IoWarningOutline
        size={16}
        className="shrink-0 text-warning-main"
        aria-hidden
      />
      <Text as="span" variant="body2" className="text-warning-main">
        {COPY.deposit.steps.peginFeeWarning}
      </Text>
    </div>
  );
}
