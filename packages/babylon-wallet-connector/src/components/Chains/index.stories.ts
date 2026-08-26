import type { Meta, StoryObj } from "@storybook/react";

import { Chains } from "./index";

const meta: Meta<typeof Chains> = {
  component: Chains,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    chains: [
      {
        id: "BTC",
        name: "Bitcoin",
        icon: "/images/chains/bitcoin.png",
        wallets: [
          {
            id: "okx",
            name: "OKX",
            installed: true,
            icon: "/images/wallets/okx.png",
            docs: "",
            provider: null,
            account: null,
            label: "Installed",
          },
        ],
        config: {},
      },
      { id: "BBN", name: "Babylon Chain", icon: "/images/chains/babylon.jpeg", wallets: [], config: {} },
    ],
    selectedWallets: {
      BTC: {
        id: "okx",
        name: "OKX",
        installed: true,
        icon: "/images/wallets/okx.png",
        docs: "",
        provider: null,
        account: null,
        label: "Installed",
      },
    },
    className: "h-[600px]",
    onSelectChain: console.log,
  },
};
