import { Notification } from "@babylonlabs-io/core-ui";

import { COPY } from "@/copy";
import { useVaultCountCap } from "@/hooks/useVaultCountCap";

const TEST_ID = "max-vaults-notification";

interface MaxVaultsNotificationProps {
  connectedAddress?: string;
}

/**
 * "Maximum vaults reached" advisory. Rendered independently of the
 * liquidation-cascade banner (and its price/loading gating) because the
 * per-position vault cap is a value-protection capacity fact that holds
 * regardless of BTC price, debt, or position size — and must still show when
 * the cascade can't compute (stale price) or the position has no active
 * collateral yet (all-pending). Always-on: not behind the
 * liquidation-notifications flag.
 */
export function MaxVaultsNotification({
  connectedAddress,
}: MaxVaultsNotificationProps) {
  const { isAtCap, maxVaults } = useVaultCountCap(connectedAddress);

  if (!isAtCap || maxVaults == null) return null;

  return (
    <Notification
      variant="warning"
      title={COPY.liquidationWarnings.maxVaults.title}
      data-testid={TEST_ID}
      data-severity="yellow"
    >
      {COPY.liquidationWarnings.maxVaults.detail(maxVaults)}
    </Notification>
  );
}
