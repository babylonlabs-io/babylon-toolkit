import type { Meta, StoryObj } from "@storybook/react";

import { KeyValueList } from "./KeyValueList";

const meta: Meta<typeof KeyValueList> = {
  title: "Elements/Data Display/KeyValueList",
  component: KeyValueList,
  tags: ["autodocs"],
  argTypes: {
    textSize: {
      control: { type: "select" },
      options: ["small", "medium"],
    },
    showDivider: {
      control: { type: "boolean" },
    },
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

const sampleItems = [
  { label: "Bitcoin Balance", value: "100.123456 BTC" },
  { label: "USD Value", value: "$4,567,890.12" },
  { label: "Status", value: "Active" },
  { label: "Network", value: "Mainnet" },
];

export const Default: Story = {
  name: "Default (medium)",
  args: {
    items: sampleItems,
    textSize: "medium",
    showDivider: true,
  },
};

export const Small: Story = {
  name: "Small Text Size",
  args: {
    items: sampleItems,
    textSize: "small",
    showDivider: true,
  },
};

export const WithoutDivider: Story = {
  name: "Without Divider",
  args: {
    items: sampleItems,
    textSize: "medium",
    showDivider: false,
  },
};

export const LongContent: Story = {
  name: "Long Content",
  args: {
    items: [
      { label: "Very Long Bitcoin Wallet Address", value: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh" },
      { label: "Transaction Hash", value: "a1b2c3d4e5f6789012345678901234567890abcdef" },
      { label: "Network Fee Estimation Details", value: "2.5 sats/vB (Medium Priority)" },
    ],
    textSize: "medium",
    showDivider: true,
  },
};

export const FormattedAddresses: Story = {
  name: "Formatted Addresses (>= 42 chars)",
  args: {
    items: [
      { label: "Oracle Address (42 chars)", value: "0x6f5ED675fbDc633b3D048bC6bf902f66ecA06Cc0" },
      { label: "IRM Address (42 chars)", value: "0xB419D4009bfA6E41CE40b237f2861e83643D7Bae" },
      { label: "Bitcoin Address", value: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh1234567890" },
      { label: "Transaction Hash", value: "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef" },
      { label: "Short Value", value: "Short text (not formatted)" },
    ],
    textSize: "medium",
    showDivider: true,
  },
};

export const WithReactNode: Story = {
  name: "With React Node Value",
  args: {
    items: [
      { label: "Bitcoin Balance", value: "100.123456 BTC" },
      { label: "Status", value: <span className="text-green-500">Active</span> },
      { label: "Network", value: "Mainnet" },
    ],
    textSize: "medium",
    showDivider: true,
  },
};

