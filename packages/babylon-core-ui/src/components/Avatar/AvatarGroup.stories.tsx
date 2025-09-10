import type { Meta, StoryObj } from "@storybook/react";
import { Avatar } from "./Avatar";
import { AvatarGroup } from "./AvatarGroup";

const meta: Meta<typeof AvatarGroup> = {
  title: "Components/Identity/Avatars/AvatarGroup",
  component: AvatarGroup,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    max: 3,
    avatarClassName: "bg-primary-dark text-accent-contrast",
    variant: "circular",
    children: [
      <Avatar alt="Binance" url="/images/wallets/binance.webp" />,
      <Avatar className="border bg-accent-contrast" alt="Keystone" url="/images/wallets/keystone.svg" />,
      <Avatar>DT</Avatar>,
      <Avatar>JK</Avatar>,
    ],
  },
};
