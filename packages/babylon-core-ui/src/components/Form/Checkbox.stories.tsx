import type { Meta, StoryObj } from "@storybook/react";

import { Checkbox } from "./Checkbox";

const meta: Meta<typeof Checkbox> = {
  component: Checkbox,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    name: "group",
    value: "test",
    label: "Label",
  },
};
