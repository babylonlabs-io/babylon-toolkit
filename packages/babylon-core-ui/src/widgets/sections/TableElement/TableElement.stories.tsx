import type { Meta, StoryObj } from "@storybook/react";

import { TableElement } from "./TableElement";

const meta: Meta<typeof TableElement> = {
    title: "Elements/Data Display/Providers/TableElement",
    component: TableElement,
    tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

const sampleAttributes = {
    Balance: "100.123 BTC",
    "USD Value": "$4,567.89",
    Status: "Active",
};

const mockProvider = {
    logo_url: undefined,
    rank: 1,
    description: {
        moniker: "Lombard Protocol",
    },
};

const providerItem = {
    bsnId: "bsn123",
    bsnName: "Babylon",
    address: "dfe19b1234567890f732de",
    provider: mockProvider,
    // No onRemove to showcase address/noRemove mode
};

export const Default: Story = {
    args: {
        providerItemProps: providerItem,
        attributes: sampleAttributes,
        onSelect: () => alert("Select clicked"),
    },
};

export const Selected: Story = {
    args: {
        providerItemProps: providerItem,
        attributes: sampleAttributes,
        isSelected: true,
        onSelect: () => alert("Select clicked"),
    },
};

export const NotSelectable: Story = {
    args: {
        providerItemProps: providerItem,
        attributes: sampleAttributes,
        isSelectable: false,
        onSelect: () => alert("Select clicked"),
    },
};

export const WithoutHeader: Story = {
    args: {
        providerItemProps: providerItem,
        attributes: sampleAttributes,
    },
};
