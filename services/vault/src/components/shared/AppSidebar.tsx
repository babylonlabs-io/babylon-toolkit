import {
  ActivityIcon,
  ExploreIcon,
  LiquidationsIcon,
  LoansIcon,
  OverviewIcon,
  Sidebar,
  SidebarBrandLockup,
  SidebarItem,
  SmallLogo,
  VaultsIcon,
} from "@babylonlabs-io/core-ui";
import type { ComponentType } from "react";
import { NavLink } from "react-router";

import { V3_NAV_GROUPS, type V3NavItemId } from "@/config/v3Navigation";

import { SidebarFooter } from "./SidebarFooter";

// Header's own brand mark (unchanged v2 lockup: SmallLogo + divider + Aave
// wordmark) — kept separate from `SidebarBrandLockup` (the exact Figma
// sidebar asset). Only rendered in v2; the v3 header shows the page title
// instead (see RootLayout's `logo` prop), since the sidebar already carries
// the brand.
export function BrandLockup() {
  return (
    <div className="flex items-center gap-3">
      <div className="[&_svg]:!h-8 [&_svg]:!w-auto [&_svg]:!text-secondary-main dark:[&_svg]:!text-accent-primary">
        <SmallLogo />
      </div>
      <div className="h-8 w-px bg-secondary-strokeLight" />
      <img
        src="/images/aave-wordmark.svg"
        alt="Aave"
        className="h-[18px] w-[109px]"
      />
    </div>
  );
}

// Icons are kept out of `config/v3Navigation.ts` (a plain data module) and
// mapped here by id, so the router and `usePageTitle` don't have to import
// core-ui's icon tree just to read a path/label pair.
const V3_NAV_ICONS: Record<
  V3NavItemId,
  ComponentType<{ size?: number; className?: string }>
> = {
  overview: OverviewIcon,
  vaults: VaultsIcon,
  loans: LoansIcon,
  activity: ActivityIcon,
  liquidations: LiquidationsIcon,
  explore: ExploreIcon,
};

function V3NavLinks() {
  return (
    <>
      {V3_NAV_GROUPS.map((group, i) => (
        <div key={i} className="flex w-full flex-col">
          {group.map(({ id, path, label }) => {
            const Icon = V3_NAV_ICONS[id];
            return (
              <NavLink key={path} to={path} end={path === "/"}>
                {({ isActive }) => (
                  <SidebarItem
                    icon={<Icon size={24} />}
                    label={label}
                    isActive={isActive}
                  />
                )}
              </NavLink>
            );
          })}
        </div>
      ))}
    </>
  );
}

export function AppSidebar() {
  return (
    <Sidebar
      brand={<SidebarBrandLockup className="text-black dark:text-white" />}
      footer={<SidebarFooter />}
    >
      <V3NavLinks />
    </Sidebar>
  );
}

export function V3MobileNavigation() {
  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex flex-col gap-6">
        <V3NavLinks />
      </div>
      <SidebarFooter />
    </div>
  );
}
