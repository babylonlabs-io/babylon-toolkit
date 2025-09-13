import type { Meta, StoryObj } from "@storybook/react";
import { Badge } from "./Badge";
import { Avatar } from "../Avatar/Avatar";

const meta: Meta<typeof Badge> = {
  title: "Components/Data Display/Indicators/Badge",
  component: Badge,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
  argTypes: {
    count: {
      control: { type: "number", min: 0, max: 999 },
      description: "The number or content to display in the badge",
      defaultValue: 5,
    },
    max: {
      control: { type: "number", min: 1, max: 999 },
      description: "Max count to show. If count is greater than max, show max+",
      defaultValue: 99,
    },
    position: {
      control: { type: "select" },
      options: ["top-right", "top-left", "bottom-right", "bottom-left"],
      description: "The position of the badge",
      defaultValue: "top-right",
    },
    color: {
      control: { type: "select" },
      options: ["primary", "secondary", "error", "warning", "info", "success"],
      description: "The color of the badge",
      defaultValue: "error",
    },
    className: {
      control: { type: "text" },
      description: "Additional CSS class for the badge wrapper",
    },
    badgeClassName: {
      control: { type: "text" },
      description: "Additional CSS class for the badge indicator",
    },
    contentClassName: {
      control: { type: "text" },
      description: "Additional CSS class for the badge content",
    },
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

// Default story with controls
export const Default: Story = {
  args: {
    count: 5,
    max: 99,
    position: "bottom-right",
    color: "secondary",
    badgeClassName: "border-2 border-white"
  },
  render: (args) => (
    <div className="rounded bg-gray-100 p-12">
      <Badge {...args}>
        <Avatar url="/images/fps/lombard.jpeg" alt="Lombard" size="large" />
      </Badge>
    </div>
  ),
};

// Position variants
export const Positions: Story = {
  render: () => (
    <div className="rounded bg-gray-100 p-12">
      <div className="grid grid-cols-2 gap-8 max-w-xs">
        <Badge count={1} position="top-left" color="secondary" badgeClassName="border-2 border-white">
          <Avatar url="/images/fps/lombard.jpeg" alt="Top Left" size="medium" />
        </Badge>
        <Badge count={2} position="top-right" color="secondary" badgeClassName="border-2 border-white">
          <Avatar url="/images/fps/lombard.jpeg" alt="Top Right" size="medium" />
        </Badge>
        <Badge count={3} position="bottom-left" color="secondary" badgeClassName="border-2 border-white">
          <Avatar url="/images/fps/lombard.jpeg" alt="Bottom Left" size="medium" />
        </Badge>
        <Badge count={4} position="bottom-right" color="secondary" badgeClassName="border-2 border-white">
          <Avatar url="/images/fps/lombard.jpeg" alt="Bottom Right" size="medium" />
        </Badge>
      </div>
    </div>
  ),
};


export const HighNumberRank: Story = {
  render: () => (
    <div className="rounded bg-gray-100 p-12">
      <Badge count={1000} max={99} position="bottom-right" color="secondary" badgeClassName="border-2 border-white" contentClassName="text-xs">
        <Avatar url="/images/fps/lombard.jpeg" alt="High Number Rank" size="large" />
      </Badge>
    </div>
  ),
};
