import { Text } from "@babylonlabs-io/core-ui";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import type { Address, Hex } from "viem";
import { useAccount } from "wagmi";

import {
  usePositionNotifications,
  type PositionNotificationsStatus,
} from "@/applications/aave/hooks/usePositionNotifications";
import { useReorderVaults } from "@/applications/aave/hooks/useReorderVaults";
import {
  deriveBannerState,
  type CalculatorResult,
} from "@/applications/aave/positionNotifications";
import { invalidateVaultQueries } from "@/utils/queryKeys";

import { ReorderSuccessModal } from "../ReorderVaults";

import { BannerActions } from "./BannerActions";
import {
  GREEN_BANNER_DETAIL,
  GREEN_BANNER_TITLE,
  SEVERITY_STYLES,
  STALE_PRICE_BANNER_DETAIL,
  STALE_PRICE_BANNER_TITLE,
} from "./constants";

interface PositionNotificationBannerProps {
  connectedAddress?: string;
  onDeposit: (initialAmountBtc?: string) => void;
  onRepay: () => void;
  /** Override result for debug panel — skips hook when provided */
  result?: CalculatorResult | null;
  /** Override status for debug panel — used to simulate stale-price state */
  statusOverride?: PositionNotificationsStatus;
  /** BTC wallet balance in BTC units — used to disable deposit buttons when insufficient */
  btcBalanceBtc?: number;
}

export function PositionNotificationBanner({
  connectedAddress,
  onDeposit,
  onRepay,
  result: resultOverride,
  statusOverride,
  btcBalanceBtc,
}: PositionNotificationBannerProps) {
  const {
    result: hookResult,
    status,
    isLoading,
  } = usePositionNotifications(connectedAddress);

  const hasOverride = resultOverride !== undefined;
  const result = hasOverride ? resultOverride : hookResult;

  const { executeReorder, isProcessing: isReordering } = useReorderVaults();
  const [isReorderSuccess, setIsReorderSuccess] = useState(false);
  const queryClient = useQueryClient();
  const { address } = useAccount();

  const handleReorderSuccessClose = useCallback(() => {
    setIsReorderSuccess(false);
    if (address) {
      queryClient.invalidateQueries({
        queryKey: ["vaultOrder", address.toLowerCase()],
      });
      invalidateVaultQueries(queryClient, address as Address);
    }
  }, [address, queryClient]);

  const handleApplyOrder = useCallback(async () => {
    if (!result?.suggestedVaultOrder) return;
    const vaultIds = result.suggestedVaultOrder.map((v) => v.id as Hex);
    const success = await executeReorder(vaultIds);
    if (success) {
      setIsReorderSuccess(true);
    }
  }, [result, executeReorder]);

  const effectiveStatus = statusOverride ?? status;

  // Stale-price: show yellow warning regardless of result
  if (effectiveStatus === "stale-price") {
    return (
      <div
        className={`rounded-lg p-4 ${SEVERITY_STYLES.yellow}`}
        role="status"
        data-testid="position-notification-banner"
        data-severity="yellow"
      >
        <Text variant="body2" className="text-sm font-semibold">
          {STALE_PRICE_BANNER_TITLE}
        </Text>
        <Text variant="body2" className="mt-1 text-sm opacity-80">
          {STALE_PRICE_BANNER_DETAIL}
        </Text>
      </div>
    );
  }

  // When no override, respect loading states
  if (!hasOverride) {
    if (status !== "ready" || isLoading || !result) return null;
  }

  // With override, just check if result exists
  if (!result) return null;

  const bannerState = deriveBannerState(result);

  if (bannerState.severity === "hidden") return null;

  const isGreen = bannerState.severity === "green";

  return (
    <>
      <div
        className={`rounded-lg p-4 ${SEVERITY_STYLES[bannerState.severity]}`}
        role="status"
        data-testid="position-notification-banner"
        data-severity={bannerState.severity}
      >
        {/* Primary warning */}
        {isGreen ? (
          <div>
            <Text variant="body2" className="text-sm font-semibold">
              {GREEN_BANNER_TITLE}
            </Text>
            <Text variant="body2" className="mt-1 text-sm opacity-80">
              {GREEN_BANNER_DETAIL}
            </Text>
          </div>
        ) : (
          bannerState.primaryWarning && (
            <div>
              <Text variant="body2" className="text-sm font-semibold">
                {bannerState.primaryWarning.title}
              </Text>
              <Text variant="body2" className="mt-1 text-sm">
                {bannerState.primaryWarning.detail}
              </Text>
              {bannerState.primaryWarning.suggestion && (
                <Text variant="body2" className="mt-1 text-sm opacity-80">
                  {bannerState.primaryWarning.suggestion}
                </Text>
              )}
            </div>
          )
        )}

        {/* Secondary warnings */}
        {bannerState.secondaryWarnings.length > 0 && (
          <div className="border-current/20 mt-3 space-y-2 border-t pt-3">
            {bannerState.secondaryWarnings.map((w, i) => (
              <div key={i}>
                <Text variant="body2" className="text-sm font-semibold">
                  {w.title}
                </Text>
                {w.detail && (
                  <Text variant="body2" className="mt-1 text-sm">
                    {w.detail}
                  </Text>
                )}
                {w.suggestion && (
                  <Text variant="body2" className="mt-1 text-sm opacity-80">
                    {w.suggestion}
                  </Text>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Action buttons */}
        {!isGreen && (
          <BannerActions
            result={result}
            bannerState={bannerState}
            onDeposit={onDeposit}
            onRepay={onRepay}
            onApplyOrder={handleApplyOrder}
            isReordering={isReordering}
            btcBalanceBtc={btcBalanceBtc}
          />
        )}
      </div>

      <ReorderSuccessModal
        isOpen={isReorderSuccess}
        onClose={handleReorderSuccessClose}
      />
    </>
  );
}
