import type { Meta, StoryObj } from "@storybook/react";

import { ConfirmationDialog } from "./ConfirmationDialog";

const meta: Meta<typeof ConfirmationDialog> = {
  title: "Components/Containers/Overlays/ConfirmationDialog",
  component: ConfirmationDialog,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

const SplitIcon = () => (
  <svg
    width="64"
    height="64"
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="32" cy="32" r="31" stroke="#CE6533" strokeWidth="2" />
    <path
      d="M32 20v24M24 36l8 8 8-8"
      stroke="#CE6533"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const Default: Story = {
  args: {
    open: true,
    icon: <SplitIcon />,
    title: "Split Your Vaults",
    description:
      "Your deposit amount exceeds the maximum vault size. We recommend splitting it into multiple vaults for better security and flexibility.",
    primaryAction: { label: "Continue to Split", onClick: () => {} },
    secondaryAction: { label: "Do not split", onClick: () => {} },
  },
};

export const WithoutSecondaryAction: Story = {
  args: {
    open: true,
    icon: <SplitIcon />,
    title: "Confirm Deposit",
    description:
      "You are about to deposit 0.5 BTC. This action will lock your Bitcoin in a vault.",
    primaryAction: { label: "Confirm", onClick: () => {} },
  },
};

export const WithoutIcon: Story = {
  args: {
    open: true,
    title: "Are you sure?",
    description:
      "This action cannot be undone. Please confirm you want to proceed.",
    primaryAction: { label: "Yes, proceed", onClick: () => {} },
    secondaryAction: { label: "Cancel", onClick: () => {} },
  },
};

export const CustomIcon: Story = {
  args: {
    open: true,
    icon: (
      <img
        src="https://placehold.co/80x80/CE6533/FFF?text=BTC"
        alt="BTC"
        width={80}
        height={80}
        style={{ borderRadius: "50%" }}
      />
    ),
    title: "Bitcoin Vault",
    description:
      "Your Bitcoin will be secured in a trustless vault with multi-party verification.",
    primaryAction: { label: "Create Vault", onClick: () => {} },
    secondaryAction: { label: "Learn More", onClick: () => {} },
  },
};
