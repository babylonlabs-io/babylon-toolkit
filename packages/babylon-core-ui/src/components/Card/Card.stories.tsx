import type { Meta, StoryObj } from "@storybook/react";

import { Card } from "./Card";

const meta: Meta<typeof Card> = {
  component: Card,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { children: <span className="text-accent-primary">Card</span> },
};
