import { Loader, Text } from "@babylonlabs-io/core-ui";

import { COPY } from "@/copy";

import { computeRemainingEthEstimateSeconds } from "./ethConfirmationProgress";

interface EthConfirmationDetailProps {
  /** Confirmations accrued by the ETH registration. */
  confirmations: number;
  /** Required depth before the Pre-PegIn may broadcast. */
  required: number;
  /**
   * Stack each row's label above its value instead of side-by-side. Used in the
   * narrow split-deposit columns, where the inline layout collapses.
   */
  stacked?: boolean;
}

/**
 * Live counter for the Ethereum finality gate.
 *
 * Deliberately carries no transaction hash row: the resume path reaches this
 * panel from a chain read with no ETH tx hash in hand (the local record may be
 * from another device), and a row that renders on one path but not the other
 * reads as a bug. The counter is the information that matters.
 */
export function EthConfirmationDetail({
  confirmations,
  required,
  stacked = false,
}: EthConfirmationDetailProps) {
  const copy = COPY.deposit.ethConfirmation;
  const remainingSeconds = computeRemainingEthEstimateSeconds(
    confirmations,
    required,
  );
  const rowClass = stacked
    ? "flex flex-col gap-0.5"
    : "flex items-center justify-between gap-2";

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-lg bg-secondary-highlight p-3">
      <div className={rowClass}>
        <Text as="span" variant="body2" className="text-accent-secondary">
          {copy.confirmations}:
        </Text>
        <Text as="span" variant="body2" className="text-accent-primary">
          {copy.confirmationsValue(confirmations, required)}
        </Text>
      </div>

      <div className={rowClass}>
        <Text as="span" variant="body2" className="text-accent-secondary">
          {remainingSeconds === null
            ? COPY.deposit.waitDetails.status
            : copy.estRemaining}
          :
        </Text>
        {remainingSeconds === null ? (
          <div className="flex items-center gap-2">
            <Loader size={14} className="text-accent-primary" />
            <Text as="span" variant="body2" className="text-accent-primary">
              {copy.finalizing}
            </Text>
          </div>
        ) : (
          <Text as="span" variant="body2" className="text-accent-primary">
            {copy.estRemainingValue(remainingSeconds, required - confirmations)}
          </Text>
        )}
      </div>

      <Text as="span" variant="body2" className="text-accent-secondary">
        {copy.rationale}
      </Text>
    </div>
  );
}
