import type { Meta, StoryObj } from "@storybook/react";

import { ExternalWallets } from "./index";

const meta: Meta<typeof ExternalWallets> = {
  component: ExternalWallets,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    chainName: "bitcoin",
  },
};
