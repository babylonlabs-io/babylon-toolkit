import { Notification } from "@babylonlabs-io/core-ui";

import { COPY } from "@/copy";
import type { VaultCountCapResult } from "@/hooks/useVaultCountCap";

interface VaultCountCapBannerProps {
  cap: VaultCountCapResult;
}

export function VaultCountCapBanner({ cap }: VaultCountCapBannerProps) {
  if (!cap.isAtCap || cap.maxVaults === null) return null;

  return (
    <Notification
      variant="warning"
      title={COPY.vaultCountCap.bannerTitle}
      data-testid="vault-count-cap-banner"
    >
      {COPY.vaultCountCap.bannerDetail(cap.maxVaults)}
    </Notification>
  );
}
