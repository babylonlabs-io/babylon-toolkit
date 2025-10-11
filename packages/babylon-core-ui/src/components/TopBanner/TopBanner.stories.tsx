import type { Meta, StoryObj } from "@storybook/react";
import { TopBanner } from "./TopBanner";
import { InfoIcon } from "../Icons";

const meta: Meta<typeof TopBanner> = {
  component: TopBanner,
  title: "Components/Data Display/Indicators/TopBanner",
  tags: ["autodocs"],
  argTypes: {
    visible: {
      control: "boolean",
      description: "Whether the banner is visible",
    },
    message: {
      control: "text",
      description: "Banner message text",
    },
    onClick: {
      action: "clicked",
      description: "Callback when banner is clicked",
    },
    onDismiss: {
      action: "dismissed",
      description: "Callback when banner is dismissed",
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    visible: true,
    message: "Boost Your BTC Staking Rewards",
    onClick: () => console.log("Banner clicked"),
    onDismiss: () => console.log("Banner dismissed"),
  },
};

export const WithInfoIcon: Story = {
  args: {
    visible: true,
    message: "Boost Your BTC Staking Rewards",
    onClick: () => console.log("Banner clicked"),
    onDismiss: () => console.log("Banner dismissed"),
    icon: <InfoIcon size={20} variant="accent-primary" />,
  },
};

export const Hidden: Story = {
  args: {
    visible: false,
    message: "Boost Your BTC Staking Rewards",
    onClick: () => console.log("Banner clicked"),
    onDismiss: () => console.log("Banner dismissed"),
  },
};
