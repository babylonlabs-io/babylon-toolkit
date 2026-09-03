import {
  DiscordIcon,
  LinkedinIcon,
  LogoMark,
  MailIcon,
  TelegramIcon,
  XIcon,
} from "@babylonlabs-io/core-ui";
import type { ComponentType } from "react";

import { ENTRY_CONTENT_CLASS } from "@/components/shared/layoutClasses";
import { LEGAL_LINK_URLS, SOCIAL_LINK_URLS } from "@/config/socialLinks";
import { COPY } from "@/copy";

interface EntryFooterSocialLink {
  name: string;
  url: string;
  Icon: ComponentType<{ size?: number; className?: string; title?: string }>;
}

// The entry frame's own set. URLs are shared with every other surface via
// `config/socialLinks`.
const ENTRY_SOCIAL_LINKS: EntryFooterSocialLink[] = [
  { name: "Telegram", url: SOCIAL_LINK_URLS.telegram, Icon: TelegramIcon },
  { name: "LinkedIn", url: SOCIAL_LINK_URLS.linkedin, Icon: LinkedinIcon },
  { name: "Email", url: SOCIAL_LINK_URLS.email, Icon: MailIcon },
  { name: "Discord", url: SOCIAL_LINK_URLS.discord, Icon: DiscordIcon },
  { name: "X", url: SOCIAL_LINK_URLS.x, Icon: XIcon },
];

const LINK_CLASS = "transition-colors hover:text-secondary-main";

/**
 * Page footer for the v3 entry screen. v3 normally relies on the sidebar's own
 * bottom block for these links, but the entry screen hides the sidebar, so
 * without this the social and legal links are unreachable there. Its divider is
 * full-bleed while the content sits in the same box as the navbar and body.
 */
export function EntryFooter() {
  return (
    <footer className="mt-auto border-t border-secondary-strokeLight py-8">
      <div
        className={`${ENTRY_CONTENT_CLASS} flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between sm:gap-4`}
      >
        <div className="flex flex-col items-start gap-3">
          <LogoMark className="h-6 w-auto text-secondary-main dark:text-accent-primary" />
          <p className="text-sm tracking-[0.17px] text-accent-secondary">
            {COPY.footer.copyright(new Date().getFullYear())}
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:items-end">
          <div className="flex items-center gap-4">
            {ENTRY_SOCIAL_LINKS.map(({ name, url, Icon }) => (
              <a
                key={name}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className={`text-accent-primary ${LINK_CLASS}`}
              >
                <Icon size={24} title={name} />
              </a>
            ))}
          </div>
          <p className="text-sm tracking-[0.17px] text-accent-secondary">
            <a
              href={LEGAL_LINK_URLS.termsOfUse}
              target="_blank"
              rel="noopener noreferrer"
              className={LINK_CLASS}
            >
              {COPY.nav.termsOfUse}
            </a>
            {COPY.footer.legalSeparator}
            <a
              href={LEGAL_LINK_URLS.privacyPolicy}
              target="_blank"
              rel="noopener noreferrer"
              className={LINK_CLASS}
            >
              {COPY.nav.privacyPolicy}
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
