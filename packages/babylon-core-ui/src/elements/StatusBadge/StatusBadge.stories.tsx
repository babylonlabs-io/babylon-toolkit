import type { Meta, StoryObj } from "@storybook/react";
import { StatusBadge } from "./StatusBadge";

const meta = {
  title: "Elements/StatusBadge",
  component: StatusBadge,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    status: {
      control: "select",
      options: ["active", "inactive", "pending", "default"],
      description: "The status variant to display",
    },
    label: {
      control: "text",
      description: "Optional custom label (defaults to capitalized status)",
    },
    className: {
      control: "text",
      description: "Additional CSS classes",
    },
  },
} satisfies Meta<typeof StatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Active: Story = {
  args: {
    status: "active",
  },
};

export const Inactive: Story = {
  args: {
    status: "inactive",
  },
};

export const Pending: Story = {
  args: {
    status: "pending",
  },
};

export const Default: Story = {
  args: {
    status: "default",
  },
};

export const CustomLabel: Story = {
  args: {
    status: "active",
    label: "Running",
  },
};

export const AllStatuses: Story = {
  args: {
    status: "active",
  },
  render: () => (
    <div className="flex flex-col gap-4">
      <StatusBadge status="active" />
      <StatusBadge status="pending" />
      <StatusBadge status="inactive" />
      <StatusBadge status="default" />
    </div>
  ),
};

export const WithCustomLabels: Story = {
  args: {
    status: "active",
  },
  render: () => (
    <div className="flex flex-col gap-4">
      <StatusBadge status="active" label="Live" />
      <StatusBadge status="pending" label="Processing" />
      <StatusBadge status="inactive" label="Closed" />
      <StatusBadge status="default" label="Unknown" />
    </div>
  ),
};

export const InCard: Story = {
  args: {
    status: "active",
  },
  render: () => (
    <div className="w-96 bg-secondary-highlight p-4 rounded">
      <div className="flex justify-between items-center">
        <span className="text-sm text-accent-secondary">Status</span>
        <StatusBadge status="active" />
      </div>
    </div>
  ),
};

