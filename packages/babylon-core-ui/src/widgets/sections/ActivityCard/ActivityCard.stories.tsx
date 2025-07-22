import type { Meta, StoryObj } from "@storybook/react";

import { ActivityCard } from "./ActivityCard";

const meta: Meta<typeof ActivityCard> = {
    component: ActivityCard,
    tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Basic: Story = {
    args: {
        data: {
            formattedAmount: "1.5 BTC",
            details: [
                { label: "Status", value: "Confirmed" },
                { label: "Date", value: "Mar 15, 2024" },
                { label: "Transaction ID", value: "bc1q...xyz789" },
            ],
        },
    },
};

export const WithIcon: Story = {
    args: {
        data: {
            formattedAmount: "2.3 BTC",
            icon: "/images/fps/lombard.jpeg",
            iconAlt: "Lombard Protocol",
            details: [
                { label: "Status", value: "Pending" },
                { label: "Date", value: "Mar 16, 2024" },
                { label: "Fee", value: "0.0001 BTC" },
            ],
        },
    },
};

export const WithPrimaryAction: Story = {
    args: {
        data: {
            formattedAmount: "0.75 BTC",
            icon: "/images/fps/pumpbtc.jpeg",
            iconAlt: "PumpBTC",
            details: [
                { label: "Status", value: "Pending" },
                { label: "Date", value: "Mar 16, 2024" },
                { label: "Confirmations", value: "2/6" },
            ],
            primaryAction: {
                label: "View Details",
                onClick: () => alert("Primary action clicked"),
                variant: "contained",
            },
        },
    },
};

export const WithSecondaryActions: Story = {
    args: {
        data: {
            formattedAmount: "5.0 BTC",
            icon: "/images/fps/solv.jpeg",
            iconAlt: "Solv Protocol",
            details: [
                { label: "Status", value: "Completed" },
                { label: "Date", value: "Mar 14, 2024" },
                { label: "Recipient", value: "bc1q...abc123" },
            ],
            secondaryActions: [
                {
                    label: "Copy Hash",
                    onClick: () => alert("Hash copied"),
                    variant: "outlined",
                    size: "small",
                },
                {
                    label: "Export",
                    onClick: () => alert("Export clicked"),
                    variant: "outlined",
                    size: "small",
                },
            ],
        },
    },
};

export const WithOptionalDetails: Story = {
    args: {
        data: {
            formattedAmount: "3.2 BTC",
            icon: "/images/wallets/keystone.svg",
            iconAlt: "Keystone Wallet",
            details: [
                { label: "Status", value: "Confirmed" },
                { label: "Date", value: "Mar 15, 2024" },
            ],
            optionalDetails: [
                { label: "Network Fee", value: "0.0001 BTC" },
                { label: "Block Height", value: "834,567" },
                { label: "Confirmations", value: "6/6" },
            ],
        },
    },
};

export const WithListItems: Story = {
    args: {
        data: {
            formattedAmount: "10.5 BTC",
            icon: "/images/wallets/binance.webp",
            iconAlt: "Binance Wallet",
            details: [
                { label: "Status", value: "Completed" },
                { label: "Date", value: "Mar 13, 2024" },
            ],
            listItems: [
                {
                    label: "Finality Providers",
                    items: [
                        { name: "Lombard Protocol", id: "fp1", icon: "/images/fps/lombard.jpeg" },
                        { name: "PumpBTC", id: "fp2", icon: "/images/fps/pumpbtc.jpeg" },
                        { name: "Solv Protocol", id: "fp3", icon: "/images/fps/solv.jpeg" },
                    ],
                },
                {
                    label: "Validators",
                    items: [
                        { name: "Validator One", id: "val1" },
                        { name: "Validator Two", id: "val2" },
                    ],
                },
            ],
        },
    },
};

export const Complete: Story = {
    args: {
        data: {
            formattedAmount: "7.8 BTC",
            icon: "/images/fps/lombard.jpeg",
            iconAlt: "Lombard Protocol",
            details: [
                { label: "Status", value: "Confirmed" },
                { label: "Date", value: "Mar 12, 2024" },
                { label: "Type", value: "Delegation" },
            ],
            optionalDetails: [
                { label: "Network Fee", value: "0.00015 BTC" },
                { label: "Block Height", value: "834,234" },
                { label: "Lock Time", value: "1000 blocks" },
            ],
            listItems: [
                {
                    label: "Finality Providers",
                    items: [
                        { name: "Lombard Protocol", id: "bp1", icon: "/images/fps/lombard.jpeg" },
                        { name: "Solv Protocol", id: "bp2", icon: "/images/fps/solv.jpeg" },
                    ],
                },
            ],
            primaryAction: {
                label: "Manage Delegation",
                onClick: () => alert("Manage delegation clicked"),
                variant: "contained",
                fullWidth: true,
            },
            secondaryActions: [
                {
                    label: "View on Explorer",
                    onClick: () => alert("Explorer opened"),
                    variant: "outlined",
                    size: "small",
                },
                {
                    label: "Share",
                    onClick: () => alert("Share clicked"),
                    variant: "outlined",
                    size: "small",
                },
                {
                    label: "Export Details",
                    onClick: () => alert("Export clicked"),
                    variant: "outlined",
                    size: "small",
                },
            ],
        },
    },
};

export const LargeAmount: Story = {
    args: {
        data: {
            formattedAmount: "1,234.56789 BTC",
            icon: "/images/fps/pumpbtc.jpeg",
            iconAlt: "PumpBTC",
            details: [
                { label: "Status", value: "High Value Transaction" },
                { label: "Date", value: "Mar 16, 2024" },
                { label: "USD Value", value: "$87,421,234.56" },
            ],
            primaryAction: {
                label: "Confirm Transaction",
                onClick: () => alert("High value transaction confirmed"),
                variant: "contained",
            },
        },
    },
};

export const ErrorState: Story = {
    args: {
        data: {
            formattedAmount: "0.5 BTC",
            icon: "/images/status/warning.svg",
            iconAlt: "Warning",
            details: [
                { label: "Status", value: "Failed" },
                { label: "Date", value: "Mar 16, 2024" },
                { label: "Error", value: "Insufficient funds" },
            ],
            secondaryActions: [
                {
                    label: "Retry",
                    onClick: () => alert("Retry clicked"),
                    variant: "contained",
                    size: "small",
                },
                {
                    label: "Cancel",
                    onClick: () => alert("Cancel clicked"),
                    variant: "outlined",
                    size: "small",
                },
            ],
        },
    },
}; 