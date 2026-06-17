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
    address: "bc1p7wcysvdpee032xp8834vuvc40zhv77typxl5hwtafktlgcj33ves63zkyd",
  },
};
