import { Avatar, Button } from "@babylonlabs-io/core-ui";

import { formatAmount } from "@/utils/formatting";

import type { FlowSuccessData } from "./useBorrowFlow";

interface FlowSuccessProps {
  data: FlowSuccessData;
  onClose: () => void;
}

export function FlowSuccess({ data, onClose }: FlowSuccessProps) {
  const formattedAmount = formatAmount(data.amount);

  const heading =
    data.type === "borrow"
      ? "Borrow Successful"
      : `${data.symbol} Repay Successful`;

  const body =
    data.type === "borrow"
      ? `${formattedAmount} ${data.symbol} has been borrowed and is now available in your wallet.`
      : `You have repaid ${formattedAmount} ${data.symbol}.`;

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
          {heading}
        </h4>

        <p className="mt-4 text-[20px] leading-7 text-accent-secondary">
          {body}
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
