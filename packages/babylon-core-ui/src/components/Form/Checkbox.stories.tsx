import type { Meta, StoryObj } from "@storybook/react";

import { Checkbox } from "./Checkbox";

const meta: Meta<typeof Checkbox> = {
  title: "Components/Inputs/Controls/Checkbox",
  component: Checkbox,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    name: "group",
    value: "test",
    label: "Default Checkbox",
  },
};

export const Primary: Story = {
  args: {
    name: "primary-group",
    value: "primary-test",
    label: "Primary Checkbox",
    variant: "primary",
  },
};

export const Secondary: Story = {
  args: {
    name: "secondary-group",
    value: "secondary-test",
    label: "Secondary Checkbox",
    variant: "secondary",
  },
};

export const WithoutLabel: Story = {
  args: {
    name: "no-label",
    value: "no-label-test",
    variant: "secondary",
    showLabel: false,
  },
};
