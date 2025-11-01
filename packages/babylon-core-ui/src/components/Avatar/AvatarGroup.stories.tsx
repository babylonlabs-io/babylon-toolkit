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

export const Tiny: Story = {
  args: {
    max: 3,
    size: "tiny",
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

export const Small: Story = {
  args: {
    max: 3,
    size: "small",
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

export const Medium: Story = {
  args: {
    max: 3,
    size: "medium",
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

export const Large: Story = {
  args: {
    max: 3,
    size: "large",
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

export const XLarge: Story = {
  args: {
    max: 3,
    size: "xlarge",
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
