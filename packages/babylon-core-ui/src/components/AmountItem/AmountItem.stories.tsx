import type { Meta, StoryObj } from "@storybook/react";

import { AmountItem } from "./AmountItem";

const meta: Meta<typeof AmountItem> = {
    title: "Elements/Inputs/Controls/AmountItem",
    component: AmountItem,
    tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        amount: 0.5,
        currencyIcon: "https://placehold.co/40x40",
        currencyName: "BBN",
        placeholder: "Enter Amount",
        displayBalance: true,
        balanceDetails: {
            balance: 1234.56789,
            symbol: "BBN",
            price: 0.25,
            displayUSD: true,
            decimals: 8,
        },
        min: "0",
        step: "0.00000001",
        autoFocus: false,
        onChange: console.log,
        onKeyDown: console.log,
        amountUsd: "250.00",
        disabled: false,
    },
};