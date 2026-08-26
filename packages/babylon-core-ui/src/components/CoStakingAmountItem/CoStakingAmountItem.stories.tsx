import type { Meta, StoryObj } from "@storybook/react";

import { CoStakingAmountItem } from "./CoStakingAmountItem";

const meta: Meta<typeof CoStakingAmountItem> = {
  title: "Widgets/Rewards/CoStakingAmountItem",
  component: CoStakingAmountItem,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "BTC staking",
    amount: "1,234.56",
    symbol: "BBN",
    caption: "Rewards earned by staking BTC",
  },
};

export const WithCustomClass: Story = {
  args: {
    title: "Custom styled",
    amount: "999.99",
    symbol: "BBN",
    caption: "With extra className",
    className: "!bg-primary-main",
  },
};
