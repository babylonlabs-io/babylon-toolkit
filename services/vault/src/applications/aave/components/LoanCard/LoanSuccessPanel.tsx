import { Avatar, Button, Heading, Text } from "@babylonlabs-io/core-ui";

import { COPY } from "@/copy";
import { formatAmount } from "@/utils/formatting";

type LoanSuccessVariant = "borrow" | "repay";

interface LoanSuccessPanelProps {
  onDone: () => void;
  variant: LoanSuccessVariant;
  amount: number;
  symbol: string;
  decimals: number;
  assetIcon: string;
}

/** Card width of the success step, applied by the overlay that owns the shell. */
export const LOAN_SUCCESS_WIDTH_CLASS = "max-w-[564px]";

const COPY_BY_VARIANT = {
  borrow: COPY.loans.borrowSuccess,
  repay: COPY.loans.repaySuccess,
} as const;

/**
 * Success step shown after a successful borrow or repay. The layout is
 * identical for both operations; only the copy differs, selected by `variant`.
 * Confirms the amount and dismisses via the "Done" CTA, the close (X), the
 * backdrop, or escape — all four land on the same `onDone`, since there is
 * nothing left to cancel once the transaction has settled.
 *
 * Panel, not a dialog: `LoanFlowOverlay` owns the one full-screen shell every
 * step of the flow renders into.
 */
export function LoanSuccessPanel({
  onDone,
  variant,
  amount,
  symbol,
  decimals,
  assetIcon,
}: LoanSuccessPanelProps) {
  const copy = COPY_BY_VARIANT[variant];
  const formattedAmount = formatAmount(amount, decimals);

  return (
    <div className="mx-auto flex w-full flex-col gap-10 rounded-3xl border border-secondary-strokeLight px-6 pb-6 pt-[72px] text-center text-accent-primary">
      <div className="flex flex-col items-center gap-6">
        <Avatar
          url={assetIcon}
          size="large"
          className="!h-[130px] !w-[130px]"
        />

        <div className="flex flex-col gap-4">
          <Heading variant="h4">{copy.title}</Heading>

          <Text as="div" className="text-accent-secondary">
            {copy.body(formattedAmount, symbol).map((segment, index) => (
              <span
                key={index}
                className={segment.emphasis ? "text-accent-primary" : undefined}
              >
                {segment.text}
              </span>
            ))}
          </Text>
        </div>
      </div>

      <Button
        variant="contained"
        color="secondary"
        size="large"
        fluid
        onClick={onDone}
        data-testid="loan-success-done-button"
      >
        {copy.doneButton}
      </Button>
    </div>
  );
}
