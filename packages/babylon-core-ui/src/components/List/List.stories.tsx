import type { Meta, StoryObj } from "@storybook/react";
import { MdOutlineInfo, MdAccountBalanceWallet, MdTrendingUp } from "react-icons/md";

import { List } from "./List";
import { ListItem } from "./components/ListItem";
import { StatItem } from "./StatItem";

const meta: Meta<typeof List> = {
  title: "Elements/Data Display/Collections/List",
  component: List,
  tags: ["autodocs"],
  argTypes: {
    orientation: {
      control: { type: "select" },
      options: ["horizontal", "vertical", "adaptive"],
    },
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

const sampleItems = [
  <ListItem title="Bitcoin Balance" value="100.123456 BTC" suffix={<MdAccountBalanceWallet size={20} />} />,
  <ListItem title="USD Value" value="$4,567,890.12" suffix={<MdTrendingUp size={20} />} />,
  <ListItem title="Status" value="Active" suffix={<MdOutlineInfo size={20} />} />,
];

const longContentItems = [
  <ListItem title="Very Long Bitcoin Wallet Address" value="bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh" />,
  <ListItem title="Transaction Hash with Very Long Text" value="a1b2c3d4e5f6789012345678901234567890abcdef" />,
  <ListItem
    title="Network Fee Estimation Details"
    value="2.5 sats/vB (Medium Priority)"
    suffix={<MdOutlineInfo size={20} />}
  />,
];

// Regular Design Stories
export const HorizontalRegular: Story = {
  name: "Regular Design - Horizontal",
  args: {
    orientation: "horizontal",
    children: sampleItems,
  },
};

export const VerticalRegular: Story = {
  name: "Regular Design - Vertical",
  args: {
    orientation: "vertical",
    children: sampleItems,
  },
};

export const AdaptiveRegular: Story = {
  name: "Regular Design - Adaptive",
  args: {
    orientation: "adaptive",
    children: sampleItems,
  },
};

// Content Variation Stories
export const LongContentHorizontal: Story = {
  name: "Long Content - Horizontal",
  args: {
    orientation: "horizontal",
    children: longContentItems,
  },
};

export const LongContentVertical: Story = {
  name: "Long Content - Vertical",
  args: {
    orientation: "vertical",
    children: longContentItems,
  },
};

export const SingleItem: Story = {
  name: "Single Item",
  args: {
    orientation: "horizontal",
    children: [<ListItem title="Single Entry" value="Only one item in list" suffix={<MdOutlineInfo size={20} />} />],
  },
};

export const WithStatItems: Story = {
  name: "With StatItem examples",
  args: {
    orientation: "adaptive",
    children: [
      <StatItem title="Total BTC TVL" value="2,345 BTC" tooltip="Total value locked in BTC" />,
      <StatItem title="BTC Staking APR" value="3.2%" tooltip="Estimated APR" />,
      <StatItem title="Finality Providers" value="24 Active (30 Total)" />,
    ],
  },
};
