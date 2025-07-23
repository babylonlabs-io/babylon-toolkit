import type { Meta, StoryObj } from "@storybook/react";
import { RewardSubsection } from "./RewardSubsection";

const meta: Meta<typeof RewardSubsection> = {
    component: RewardSubsection,
    tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        amount: 123,
        currencyIcon: "https://placehold.co/40x40",
        currencyName: "BBN",
        displayBalance: true,
        chainName: "Babylon",
        balanceDetails: {
            balance: 1234.56789,
            symbol: "BBN",
            price: 0.25,
            displayUSD: true,
            decimals: 8,
        },
    },
};