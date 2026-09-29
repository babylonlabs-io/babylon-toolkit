import { LEGAL_LINK_URLS, SOCIAL_LINKS } from "@/config/socialLinks";
import { COPY } from "@/copy";

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
        {SOCIAL_LINKS.map(({ name, url, Icon }) => (
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
