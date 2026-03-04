import type { Meta, StoryObj } from "@storybook/react";

import { Chip } from "./Chip";
import { ChipButton } from "./ChipButton";

const meta: Meta<typeof Chip> = {
  title: "Components/Data Display/Indicators/Chip",
  component: Chip,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { children: "Installed" },
};

export const ChipButtonDefault: StoryObj<typeof ChipButton> = {
  render: () => (
    <ChipButton onClick={() => alert("Clicked")}>Awaiting key</ChipButton>
  ),
};

export const ChipButtonDisabled: StoryObj<typeof ChipButton> = {
  render: () => (
    <ChipButton disabled onClick={() => {}}>
      Loading...
    </ChipButton>
  ),
};
