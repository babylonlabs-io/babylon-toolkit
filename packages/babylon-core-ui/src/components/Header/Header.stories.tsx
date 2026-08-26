import type { Meta, StoryObj } from "@storybook/react";

import { Header } from "./Header";
import { Nav } from "../Nav/Nav";

const meta: Meta<typeof Header> = {
  title: "Components/Header",
  component: Header,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Header>;

const exampleNavigation = (
  <Nav>
    <a
      href="/"
      className="flex h-10 w-fit items-center justify-center whitespace-nowrap text-center text-accent-primary"
    >
      Home
    </a>
  </Nav>
);

const exampleMultipleNavigation = (
  <Nav>
    <a
      href="/"
      className="flex h-10 w-fit items-center justify-center whitespace-nowrap text-center text-accent-primary"
    >
      Home
    </a>
    <a
      href="/stake"
      className="flex h-10 w-fit items-center justify-center whitespace-nowrap text-center text-accent-secondary"
    >
      Stake
    </a>
    <a
      href="/rewards"
      className="flex h-10 w-fit items-center justify-center whitespace-nowrap text-center text-accent-secondary"
    >
      Rewards
    </a>
  </Nav>
);

const exampleMobileNavigation = (
  <>
    <a
      href="/"
      className="flex h-10 w-fit items-center justify-center whitespace-nowrap text-center text-accent-primary"
    >
      Home
    </a>
  </>
);

const exampleMultipleMobileNavigation = (
  <>
    <a
      href="/"
      className="flex h-10 w-fit items-center justify-center whitespace-nowrap text-center text-accent-primary"
    >
      Home
    </a>
    <a
      href="/stake"
      className="flex h-10 w-fit items-center justify-center whitespace-nowrap text-center text-accent-secondary"
    >
      Stake
    </a>
    <a
      href="/rewards"
      className="flex h-10 w-fit items-center justify-center whitespace-nowrap text-center text-accent-secondary"
    >
      Rewards
    </a>
  </>
);

export const Default: Story = {
  args: {
    navigation: exampleNavigation,
    mobileNavigation: exampleMobileNavigation,
    rightActions: <div className="flex items-center gap-2" />,
  },
};

export const WithMultipleNavItems: Story = {
  args: {
    navigation: exampleMultipleNavigation,
    mobileNavigation: exampleMultipleMobileNavigation,
    rightActions: <div className="flex items-center gap-2" />,
  },
};

export const WithConnectButton: Story = {
  args: {
    navigation: exampleNavigation,
    mobileNavigation: exampleMobileNavigation,
    rightActions: (
      <div className="flex items-center gap-2">
        <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-accent-primary">
          Connect Wallet
        </button>
      </div>
    ),
  },
};

export const SmallSize: Story = {
  args: {
    navigation: exampleNavigation,
    mobileNavigation: exampleMobileNavigation,
    size: "sm",
    rightActions: (
      <div className="flex items-center gap-2">
        <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-accent-primary">
          Connect Wallet
        </button>
      </div>
    ),
  },
};

export const LargeSize: Story = {
  args: {
    navigation: exampleNavigation,
    mobileNavigation: exampleMobileNavigation,
    size: "lg",
    rightActions: <div className="flex items-center gap-2" />,
  },
};

