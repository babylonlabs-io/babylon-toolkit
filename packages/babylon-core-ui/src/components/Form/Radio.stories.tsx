import type { Meta, StoryObj } from "@storybook/react";

import { Radio } from "./Radio";

const meta: Meta<typeof Radio> = {
  component: Radio,
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
