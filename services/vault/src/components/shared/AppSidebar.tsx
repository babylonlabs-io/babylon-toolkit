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

import featureFlags from "@/config/featureFlags";
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

// Both sections of the second nav group belong to the liquidation-analysis
// feature and have no page yet (/liquidations is an empty placeholder,
// /explore has no route at all), so they hide with the same flag that gates
// the analysis chart rather than advertising dead ends.
const LIQUIDATION_ANALYSIS_NAV_IDS = new Set<V3NavItemId>([
  "liquidations",
  "explore",
]);

function V3NavLinks() {
  const groups = featureFlags.isLiquidationAnalysisChartEnabled
    ? V3_NAV_GROUPS
    : V3_NAV_GROUPS.map((group) =>
        group.filter((item) => !LIQUIDATION_ANALYSIS_NAV_IDS.has(item.id)),
      ).filter((group) => group.length > 0);

  return (
    <>
      {groups.map((group, i) => (
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
      className="top-[var(--tbv-top-banner-height,0px)] h-[calc(100svh_-_var(--tbv-top-banner-height,0px))]"
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
