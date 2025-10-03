import type { Meta, StoryObj } from "@storybook/react";
import { PlusIcon } from "./common/PlusIcon";

const meta: Meta<typeof PlusIcon> = {
  title: "Components/Icons/PlusIcon",
  component: PlusIcon,
  tags: ["autodocs"],
  argTypes: {
    size: {
      control: { type: "number", min: 8, max: 48, step: 2 },
      defaultValue: 14,
    },
    variant: {
      control: "select",
      options: ["default", "primary", "secondary", "error", "success", "accent-primary", "accent-secondary"],
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    size: 14,
    variant: "default",
  },
};

export const Large: Story = {
  args: {
    size: 24,
    variant: "primary",
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex gap-4 items-center">
      <PlusIcon variant="default" />
      <PlusIcon variant="primary" />
      <PlusIcon variant="secondary" />
      <PlusIcon variant="error" />
      <PlusIcon variant="success" />
      <PlusIcon variant="accent-primary" />
      <PlusIcon variant="accent-secondary" />
    </div>
  ),
};

export const DifferentSizes: Story = {
  render: () => (
    <div className="flex gap-4 items-center">
      <PlusIcon size={12} />
      <PlusIcon size={14} />
      <PlusIcon size={20} />
      <PlusIcon size={24} />
      <PlusIcon size={32} />
    </div>
  ),
};

