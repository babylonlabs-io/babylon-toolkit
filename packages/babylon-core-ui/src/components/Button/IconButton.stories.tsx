import type { Meta, StoryObj } from "@storybook/react";
import { RiCloseLargeLine } from "react-icons/ri";

import { IconButton } from "./IconButton";

const meta: Meta<typeof IconButton> = {
  component: IconButton,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: <RiCloseLargeLine size={24} />,
  },
};
