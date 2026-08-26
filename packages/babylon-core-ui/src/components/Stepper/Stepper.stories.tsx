import type { Meta, StoryObj } from "@storybook/react";

import { Stepper } from "./Stepper";

const meta: Meta<typeof Stepper> = {
  title: "Components/Stepper",
  component: Stepper,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

const depositSteps = [
  { label: "Sign proof of possession" },
  { label: "Sign & submit peg-in request" },
  { label: "Wait for Vault Provider" },
  { label: "Sign payout transactions" },
  { label: "Wait for on-chain verification" },
  { label: "Sign & broadcast BTC transaction" },
  { label: "Confirmation" },
];

export const Default: Story = {
  args: {
    steps: depositSteps,
    currentStep: 3,
  },
};

export const AllPending: Story = {
  args: {
    steps: depositSteps,
    currentStep: 0,
  },
};

export const AllCompleted: Story = {
  args: {
    steps: depositSteps,
    currentStep: 8,
  },
};

export const WithDescriptions: Story = {
  args: {
    steps: [
      { label: "Sign proof of possession" },
      { label: "Submit peg-in request" },
      { label: "Wait for Vault Provider", description: "(~ 15 min)" },
      { label: "Sign payout transactions" },
      { label: "Wait for verification", description: "(~ 10 min)" },
      { label: "Broadcast BTC transaction" },
      { label: "Confirmation" },
    ],
    currentStep: 3,
  },
};
