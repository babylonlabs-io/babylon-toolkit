import type { Meta, StoryObj } from "@storybook/react";

import { ValidatorAvatar } from "./ValidatorAvatar";

const meta: Meta<typeof ValidatorAvatar> = {
    component: ValidatorAvatar,
    tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Image: Story = {
    args: {
        name: "Satoshi",
        url: "/images/wallets/binance.webp",
        size: "large",
        variant: "rounded",
    },
};

export const Initials: Story = {
    args: {
        name: "Satoshi",
        size: "large",
        variant: "rounded",
    },
};
