import type { Meta, StoryObj } from "@storybook/react";

import { Sidebar } from "./Sidebar";
import { SidebarItem } from "./SidebarItem";
import {
  ActivityIcon,
  ExploreIcon,
  LiquidationsIcon,
  LoansIcon,
  OverviewIcon,
  VaultsIcon,
} from "../Icons";

const meta: Meta<typeof Sidebar> = {
  title: "Components/Sidebar",
  component: Sidebar,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Sidebar>;

const exampleBrand = (
  <div className="text-sm font-semibold text-accent-primary">
    Babylon Vault
  </div>
);

export const Default: Story = {
  args: {
    brand: exampleBrand,
    children: (
      <>
        <SidebarItem icon={<OverviewIcon />} label="Overview" isActive />
        <SidebarItem icon={<VaultsIcon />} label="Vaults" />
        <SidebarItem icon={<LoansIcon />} label="Loans" />
        <SidebarItem icon={<ActivityIcon />} label="Activity" />
        <SidebarItem icon={<LiquidationsIcon />} label="Liquidations" />
        <SidebarItem icon={<ExploreIcon />} label="Explore" />
      </>
    ),
  },
};
