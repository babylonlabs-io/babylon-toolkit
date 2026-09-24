import { Text } from "@babylonlabs-io/core-ui";
import { PiWarningOctagonFill } from "react-icons/pi";

import { LEGAL_LINK_URLS } from "@/config/socialLinks";
import { COPY } from "@/copy";

interface AddressScreeningBannerProps {
  visible: boolean;
  /** Shows the screening-unavailable message instead of the ineligible message. */
  isUnavailable: boolean;
}

export function AddressScreeningBanner({
  visible,
  isUnavailable,
}: AddressScreeningBannerProps) {
  if (!visible) {
    return null;
  }

  const copy = COPY.wallet.addressScreeningBanner;

  return (
    <div className="flex flex-row items-center justify-between gap-2 bg-red-100 px-4 py-3 text-red-800 dark:bg-red-900/30 dark:text-red-300">
      <div className="flex flex-row items-center gap-2">
        <PiWarningOctagonFill className="flex-shrink-0" />
        {isUnavailable ? (
          <Text variant="body1">
            <strong>{copy.unavailableTitle}</strong>
            <br />
            {copy.unavailableBody}
          </Text>
        ) : (
          <Text variant="body1">
            <strong>{COPY.wallet.walletNotEligibleTooltip}</strong>
            <br />
            {copy.ineligibleBefore}
            <a
              href={LEGAL_LINK_URLS.termsOfUse}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:opacity-80"
            >
              {COPY.nav.termsOfUse}
            </a>
            {copy.ineligibleAfter}
          </Text>
        )}
      </div>
    </div>
  );
}
