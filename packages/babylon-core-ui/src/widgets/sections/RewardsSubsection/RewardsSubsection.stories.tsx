import type { Meta, StoryObj } from "@storybook/react";
import { RewardsSubsection } from "./RewardsSubsection";

const meta: Meta<typeof RewardsSubsection> = {
    component: RewardsSubsection,
    tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        rewards: [
            {
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
        ],
    },
};

export const MultipleRewards: Story = {
    args: {
        rewards: [
            {
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
            {
                amount: 45,
                currencyIcon: "https://placehold.co/40x40",
                currencyName: "BTC",
                displayBalance: true,
                chainName: "Bitcoin",
                balanceDetails: {
                    balance: 10,
                    symbol: "BTC",
                    price: 30000,
                    displayUSD: true,
                    decimals: 8,
                },
            },
        ],
    },
};