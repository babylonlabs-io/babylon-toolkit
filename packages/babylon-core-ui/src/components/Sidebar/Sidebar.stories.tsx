import type { Meta, StoryObj } from "@storybook/react";

import { Sidebar } from "./Sidebar";
import { SidebarBrandLockup } from "./SidebarBrandLockup";
import { SidebarItem } from "./SidebarItem";
import {
  ActivityIcon,
  DiscordIcon,
  ExploreIcon,
  GithubIcon,
  LinkedinIcon,
  LiquidationsIcon,
  LoansIcon,
  OverviewIcon,
  SidebarMailIcon,
  TelegramIcon,
  VaultsIcon,
  XIcon,
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

const exampleFooter = (
  <div className="flex w-full flex-col gap-2">
    <div className="flex w-full items-center gap-2">
      <GithubIcon size={16} />
      <TelegramIcon size={16} />
      <LinkedinIcon size={16} />
      <SidebarMailIcon size={16} />
      <DiscordIcon size={16} />
      <XIcon size={16} />
    </div>
    <p className="w-full text-sm tracking-[0.17px] text-accent-secondary">
      Terms of Use - Privacy Policy
    </p>
  </div>
);

export const Default: Story = {
  args: {
    brand: <SidebarBrandLockup />,
    footer: exampleFooter,
    children: (
      <>
        <div className="flex w-full flex-col">
          <SidebarItem icon={<OverviewIcon />} label="Overview" isActive />
          <SidebarItem icon={<VaultsIcon />} label="Vaults" />
          <SidebarItem icon={<LoansIcon />} label="Loans" />
          <SidebarItem icon={<ActivityIcon />} label="Activity" />
        </div>
        <div className="flex w-full flex-col">
          <SidebarItem icon={<LiquidationsIcon />} label="Liquidations" />
          <SidebarItem icon={<ExploreIcon />} label="Explore" />
        </div>
      </>
    ),
  },
};
