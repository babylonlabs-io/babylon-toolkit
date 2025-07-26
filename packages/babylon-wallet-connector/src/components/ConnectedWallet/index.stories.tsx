import type { Meta, StoryObj } from "@storybook/react";

import { ConnectedWallet } from "./index";

const meta: Meta<typeof ConnectedWallet> = {
  component: ConnectedWallet,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    logo: "/images/wallets/okx.png",
    name: "OKX",
    address: "bc1pnT..e4Vtc",
  },
};
