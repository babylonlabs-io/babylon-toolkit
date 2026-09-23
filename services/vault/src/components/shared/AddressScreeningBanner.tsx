import { Text } from "@babylonlabs-io/core-ui";
import { PiWarningOctagonFill } from "react-icons/pi";

import { LEGAL_LINK_URLS, TELEGRAM_URL } from "@/config/socialLinks";
import { COPY } from "@/copy";

const LINK_CLASS = "underline hover:opacity-80";

interface AddressScreeningBannerProps {
  visible: boolean;
  /** Shows the backend-error message instead of the ineligible message. */
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
              className={LINK_CLASS}
            >
              {copy.termsOfUse}
            </a>
            {copy.ineligibleMiddle}
            <a
              href={TELEGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={LINK_CLASS}
            >
              {copy.contactSupport}
            </a>
            {copy.ineligibleAfter}
          </Text>
        )}
      </div>
    </div>
  );
}
