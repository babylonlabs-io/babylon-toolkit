import { Avatar, Button } from "@babylonlabs-io/core-ui";

import type { BorrowSuccessData } from "./useBorrowFlow";

interface BorrowSuccessProps {
  data: BorrowSuccessData;
  onClose: () => void;
}

export function BorrowSuccess({ data, onClose }: BorrowSuccessProps) {
  const formattedAmount = data.amount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  return (
    <div className="flex items-center justify-center">
      <div className="flex w-full max-w-[440px] flex-col items-center rounded-3xl border border-secondary-strokeLight p-10 text-center">
        <Avatar
          url={data.icon}
          alt={data.symbol}
          size="large"
          className="!h-[130px] !w-[130px]"
        />

        <h4 className="mt-6 text-[34px] font-normal text-accent-primary">
          Borrow Successful
        </h4>

        <p className="mt-4 text-[20px] leading-7 text-accent-secondary">
          {formattedAmount} {data.symbol} has been borrowed and is now available
          in your wallet.
        </p>

        <Button
          variant="contained"
          color="secondary"
          size="large"
          fluid
          onClick={onClose}
          className="mt-8"
        >
          Done
        </Button>
      </div>
    </div>
  );
}
