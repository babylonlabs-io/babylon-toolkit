import type { Meta, StoryObj } from "@storybook/react";

import { PreviewModal } from "./PreviewModal";

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
    onClose: () => {},
    onProceed: () => {},
    bsns: [
      {
        icon: <span className="bg-primary-300 h-4 w-4 rounded-full" />,
        name: "BSN 1",
      },
      {
        icon: <span className="bg-primary-300 h-4 w-4 rounded-full" />,
        name: "BSN 2",
      },
    ],
    finalityProviders: [
      {
        icon: <span className="bg-secondary-300 h-4 w-4 rounded-full" />,
        name: "FP 1",
      },
      {
        icon: <span className="bg-secondary-300 h-4 w-4 rounded-full" />,
        name: "FP 2",
      },
    ],
    details: {
      stakeAmount: "0.5 BTC",
      feeRate: "5 sat/vB",
      transactionFees: "0.0001 BTC",
      term: {
        blocks: "100",
        duration: "~20 hours",
      },
      unbonding: "1 day",
      unbondingFee: "0 BTC",
    },
  },
};
