import type { Meta, StoryObj } from "@storybook/react";
import { FeeItem } from "./FeeItem";

const meta: Meta<typeof FeeItem> = {
    title: "Components/Data Display/Values/FeeItem",
    component: FeeItem,
    tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof FeeItem>;

export const Default: Story = {
    args: {
        title: "Network Fee",
        children: "0.0001 BTC",
    },
};

export const WithHint: Story = {
    args: {
        title: "Network Fee",
        children: "0.0001 BTC",
        hint: "Fast",
    },
}; 