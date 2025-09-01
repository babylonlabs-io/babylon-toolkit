import type { Meta, StoryObj } from "@storybook/react";
import * as yup from "yup";

import { AmountSubsection } from "./AmountSubsection";
import { Form } from "@/widgets/form/Form";

const meta: Meta<typeof AmountSubsection> = {
  component: AmountSubsection,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

// Define a simple validation schema for the field used in this story
const schema = yup
  .object()
  .shape({
    amount: yup.number().required().positive(),
  })
  .required();

export const Default: Story = {
  args: {
    fieldName: "amount",
    currencyIcon: "https://placehold.co/40x40",
    currencyName: "BBN",
    placeholder: "Enter Amount",
    prefix: "Stakable",
    displayBalance: true,
    balanceDetails: {
      balance: 1234.56789,
      symbol: "BBN",
      price: 0.25,
      displayUSD: true,
      decimals: 8,
    },
  },
  decorators: [
    (Story) => (
      <Form onChange={console.log} schema={schema}>
        <Story />
      </Form>
    ),
  ],
};

export const WithoutBalance: Story = {
  args: {
    fieldName: "amount",
    currencyIcon: "https://placehold.co/40x40",
    currencyName: "BBN",
    placeholder: "Enter staking amount",
    displayBalance: false,
  },
  decorators: [
    (Story) => (
      <Form onChange={console.log} schema={schema}>
        <Story />
      </Form>
    ),
  ],
};

export const BitcoinCurrency: Story = {
  args: {
    fieldName: "amount",
    currencyIcon: "https://placehold.co/40x40/FF9500/FFFFFF?text=₿",
    currencyName: "BTC",
    placeholder: "Enter BTC amount",
    prefix: "Available",
    displayBalance: true,
    balanceDetails: {
      balance: 0.12345678,
      symbol: "BTC",
      price: 65000,
      displayUSD: true,
      decimals: 8,
    },
  },
  decorators: [
    (Story) => (
      <Form onChange={console.log} schema={schema}>
        <Story />
      </Form>
    ),
  ],
};

export const LargeBalance: Story = {
  args: {
    fieldName: "amount",
    currencyIcon: "https://placehold.co/40x40/4CAF50/FFFFFF?text=T",
    currencyName: "USDT",
    placeholder: "Enter USDT amount",
    prefix: "Total",
    displayBalance: true,
    balanceDetails: {
      balance: 1000000.123456,
      symbol: "USDT",
      price: 1.0,
      displayUSD: true,
      decimals: 6,
    },
  },
  decorators: [
    (Story) => (
      <Form onChange={console.log} schema={schema}>
        <Story />
      </Form>
    ),
  ],
};

export const WithoutUSDPrice: Story = {
  args: {
    fieldName: "amount",
    currencyIcon: "https://placehold.co/40x40/8B5CF6/FFFFFF?text=S",
    currencyName: "SOL",
    placeholder: "Enter amount",
    prefix: "Delegated",
    displayBalance: true,
    balanceDetails: {
      balance: 500.789,
      symbol: "SOL",
      displayUSD: false,
      decimals: 9,
    },
  },
  decorators: [
    (Story) => (
      <Form onChange={console.log} schema={schema}>
        <Story />
      </Form>
    ),
  ],
};

export const ZeroBalance: Story = {
  args: {
    fieldName: "amount",
    currencyIcon: "https://placehold.co/40x40/E53E3E/FFFFFF?text=X",
    currencyName: "XRP",
    placeholder: "Enter XRP amount",
    prefix: "Available",
    displayBalance: true,
    balanceDetails: {
      balance: 0,
      symbol: "XRP",
      price: 0.5,
      displayUSD: true,
      decimals: 6,
    },
  },
  decorators: [
    (Story) => (
      <Form onChange={console.log} schema={schema}>
        <Story />
      </Form>
    ),
  ],
};

export const SmallBalance: Story = {
  args: {
    fieldName: "amount",
    currencyIcon: "https://placehold.co/40x40/627EEA/FFFFFF?text=Ξ",
    currencyName: "ETH",
    placeholder: "Enter ETH amount",
    prefix: "Staked",
    displayBalance: true,
    balanceDetails: {
      balance: 0.000123456789,
      symbol: "ETH",
      price: 3500,
      displayUSD: true,
      decimals: 18,
    },
  },
  decorators: [
    (Story) => (
      <Form onChange={console.log} schema={schema}>
        <Story />
      </Form>
    ),
  ],
};

export const NoAutoFocus: Story = {
  args: {
    fieldName: "amount",
    currencyIcon: "https://placehold.co/40x40",
    currencyName: "BBN",
    placeholder: "Click to enter amount",
    prefix: "Unbonded",
    displayBalance: true,
    autoFocus: false,
    balanceDetails: {
      balance: 999.87654321,
      symbol: "BBN",
      price: 0.15,
      displayUSD: true,
      decimals: 8,
    },
  },
  decorators: [
    (Story) => (
      <Form onChange={console.log} schema={schema}>
        <Story />
      </Form>
    ),
  ],
};

export const CustomMinStep: Story = {
  args: {
    fieldName: "amount",
    currencyIcon: "https://placehold.co/40x40/F7931A/FFFFFF?text=₿",
    currencyName: "BTC",
    placeholder: "Minimum 0.001 BTC",
    prefix: "Withdrawable",
    displayBalance: true,
    min: "0.001",
    step: "0.001",
    balanceDetails: {
      balance: 2.5,
      symbol: "BTC",
      price: 65000,
      displayUSD: true,
      decimals: 8,
    },
  },
  decorators: [
    (Story) => (
      <Form onChange={console.log} schema={schema}>
        <Story />
      </Form>
    ),
  ],
};

export const NoPrefix: Story = {
  args: {
    fieldName: "amount",
    currencyIcon: "https://placehold.co/40x40/1DA1F2/FFFFFF?text=D",
    currencyName: "DOGE",
    placeholder: "Much amount, very input",
    displayBalance: true,
    balanceDetails: {
      balance: 42069.42,
      symbol: "DOGE",
      price: 0.08,
      displayUSD: true,
      decimals: 8,
    },
  },
  decorators: [
    (Story) => (
      <Form onChange={console.log} schema={schema}>
        <Story />
      </Form>
    ),
  ],
};

export const RestrictedDecimals: Story = {
  args: {
    fieldName: "amount",
    currencyIcon: "https://placehold.co/40x40/FF6B6B/FFFFFF?text=₿",
    currencyName: "BTC",
    placeholder: "Enter BTC amount (max 2 decimals)",
    prefix: "Available",
    displayBalance: true,
    decimals: 2, // Restrict to 2 decimal places
    balanceDetails: {
      balance: 1.23456789,
      symbol: "BTC",
      price: 65000,
      displayUSD: true,
      decimals: 8,
    },
  },
  decorators: [
    (Story) => (
      <Form onChange={console.log} schema={schema}>
        <Story />
      </Form>
    ),
  ],
};
