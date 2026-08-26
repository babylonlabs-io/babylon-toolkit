import type { Meta, StoryObj } from "@storybook/react";

import { ProgressDialog } from "./ProgressDialog";

const meta: Meta<typeof ProgressDialog> = {
  title: "Components/Containers/Overlays/ProgressDialog",
  component: ProgressDialog,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

const depositSteps = [
  { label: "Sign proof of possession" },
  { label: "Sign & submit peg-in request" },
  { label: "Wait for Vault Provider", description: "(~ 15 min)" },
  { label: "Sign payout transactions" },
  { label: "Wait for on-chain verification", description: "(~ 10 min)" },
  { label: "Sign & broadcast BTC transaction" },
  { label: "Confirmation" },
];

export const Default: Story = {
  args: {
    open: true,
    title: "Deposit in Progress",
    steps: depositSteps,
    currentStep: 1,
    actionLabel: "Close",
    onAction: () => {},
    actionDisabled: true,
  },
};

export const MidProgress: Story = {
  args: {
    open: true,
    title: "Deposit in Progress",
    steps: depositSteps,
    currentStep: 4,
    actionLabel: "Continue in Background",
    onAction: () => {},
  },
};

export const WithDisabledAction: Story = {
  args: {
    open: true,
    title: "Deposit in Progress",
    steps: depositSteps,
    currentStep: 2,
    actionLabel: "Processing...",
    onAction: () => {},
    actionDisabled: true,
  },
};
