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
};

export default meta;

type Story = StoryObj<typeof meta>;

export const WithWhiteBorder: Story = {
  render: () => (
    <div className="rounded bg-gray-200 p-8">
      <Badge count={1} position="bottom-right" color="secondary" badgeClassName="border-2 border-white">
        <Avatar url="/images/fps/lombard.jpeg" alt="Lombard" size="large" />
      </Badge>
    </div>
  ),
};
