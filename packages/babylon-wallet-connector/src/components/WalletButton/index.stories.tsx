import type { Meta, StoryObj } from "@storybook/react";

import { WalletButton } from "./index";

const meta: Meta<typeof WalletButton> = {
  component: WalletButton,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    name: "Binance Web3 Wallet",
    logo: "/images/wallets/binance.png",
    label: "Installed",
  },
};
