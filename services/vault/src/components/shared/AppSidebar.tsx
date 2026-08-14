import {
  ActivityIcon,
  ExploreIcon,
  LiquidationsIcon,
  LoansIcon,
  OverviewIcon,
  Sidebar,
  SidebarBrandLockup,
  SidebarItem,
  VaultsIcon,
} from "@babylonlabs-io/core-ui";
import type { ComponentType } from "react";
import { NavLink } from "react-router";

import { getVisibleV3NavGroups, type V3NavItemId } from "@/config/v3Navigation";

import { SidebarFooter } from "./SidebarFooter";

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
  // Which sections a flag currently hides is decided by `V3_SECTION_FLAG_GATES`
  // in config/v3Navigation.ts, shared with the router's guards so a hidden
  // section is never advertised as a dead end. The sidebar itself only renders
  // under v3 — see RootLayout.
  const groups = getVisibleV3NavGroups();

  return (
    <>
      {groups.map((group, i) => (
        <div key={i} className="flex w-full flex-col">
          {group.map(({ id, path, label }) => {
            const Icon = V3_NAV_ICONS[id];
            return (
              // These links' data-testids are real-wallet E2E hooks
              // (e2e/real/actions/navigation.ts) — the harness changes section
              // through them, so carry them over if you move or rename the nav.
              <NavLink
                key={path}
                to={path}
                end={path === "/"}
                data-testid={`nav-${id}`}
              >
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
