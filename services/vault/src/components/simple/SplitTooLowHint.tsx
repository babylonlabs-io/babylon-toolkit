import { Hint } from "@babylonlabs-io/core-ui";
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
  // Deliberately NOT a live region, anywhere in here. It renders inside the
  // split selector's accordion, which collapses with `visibility: hidden` while
  // keeping its children mounted - so a live region here is outside the
  // accessibility tree exactly when the amount crosses the minimum, which is
  // the moment worth announcing. `UtxoSplitSelectorV3` owns an off-screen
  // region outside the accordion for that; two would announce the same sentence
  // twice. That also retires the reason the region was narrowed to the message
  // span in #2263 - with no region at all, an open tooltip cannot re-announce.
  return (
    <div className="flex w-full items-center justify-center gap-2 rounded-lg border border-secondary-strokeLight px-3 py-2 text-center">
      <Hint
        className="shrink-0"
        tooltip={COPY.deposit.form.splitTooLowTooltip}
        icon={
          <IoInformationCircle
            size={18}
            className="mt-px shrink-0 text-accent-primary"
          />
        }
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
