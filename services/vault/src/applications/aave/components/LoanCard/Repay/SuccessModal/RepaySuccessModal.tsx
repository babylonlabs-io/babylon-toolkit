import {
  Avatar,
  Button,
  FullScreenDialog,
  Heading,
  Text,
} from "@babylonlabs-io/core-ui";

import { COPY } from "@/copy";
import { formatAmount } from "@/utils/formatting";

interface RepaySuccessModalProps {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  repayAmount: number;
  repaySymbol: string;
  decimals: number;
  assetIcon: string;
}

/**
 * RepaySuccessModal - Full-screen success screen for repay operations.
 *
 * Mirrors the borrow success layout: a bordered card with the asset avatar,
 * "{symbol} Repay Successful", the repaid amount, and a "Done" CTA.
 */
export function RepaySuccessModal({
  open,
  onClose,
  onDone,
  repayAmount,
  repaySymbol,
  decimals,
  assetIcon,
}: RepaySuccessModalProps) {
  const formattedRepay = formatAmount(repayAmount, decimals);

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
            <Heading variant="h4">
              {COPY.loans.repaySuccess.title(repaySymbol)}
            </Heading>

            <Text as="div" className="text-accent-secondary">
              {COPY.loans.repaySuccess.body(formattedRepay, repaySymbol)}
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
          {COPY.loans.repaySuccess.doneButton}
        </Button>
      </div>
    </FullScreenDialog>
  );
}
