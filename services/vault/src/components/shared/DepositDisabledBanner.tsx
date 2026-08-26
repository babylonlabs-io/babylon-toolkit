import { Banner, Text } from "@babylonlabs-io/core-ui";

import featureFlags from "@/config/featureFlags";
import { COPY } from "@/copy";

interface DepositDisabledBannerProps {
  visible: boolean;
}

export function DepositDisabledBanner({ visible }: DepositDisabledBannerProps) {
  if (!visible) {
    return null;
  }

  // Operators can replace the default text per incident (e.g. an ETA) via
  // NEXT_PUBLIC_NOTICE_BANNER_MESSAGE, mirroring ProtocolStatusBanner.
  const message =
    featureFlags.noticeBannerMessage ?? COPY.deposit.disabled.bannerMessage;

  return (
    <Banner variant="notice">
      <Text variant="body2">{message}</Text>
    </Banner>
  );
}
