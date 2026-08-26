import type { Meta, StoryObj } from "@storybook/react";

import { LoaderScreen } from "./index";

const meta: Meta<typeof LoaderScreen> = {
  component: LoaderScreen,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    className: "h-[600px]",
    title: "Connect Wallet",
  },
};
