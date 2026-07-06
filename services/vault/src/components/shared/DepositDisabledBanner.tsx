import { Text } from "@babylonlabs-io/core-ui";

import { COPY } from "@/copy";

interface DepositDisabledBannerProps {
  visible: boolean;
}

export function DepositDisabledBanner({ visible }: DepositDisabledBannerProps) {
  if (!visible) {
    return null;
  }

  return (
    <div className="flex flex-row items-center justify-center gap-2 bg-secondary-main px-4 py-3 text-center text-accent-contrast">
      <Text variant="body2">{COPY.deposit.disabled.bannerMessage}</Text>
    </div>
  );
}
