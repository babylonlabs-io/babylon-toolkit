import type { Meta, StoryObj } from "@storybook/react";

import { Callout } from "./Callout";

const meta: Meta<typeof Callout> = {
  title: "Components/Data Display/Indicators/Callout",
  component: Callout,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Error: Story = {
  args: {
    variant: "error",
    title: "Transaction failed",
    children: (
      <>
        Your wallet <strong>doesn&rsquo;t have enough ETH</strong> to cover the
        network fee.
        <br />
        Add more ETH and retry the transaction.
      </>
    ),
  },
};

export const Warning: Story = {
  args: {
    variant: "warning",
    title: "Slow network",
    children:
      "Bitcoin network fees are higher than usual. Your deposit may take longer to confirm.",
  },
};

export const Success: Story = {
  args: {
    variant: "success",
    title: "Deposit confirmed",
    children: "Your BTC vault has been activated on the network.",
  },
};

export const Info: Story = {
  args: {
    variant: "info",
    title: "Heads up",
    children: "Keep this browser tab open while we sign the remaining steps.",
  },
};

export const WithoutTitle: Story = {
  args: {
    variant: "info",
    children: "A short standalone callout with no title.",
  },
};

export const LongBody: Story = {
  args: {
    variant: "error",
    title: "Transaction failed",
    children:
      "Wallet returned an unrecognized error 0x70a08231000000000000000000000000abcdef0123456789abcdef0123456789abcdef. Try reconnecting your wallet and retrying the transaction.",
  },
};
