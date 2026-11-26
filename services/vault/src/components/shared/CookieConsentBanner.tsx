import { Button, Text } from "@babylonlabs-io/core-ui";
import { twJoin } from "tailwind-merge";

import { ENV } from "@/config/env";
import { LEGAL_LINK_URLS } from "@/config/socialLinks";
import { COPY } from "@/copy";
import { useCookieConsent } from "@/hooks/useCookieConsent";
import { setCookieConsent } from "@/storage/cookieConsentStorage";

// On a phone the three buttons do not fit one row, so they stack full width.
const BUTTON_CLASS = "w-full rounded-lg px-6 tracking-[0.17px] sm:w-auto";

// Matches the Figma "Deny All" button (node 14623:16559). core-ui's outlined
// hover brightens the whole button, which washes the thin border out; the
// border changes colour instead, as on the suggested-deposit cards.
const OUTLINED_BUTTON_CLASS = `${BUTTON_CLASS} min-w-[112px] !border-secondary-strokeLight hover:!border-accent-primary hover:!brightness-100`;

// Figma (frame 14626:344) lays the card over the entry screen, in the space
// between the feature cards and the footer. That space exists only on a wide,
// tall window: the entry content is about 420px tall. Elsewhere the card keeps
// its own row, so it never covers content once the page is scrolled to the end.
const ENTRY_OVERLAY_CLASS = "xl:[@media(min-height:800px)]:h-0";

interface CookieConsentBannerProps {
  /** The page's content box, so the card lines up with the content's right edge. */
  contentClassName: string;
  /** Entry screen: lay the card over the page where the window has room. */
  isEntryLayout: boolean;
}

/**
 * Asks for cookie consent until the visitor answers (Figma node 14623:16554).
 * Shown only when analytics is configured: without it the app sets no cookie
 * that needs consent.
 *
 * Mount it in the content column directly above the footer, after the spacer
 * that takes the column's free space. The row sticks to the bottom of the
 * window, so on a long page the card floats until the visitor reaches the end,
 * then rests 24px above the footer. With zero height (`justify-end`) the card
 * overflows upwards over the page instead. It sits under dialogs (`z-30`, as
 * the deposit-disabled banner) so it never covers a wallet prompt.
 */
export function CookieConsentBanner({
  contentClassName,
  isEntryLayout,
}: CookieConsentBannerProps) {
  const consent = useCookieConsent();
  if (!ENV.ANALYTICS.enabled || consent !== null) return null;

  return (
    <div
      className={twJoin(
        "pointer-events-none sticky bottom-0 z-30 flex flex-col justify-end",
        isEntryLayout && ENTRY_OVERLAY_CLASS,
      )}
    >
      {/* A block row between the flex column and the content box, which
          would otherwise shrink to the card and center it. */}
      <div>
        <div className={contentClassName}>
          <section
            aria-label={COPY.cookieConsent.regionLabel}
            className="pointer-events-auto mb-4 ml-auto flex animate-reveal-in flex-col gap-4 rounded-lg border border-secondary-strokeLight bg-background-contrast p-4 md:mb-6 md:w-[420px]"
          >
            <Text variant="body2" className="text-accent-secondary">
              {COPY.cookieConsent.body}{" "}
              <a
                href={LEGAL_LINK_URLS.privacyPolicy}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-primary underline"
              >
                {COPY.cookieConsent.learnMore}
              </a>
            </Text>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="contained"
                color="secondary"
                size="medium"
                className={BUTTON_CLASS}
                onClick={() => setCookieConsent("all")}
              >
                {COPY.cookieConsent.acceptAll}
              </Button>
              <Button
                variant="outlined"
                size="medium"
                className={OUTLINED_BUTTON_CLASS}
                onClick={() => setCookieConsent("essential")}
              >
                {COPY.cookieConsent.essentialOnly}
              </Button>
              <Button
                variant="outlined"
                size="medium"
                className={OUTLINED_BUTTON_CLASS}
                onClick={() => setCookieConsent("denied")}
              >
                {COPY.cookieConsent.deny}
              </Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
