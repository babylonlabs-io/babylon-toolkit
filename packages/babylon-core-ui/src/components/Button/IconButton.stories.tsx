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

export const OutlinedSmall: Story = {
  args: {
    size: "small",
    variant: "outlined",
    children: <RiCloseLargeLine size={20} />,
  },
};

export const OutlinedMedium: Story = {
  args: {
    size: "medium",
    variant: "outlined",
    children: <RiCloseLargeLine size={22} />,
  },
};

export const OutlinedLarge: Story = {
  args: {
    size: "large",
    variant: "outlined",
    children: <RiCloseLargeLine size={24} />,
  },
};

export const ContainedSmall: Story = {
  args: {
    size: "small",
    variant: "contained",
    children: <RiCloseLargeLine size={20} />,
  },
};

export const ContainedMedium: Story = {
  args: {
    size: "medium",
    variant: "contained",
    children: <RiCloseLargeLine size={22} />,
  },
};

export const ContainedLarge: Story = {
  args: {
    size: "large",
    variant: "contained",
    children: <RiCloseLargeLine size={24} />,
  },
};
