import type { Meta, StoryObj } from "@storybook/react";

import { ConnectedWallet } from "../ConnectedWallet";

import { ChainButton } from "./index";

const meta: Meta<typeof ChainButton> = {
  component: ChainButton,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "Select Bitcoin Wallet",
    logo: "/images/chains/bitcoin.png",
  },
};

export const Connected: Story = {
  args: {
    title: "Select Bitcoin Wallet",
    logo: "/images/chains/bitcoin.png",
    children: (
      <ConnectedWallet
        logo="/images/wallets/okx.png"
        address="bc1p7wcysvdpee032xp8834vuvc40zhv77typxl5hwtafktlgcj33ves63zkyd"
      />
    ),
  },
};
