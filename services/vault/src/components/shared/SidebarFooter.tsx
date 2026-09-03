import {
  DiscordIcon,
  LinkedinIcon,
  MailIcon,
  TelegramIcon,
  XIcon,
} from "@babylonlabs-io/core-ui";
import type { ComponentType } from "react";

import { LEGAL_LINK_URLS, SOCIAL_LINK_URLS } from "@/config/socialLinks";
import { COPY } from "@/copy";

interface SidebarSocialLink {
  name: string;
  url: string;
  Icon: ComponentType<{ size?: number; className?: string; title?: string }>;
}

// Figma's Social Links block (icon order + Terms/Privacy text), minus the
// GitHub link. Name+URL pairs are shared with the entry footer
// (`config/socialLinks`) so a handle change can't drift between the two; only
// the per-surface presentation (icon size, hover color) differs.
const SIDEBAR_SOCIAL_LINKS: SidebarSocialLink[] = [
  { name: "Telegram", url: SOCIAL_LINK_URLS.telegram, Icon: TelegramIcon },
  { name: "LinkedIn", url: SOCIAL_LINK_URLS.linkedin, Icon: LinkedinIcon },
  { name: "Email", url: SOCIAL_LINK_URLS.email, Icon: MailIcon },
  { name: "Discord", url: SOCIAL_LINK_URLS.discord, Icon: DiscordIcon },
  { name: "X", url: SOCIAL_LINK_URLS.x, Icon: XIcon },
];

/**
 * Social links + Terms of Use / Privacy Policy block from the Figma Sidebar
 * component. Used by the desktop sidebar's own footer, the v3 mobile
 * hamburger menu (`V3MobileNavigation`), and — unlike those two — always
 * visible outside the menu on mobile v3, since the page has no other path to
 * these links there (see `RootLayout`).
 */
export function SidebarFooter() {
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
