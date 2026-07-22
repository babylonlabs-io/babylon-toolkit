import { Notification } from "@babylonlabs-io/core-ui";

import { NotificationCard } from "@/components/shared/NotificationCard";
import featureFlags from "@/config/featureFlags";
import { COPY } from "@/copy";
import { useDebugMaxVaultsOverride } from "@/dev/debugPositionStore";
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
  // Dev-only god-mode override (compile-time null in production, see
  // debugPositionStore). It carries the cap NUMBER, not a boolean: the live
  // `maxVaults` read is null while disconnected and the copy interpolates it.
  const capOverride = useDebugMaxVaultsOverride();

  const cap = capOverride ?? maxVaults;
  const atCap = capOverride !== null || isAtCap;

  if (!atCap || cap == null) return null;

  // Figma v3 §9: warning-main bar + solid chip, InfoIcon, no actions, no close.
  if (featureFlags.isV3UiEnabled) {
    return (
      <NotificationCard
        tone="too-many"
        title={COPY.liquidationWarnings.maxVaults.titleV3}
        data-testid={TEST_ID}
        data-severity="yellow"
      >
        {COPY.liquidationWarnings.maxVaults.detail(cap)}
      </NotificationCard>
    );
  }

  return (
    <Notification
      variant="warning"
      title={COPY.liquidationWarnings.maxVaults.title}
      data-testid={TEST_ID}
      data-severity="yellow"
    >
      {COPY.liquidationWarnings.maxVaults.detail(cap)}
    </Notification>
  );
}
