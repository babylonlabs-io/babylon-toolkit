import { twJoin } from "tailwind-merge";

import { LEGAL_LINK_URLS, SOCIAL_LINKS } from "@/config/socialLinks";
import { COPY } from "@/copy";

const VARIANT_STYLES = {
  sidebar: { iconSize: 16, gapClass: "gap-2" },
  menu: { iconSize: 24, gapClass: "gap-4" },
} as const;

interface SidebarFooterProps {
  /** `menu`: the phone main menu's 24px icons and 16px gaps (Figma 12031:120901). */
  variant?: keyof typeof VARIANT_STYLES;
}

/**
 * Social links + Terms of Use / Privacy Policy block from the Figma Sidebar
 * component. Used by the desktop sidebar's own footer, the v3 mobile
 * hamburger menu (`V3MobileNavigation`), and — unlike those two — always
 * visible outside the menu on mobile v3, since the page has no other path to
 * these links there (see `RootLayout`).
 */
export function SidebarFooter({ variant = "sidebar" }: SidebarFooterProps) {
  const { iconSize, gapClass } = VARIANT_STYLES[variant];

  return (
    <div className={twJoin("flex w-full flex-col", gapClass)}>
      <div className={twJoin("flex w-full items-center", gapClass)}>
        {SOCIAL_LINKS.map(({ name, url, Icon }) => (
          <a
            key={name}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-secondary transition-colors hover:text-accent-primary"
          >
            <Icon size={iconSize} title={name} />
          </a>
        ))}
      </div>
      <p className="w-full text-sm tracking-[0.17px] text-accent-secondary">
        <a
          href={LEGAL_LINK_URLS.termsOfUse}
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors hover:text-accent-primary"
        >
          {COPY.nav.termsOfUse}
        </a>
        {COPY.footer.legalSeparator}
        <a
          href={LEGAL_LINK_URLS.privacyPolicy}
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
