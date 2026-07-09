import {
  ActivityIcon,
  DiscordIcon,
  ExploreIcon,
  GithubIcon,
  LinkedinIcon,
  LiquidationsIcon,
  LoansIcon,
  OverviewIcon,
  Sidebar,
  SidebarBrandLockup,
  SidebarItem,
  SidebarMailIcon,
  SmallLogo,
  TelegramIcon,
  VaultsIcon,
  XIcon,
} from "@babylonlabs-io/core-ui";
import type { ComponentType } from "react";
import { NavLink } from "react-router";

import { COPY } from "@/copy";

// Header's own brand mark (unchanged v2 lockup: SmallLogo + divider + Aave
// wordmark) — kept separate from `SidebarBrandLockup` (the exact Figma
// sidebar asset). Header still renders this in both v2 and v3 until the
// page-title header rebuild (#2016) removes it.
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

interface V3NavItem {
  to: string;
  label: string;
  Icon: ComponentType<{ size?: number; className?: string }>;
}

// Matches Figma's two nav groups (a 40px gap separates them; items within a
// group are flush against each other).
const V3_NAV_GROUPS: V3NavItem[][] = [
  [
    { to: "/", label: COPY.nav.overview, Icon: OverviewIcon },
    { to: "/vaults", label: COPY.nav.vaults, Icon: VaultsIcon },
    { to: "/loans", label: COPY.nav.loans, Icon: LoansIcon },
    { to: "/activity", label: COPY.nav.activity, Icon: ActivityIcon },
  ],
  [
    {
      to: "/liquidations",
      label: COPY.nav.liquidations,
      Icon: LiquidationsIcon,
    },
    { to: "/explore", label: COPY.nav.explore, Icon: ExploreIcon },
  ],
];

function V3NavLinks() {
  return (
    <>
      {V3_NAV_GROUPS.map((group, i) => (
        <div key={i} className="flex w-full flex-col">
          {group.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} end={to === "/"}>
              {({ isActive }) => (
                <SidebarItem
                  icon={<Icon size={24} />}
                  label={label}
                  isActive={isActive}
                />
              )}
            </NavLink>
          ))}
        </div>
      ))}
    </>
  );
}

interface SidebarSocialLink {
  name: string;
  url: string;
  Icon: ComponentType<{ size?: number; className?: string; title?: string }>;
}

// Matches Figma's Social Links block exactly (icon order + Terms/Privacy
// text). URLs are the same handles already used by the page footer, plus a
// verified Telegram handle (t.me/babylonlabs_io) that block didn't carry.
const SIDEBAR_SOCIAL_LINKS: SidebarSocialLink[] = [
  {
    name: "GitHub",
    url: "https://github.com/babylonlabs-io",
    Icon: GithubIcon,
  },
  { name: "Telegram", url: "https://t.me/babylonlabs_io", Icon: TelegramIcon },
  {
    name: "LinkedIn",
    url: "https://www.linkedin.com/company/babylon-labs-official",
    Icon: LinkedinIcon,
  },
  {
    name: "Email",
    url: "mailto:contact@babylonlabs.io",
    Icon: SidebarMailIcon,
  },
  {
    name: "Discord",
    url: "https://discord.gg/babylonglobal",
    Icon: DiscordIcon,
  },
  { name: "X", url: "https://x.com/babylonlabs_io", Icon: XIcon },
];

function SidebarFooter() {
  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex w-full items-center gap-2">
        {SIDEBAR_SOCIAL_LINKS.map(({ name, url, Icon }) => (
          <a
            key={name}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-secondary transition-colors hover:text-accent-primary"
          >
            <Icon size={16} title={name} />
          </a>
        ))}
      </div>
      <p className="w-full text-sm tracking-[0.17px] text-accent-secondary">
        <a
          href="https://babylonlabs.io/terms-of-use"
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors hover:text-accent-primary"
        >
          {COPY.nav.termsOfUse}
        </a>
        {" - "}
        <a
          href="https://babylonlabs.io/privacy-policy"
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors hover:text-accent-primary"
        >
          {COPY.nav.privacyPolicy}
        </a>
      </p>
    </div>
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
