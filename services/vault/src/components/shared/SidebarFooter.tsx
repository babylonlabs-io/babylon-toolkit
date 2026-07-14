import {
  DiscordIcon,
  GithubIcon,
  LinkedinIcon,
  MailIcon,
  TelegramIcon,
  XIcon,
} from "@babylonlabs-io/core-ui";
import type { ComponentType } from "react";

import { SOCIAL_LINK_URLS } from "@/config/socialLinks";
import { COPY } from "@/copy";

interface SidebarSocialLink {
  name: string;
  url: string;
  Icon: ComponentType<{ size?: number; className?: string; title?: string }>;
}

// Matches Figma's Social Links block exactly (icon order + Terms/Privacy
// text). Name+URL pairs are shared with the page footer (`config/socialLinks`)
// so a handle change can't drift between the two; only the icons differ
// (Figma-exact here vs react-icons in the v2 footer).
const SIDEBAR_SOCIAL_LINKS: SidebarSocialLink[] = [
  { name: "GitHub", url: SOCIAL_LINK_URLS.github, Icon: GithubIcon },
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
