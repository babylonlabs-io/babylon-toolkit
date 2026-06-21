import {
  Avatar,
  Button,
  FullScreenDialog,
  Heading,
  Text,
} from "@babylonlabs-io/core-ui";

import { COPY } from "@/copy";
import { formatAmount } from "@/utils/formatting";

type LoanSuccessVariant = "borrow" | "repay";

interface LoanSuccessModalProps {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  variant: LoanSuccessVariant;
  amount: number;
  symbol: string;
  decimals: number;
  assetIcon: string;
}

const COPY_BY_VARIANT = {
  borrow: COPY.loans.borrowSuccess,
  repay: COPY.loans.repaySuccess,
} as const;

/**
 * Full-screen success screen shown after a successful borrow or repay. The
 * layout is identical for both operations; only the copy differs, selected by
 * `variant`. Confirms the amount and dismisses via the "Done" CTA.
 */
export function LoanSuccessModal({
  open,
  onClose,
  onDone,
  variant,
  amount,
  symbol,
  decimals,
  assetIcon,
}: LoanSuccessModalProps) {
  const copy = COPY_BY_VARIANT[variant];
  const formattedAmount = formatAmount(amount, decimals);

  return (
    <FullScreenDialog
      open={open}
      onClose={onClose}
      className="items-center justify-center p-6"
    >
      <div className="mx-auto flex w-full max-w-[564px] flex-col gap-10 rounded-3xl border border-secondary-strokeLight px-6 pb-6 pt-[72px] text-center text-accent-primary">
        <div className="flex flex-col items-center gap-6">
          <Avatar
            url={assetIcon}
            size="large"
            className="!h-[130px] !w-[130px]"
          />

          <div className="flex flex-col gap-4">
            <Heading variant="h4">{copy.title}</Heading>

            <Text as="div" className="text-accent-secondary">
              {copy.body(formattedAmount, symbol)}
            </Text>
          </div>
        </div>

        <Button
          variant="contained"
          color="secondary"
          size="large"
          fluid
          onClick={onDone}
        >
          {copy.doneButton}
        </Button>
      </div>
    </FullScreenDialog>
  );
}
