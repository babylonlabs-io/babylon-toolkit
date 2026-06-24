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

  // Centered hint; the wider horizontal padding keeps the message compact and
  // centered whether it renders on one or two lines.
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex w-full items-center justify-center gap-2 rounded-lg border border-secondary-strokeLight px-3 py-2 text-center"
    >
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
