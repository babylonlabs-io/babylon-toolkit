import type { Meta, StoryObj } from "@storybook/react";

import { Network } from "@/core/types";

import { Inscriptions } from "./index";

const meta: Meta<typeof Inscriptions> = {
  component: Inscriptions,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    className: "h-[600px]",
    config: {
      coinName: "BTC",
      coinSymbol: "BTC",
      networkName: "mainnet",
      mempoolApiUrl: "/",
      network: Network.MAINNET,
    },
  },
};
