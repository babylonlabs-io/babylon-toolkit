import type { Meta, StoryObj } from "@storybook/react";
import { FaLock, FaLockOpen } from "react-icons/fa";

import { Toggle } from "./Toggle";

const meta: Meta<typeof Toggle> = {
  component: Toggle,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    activeIcon: <FaLockOpen size={10} />,
    inactiveIcon: <FaLock size={10} />,
  },
};
