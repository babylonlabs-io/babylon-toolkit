import { Banner, Text } from "@babylonlabs-io/core-ui";

import { COPY } from "@/copy";

interface DepositDisabledBannerProps {
  visible: boolean;
}

export function DepositDisabledBanner({ visible }: DepositDisabledBannerProps) {
  if (!visible) {
    return null;
  }

  return (
    <Banner variant="notice">
      <Text variant="body2">{COPY.deposit.disabled.bannerMessage}</Text>
    </Banner>
  );
}
