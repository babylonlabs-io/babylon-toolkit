import type { Meta, StoryObj } from "@storybook/react";

import { PreviewModal } from "./PreviewModal";

const PlaceholderIcon = ({ text, bgColor = "bg-primary-300" }: { text: string; bgColor?: string }) => (
  <div className={`${bgColor} flex h-6 w-6 items-center justify-center rounded text-xs font-semibold text-white`}>
    {text}
  </div>
);

const meta: Meta<typeof PreviewModal> = {
  component: PreviewModal,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    open: true,
    processing: false,
    onClose: () => { },
    onProceed: () => { },
    bsns: [
      {
        icon: <PlaceholderIcon text="B1" bgColor="bg-black" />,
        name: "BSN 1",
      },
      {
        icon: <PlaceholderIcon text="B2" bgColor="bg-black" />,
        name: "BSN 2",
      },
    ],
    finalityProviders: [
      {
        icon: <PlaceholderIcon text="F1" bgColor="bg-black" />,
        name: "FP 1",
      },
      {
        icon: <PlaceholderIcon text="F2" bgColor="bg-black" />,
        name: "FP 2",
      },
    ],
    details: {
      stakeAmount: "0.5 BTC",
      feeRate: "5 sat/vB",
      transactionFees: "0.0001 BTC",
      term: {
        blocks: "60000 blocks",
        duration: "~ 60 weeks",
      },
      unbonding: "~ 1 day",
      unbondingFee: "0 BTC",
    },
  },
};

export const ValidatorOnly: Story = {
  args: {
    open: true,
    processing: false,
    onClose: () => { },
    onProceed: () => { },
    bsns: [
      {
        icon: <PlaceholderIcon text="K" bgColor="bg-black" />,
        name: "Keplr",
      },
    ],
    finalityProviders: [],
    details: {
      stakeAmount: "0.5 BTC",
      feeRate: "5 sat/vB",
      transactionFees: "0.0001 BTC",
      term: {
        blocks: "60000 blocks",
        duration: "~ 60 weeks",
      },
      unbonding: "~ 1 day",
      unbondingFee: "0 BTC",
    },
    visibleFields: ["Stake Amount", "Transaction Fees"],
    attentionText:
      "The staking transaction may take up to one (1) hour to process. Funds will not be deducted instantly; a sufficient available balance must be maintained until the transaction is confirmed and the deduction is finalized.",
    proceedLabel: "Stake",
  },
};
