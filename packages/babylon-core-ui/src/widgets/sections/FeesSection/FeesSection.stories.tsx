import type { Meta, StoryObj } from "@storybook/react";

import { FeesSection } from "./FeesSection";

const meta: Meta<typeof FeesSection> = {
  title: "Widgets/Staking/FeesSection",
  component: FeesSection,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    feeRate: 5,
    feeAmount: "0.0001",
    coinSymbol: "BTC",
    total: "0.0001",
  },
};

export const BabylonNetworkFee: Story = {
  render: () => (
    <FeesSection bbnFeeAmount={0} bbnCoinSymbol="BABY" bbnFeeAmountHint="$0,00" />
  ),
};
