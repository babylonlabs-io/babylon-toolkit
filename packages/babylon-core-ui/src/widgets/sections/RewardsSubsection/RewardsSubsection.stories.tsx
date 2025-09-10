import type { Meta, StoryObj } from "@storybook/react";
import { action } from "@storybook/addon-actions";
import { RewardsSubsection } from "./RewardsSubsection";

const meta: Meta<typeof RewardsSubsection> = {
    title: "Widgets/Rewards/RewardsSubsection",
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
        onClick: () => {
            action("claim-button-clicked")();
            alert("Claim button clicked!");
        },
        disabled: false,
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
        onClick: () => {
            action("claim-button-clicked")();
            alert("Claim button clicked!");
        },
        disabled: false,
    },
};

export const DisabledClaim: Story = {
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
        onClick: () => {
            action("claim-button-clicked")();
            alert("This should not appear - button is disabled!");
        },
        disabled: true,
    },
};