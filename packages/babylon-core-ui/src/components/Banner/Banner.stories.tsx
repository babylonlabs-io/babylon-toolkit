import type { Meta, StoryObj } from "@storybook/react";

import { WarningIcon } from "../Icons";
import { Text } from "../Text";
import { Banner } from "./Banner";

// Matches the 20px WarningFilled icon in the Figma banner (node 10088:75288).
const BANNER_ICON_SIZE = 20;

const meta: Meta<typeof Banner> = {
  component: Banner,
  title: "Components/Data Display/Indicators/Banner",
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Critical: Story = {
  args: {
    children: <span className="text-base font-bold leading-6 tracking-0.15">Critical — liquidation in 2.3%</span>,
    icon: <WarningIcon color="text-accent-contrast" size={BANNER_ICON_SIZE} />,
  },
};

export const Notice: Story = {
  args: {
    children: <Text variant="body2">Deposits are currently disabled while we address an issue.</Text>,
    variant: "notice",
  },
};
