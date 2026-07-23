/**
 * VaultsSummaryCard — the v3 /vaults summary strip (issue #2041).
 *
 * Three panes: total collateral value + Deposit, active-vault count with the
 * liquidation-order sequence + Reorder, and the health factor. Renders through
 * the shared `PositionStatCards` primitive so this strip stays identical to the
 * Overview and Loans summaries. Purely presentational — all values arrive
 * formatted from useVaultsPageData.
 */

import type { HealthFactorStatus } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

import {
  formatHealthFactor,
  getHealthFactorColor,
} from "@/applications/aave/utils";
import { HeartIcon } from "@/components/shared";
import {
  PositionStatCards,
  type PositionStatCard,
} from "@/components/simple/PositionStatCards";
import { COPY } from "@/copy";

interface VaultsSummaryCardProps {
  totalCollateralBtc: string;
  totalCollateralUsd: string;
  activeVaultsCount: number;
  liquidationOrder: string | null;
  healthFactor: number | null;
  healthFactorStatus: HealthFactorStatus;
  onDeposit: () => void;
  isDepositDisabled: boolean;
  onReorder: () => void;
  isReorderDisabled: boolean;
}

export function VaultsSummaryCard({
  totalCollateralBtc,
  totalCollateralUsd,
  activeVaultsCount,
  liquidationOrder,
  healthFactor,
  healthFactorStatus,
  onDeposit,
  isDepositDisabled,
  onReorder,
  isReorderDisabled,
}: VaultsSummaryCardProps) {
  const healthFactorColor = getHealthFactorColor(healthFactorStatus);
  const healthFactorText = formatHealthFactor(healthFactor);

  const cards: PositionStatCard[] = [
    {
      label: COPY.vaults.summary.totalCollateralLabel,
      tooltip: COPY.overview.totalCollateralValueTooltip,
      value: totalCollateralBtc,
      caption: totalCollateralUsd,
      actionLabel: COPY.vaults.empty.depositAction,
      onAction: onDeposit,
      actionDisabled: isDepositDisabled,
      // This control's data-testid is a real-wallet E2E hook
      // (e2e/real/actions/walletConnect.ts, e2e/real/actions/pegin.ts) — it
      // takes over from the empty state's Deposit button once vaults exist.
      // Carry it over if you move or rename the element.
      actionTestId: "deposit-button",
    },
    {
      label: COPY.vaults.summary.activeVaultsLabel,
      value: COPY.vaults.summary.vaultCount(activeVaultsCount),
      caption: liquidationOrder ?? undefined,
      actionLabel: COPY.vaults.actions.reorder,
      onAction: onReorder,
      actionDisabled: isReorderDisabled,
    },
    {
      label: COPY.vaults.summary.healthFactorLabel,
      tooltip: COPY.overview.healthFactorTooltip,
      value: healthFactorText,
      valueNode: (
        <span
          className="flex items-center gap-2"
          style={{ color: healthFactorColor }}
        >
          {healthFactorText}
          <HeartIcon color={healthFactorColor} className="size-6" />
        </span>
      ),
      caption: COPY.vaults.summary.healthFactorCaption,
    },
  ];

  return <PositionStatCards cards={cards} />;
}
