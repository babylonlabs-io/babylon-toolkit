import {
  ActivityIcon,
  ExploreIcon,
  LiquidationsIcon,
  LoansIcon,
  OverviewIcon,
  Sidebar,
  SidebarItem,
  SmallLogo,
  VaultsIcon,
} from "@babylonlabs-io/core-ui";
import type { ComponentType } from "react";
import { NavLink } from "react-router";

import { COPY } from "@/copy";

interface V3NavItem {
  to: string;
  label: string;
  Icon: ComponentType<{ size?: number; className?: string }>;
}

const V3_NAV_ITEMS: V3NavItem[] = [
  { to: "/", label: COPY.nav.overview, Icon: OverviewIcon },
  { to: "/vaults", label: COPY.nav.vaults, Icon: VaultsIcon },
  { to: "/loans", label: COPY.nav.loans, Icon: LoansIcon },
  { to: "/activity", label: COPY.nav.activity, Icon: ActivityIcon },
  {
    to: "/liquidations",
    label: COPY.nav.liquidations,
    Icon: LiquidationsIcon,
  },
  { to: "/explore", label: COPY.nav.explore, Icon: ExploreIcon },
];

function V3NavLinks() {
  return (
    <>
      {V3_NAV_ITEMS.map(({ to, label, Icon }) => (
        <NavLink key={to} to={to} end={to === "/"}>
          {({ isActive }) => (
            <SidebarItem
              icon={<Icon size={20} />}
              label={label}
              isActive={isActive}
            />
          )}
        </NavLink>
      ))}
    </>
  );
}

// Same brand lockup previously inlined as the (v2) Header's `logo` slot;
// extracted here so both the Header and the v3 Sidebar render it identically.
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

export function AppSidebar() {
  return (
    <Sidebar brand={<BrandLockup />}>
      <V3NavLinks />
    </Sidebar>
  );
}

export function V3MobileNavigation() {
  return (
    <div className="flex flex-col gap-1 p-4">
      <V3NavLinks />
    </div>
  );
}
