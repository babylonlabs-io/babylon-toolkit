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
    disabled: true,
    title: "Select Bitcoin Wallet",
    logo: "/images/chains/bitcoin.png",
    children: (
      <ConnectedWallet
        chainId="BTC"
        className="cursor-default"
        logo="/images/wallets/okx.png"
        name="OKX"
        address="bc1pnT..e4Vtc"
      />
    ),
  },
};
