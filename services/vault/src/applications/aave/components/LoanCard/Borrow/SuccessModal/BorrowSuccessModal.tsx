import {
  Avatar,
  Button,
  FullScreenDialog,
  Heading,
  Text,
} from "@babylonlabs-io/core-ui";

import { COPY } from "@/copy";
import { formatAmount } from "@/utils/formatting";

interface BorrowSuccessModalProps {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  borrowAmount: number;
  borrowSymbol: string;
  decimals: number;
  assetIcon: string;
}

/**
 * BorrowSuccessModal - Full-screen success screen for borrow operations
 *
 * Shown after a successful borrow, mirroring the full-screen layout of the
 * borrow form it replaces. Confirms the borrowed amount and dismisses via the
 * "Done" CTA.
 */
export function BorrowSuccessModal({
  open,
  onClose,
  onDone,
  borrowAmount,
  borrowSymbol,
  decimals,
  assetIcon,
}: BorrowSuccessModalProps) {
  const formattedBorrow = formatAmount(borrowAmount, decimals);

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
            <Heading variant="h4">{COPY.loans.borrowSuccess.title}</Heading>

            <Text as="div" className="text-accent-secondary">
              {COPY.loans.borrowSuccess.body(formattedBorrow, borrowSymbol)}
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
          {COPY.loans.borrowSuccess.doneButton}
        </Button>
      </div>
    </FullScreenDialog>
  );
}
