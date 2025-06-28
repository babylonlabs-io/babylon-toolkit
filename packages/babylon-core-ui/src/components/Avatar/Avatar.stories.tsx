import type { Meta, StoryObj } from "@storybook/react";

import { Avatar } from "./Avatar";

const meta: Meta<typeof Avatar> = {
  component: Avatar,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Image: Story = {
  args: {
    alt: "Binance",
    url: "/images/wallets/binance.webp",
  },
};

export const Text: Story = {
  args: {
    className: "bg-surface text-accent-contrast",
    children: "DT",
  },
};
