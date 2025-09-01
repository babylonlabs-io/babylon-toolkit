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
    warnings: [
      "1. No third party possesses your staked BTC. You are the only one who can unbond and withdraw your stake.",
      "2. Your stake will first be sent to Babylon Genesis for verification (~20 seconds), then you will be prompted to submit it to the Bitcoin ledger. It will be marked as 'Pending' until it receives 10 Bitcoin confirmations.",
    ],
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
    warnings: [
      "The staking transaction may take up to one (1) hour to process.",
      "Funds will not be deducted instantly; maintain sufficient balance until confirmed.",
    ],
    proceedLabel: "Stake",
  },
};

export const CustomWarnings: Story = {
  args: {
    open: true,
    processing: false,
    onClose: () => { },
    onProceed: () => { },
    bsns: [
      {
        icon: <PlaceholderIcon text="B" bgColor="bg-black" />,
        name: "Babylon Genesis",
      },
    ],
    finalityProviders: [],
    details: {
      stakeAmount: "0.25 BTC",
      feeRate: "4 sat/vB",
      transactionFees: "0.00005 BTC",
      term: {
        blocks: "40320 blocks",
        duration: "~ 4 weeks",
      },
      unbonding: "~ 1 day",
      unbondingFee: "0 BTC",
    },
    warnings: [
      "1. Custom line one for this integration.",
      "2. Second line explaining processing behavior.",
      "3. Optional extra note about timelock reset in expansions.",
    ],
    proceedLabel: "Proceed",
  },
};
