import { IoInformationCircle } from "react-icons/io5";

import { COPY } from "@/copy";
import { formatBtcFromSats } from "@/utils/formatting";

interface SplitTooLowHintProps {
  /** Minimum deposit required to split across two vaults, in satoshis. */
  minDepositForSplit: bigint;
}

export function SplitTooLowHint({ minDepositForSplit }: SplitTooLowHintProps) {
  const hint = COPY.deposit.form.splitTooLowHint(
    formatBtcFromSats(minDepositForSplit),
  );

  // Centered hint that sizes to its content, wrapping to a second line when the
  // message is too long for the row.
  //
  // Deliberately NOT a live region. It renders inside the split selector's
  // accordion, which collapses with `visibility: hidden` while keeping its
  // children mounted - so a live region here is outside the accessibility tree
  // exactly when the amount crosses the minimum, which is the moment worth
  // announcing. `UtxoSplitSelectorV3` owns an off-screen region outside the
  // accordion for that; two would announce the same sentence twice.
  return (
    <div className="flex w-full items-center justify-center gap-2 rounded-lg border border-secondary-strokeLight px-3 py-2 text-center">
      <IoInformationCircle
        size={18}
        className="mt-px shrink-0 text-accent-primary"
      />
      <span className="min-w-0 text-sm text-accent-secondary">
        {hint.prefix}{" "}
        <span className="text-accent-primary">{hint.splitName}</span>
        {hint.middle}{" "}
        <span className="text-accent-primary">{hint.minimum}</span>
      </span>
    </div>
  );
}
