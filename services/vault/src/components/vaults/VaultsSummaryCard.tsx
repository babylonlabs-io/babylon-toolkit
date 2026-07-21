/**
 * VaultsSummaryCard — the v3 /vaults summary strip (issue #2041).
 *
 * Three panes: total collateral value + Deposit, active-vault count with the
 * liquidation-order sequence + Reorder, and the health factor. Purely
 * presentational — all values arrive formatted from useVaultsPageData.
 */

import { Hint, InfoIcon } from "@babylonlabs-io/core-ui";
import type { HealthFactorStatus } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import type { ReactNode } from "react";

import {
  formatHealthFactor,
  getHealthFactorColor,
} from "@/applications/aave/utils";
import { HeartIcon } from "@/components/shared";
import { COPY } from "@/copy";

import { NEUTRAL_BUTTON_CLASS } from "./buttonClasses";

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

function StatLabel({ label, tooltip }: { label: string; tooltip?: string }) {
  return (
    <span className="flex items-center gap-1 whitespace-nowrap text-sm leading-[1.43] tracking-[0.17px] text-accent-secondary">
      {tooltip ? (
        <Hint
          tooltip={tooltip}
          icon={<InfoIcon size={16} className="text-accent-secondary" />}
        >
          {label}
        </Hint>
      ) : (
        label
      )}
    </span>
  );
}

function StatPane({
  label,
  tooltip,
  value,
  caption,
  action,
}: {
  label: string;
  tooltip?: string;
  value: ReactNode;
  caption: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center justify-between gap-4">
      <div className="flex h-[88px] min-w-0 flex-col justify-between">
        <StatLabel label={label} tooltip={tooltip} />
        <span className="text-xl leading-8 tracking-[0.15px] text-accent-primary">
          {value}
        </span>
        <span className="truncate text-sm leading-[1.43] tracking-[0.17px] text-accent-secondary">
          {caption}
        </span>
      </div>
      {action}
    </div>
  );
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

  return (
    <section className="flex w-full items-stretch gap-6 rounded-lg border border-secondary-strokeLight bg-secondary-highlight p-6 dark:bg-[#202020]">
      <StatPane
        label={COPY.vaults.summary.totalCollateralLabel}
        tooltip={COPY.overview.totalCollateralValueTooltip}
        value={totalCollateralBtc}
        caption={totalCollateralUsd}
        action={
          <button
            type="button"
            onClick={onDeposit}
            disabled={isDepositDisabled}
            className={NEUTRAL_BUTTON_CLASS}
            // This control's data-testid is a real-wallet E2E hook
            // (e2e/real/actions/walletConnect.ts, e2e/real/actions/pegin.ts)
            // — it takes over from the empty state's Deposit button once
            // vaults exist. Carry it over if you move or rename the element.
            data-testid="deposit-button"
          >
            {COPY.vaults.empty.depositAction}
          </button>
        }
      />

      <div className="w-px self-stretch bg-secondary-strokeLight" />

      <StatPane
        label={COPY.vaults.summary.activeVaultsLabel}
        value={COPY.vaults.summary.vaultCount(activeVaultsCount)}
        caption={liquidationOrder ?? ""}
        action={
          <button
            type="button"
            onClick={onReorder}
            disabled={isReorderDisabled}
            className={NEUTRAL_BUTTON_CLASS}
          >
            {COPY.vaults.actions.reorder}
          </button>
        }
      />

      <div className="w-px self-stretch bg-secondary-strokeLight" />

      <div className="flex h-[88px] w-[324px] shrink-0 flex-col justify-between">
        <StatLabel
          label={COPY.vaults.summary.healthFactorLabel}
          tooltip={COPY.overview.healthFactorTooltip}
        />
        <span
          className="flex items-center gap-2 text-xl leading-8 tracking-[0.15px]"
          style={{ color: healthFactorColor }}
        >
          {formatHealthFactor(healthFactor)}
          <HeartIcon color={healthFactorColor} className="size-6" />
        </span>
        <span className="text-xs leading-[1.66] tracking-[0.4px] text-accent-secondary">
          {COPY.vaults.summary.healthFactorCaption}
        </span>
      </div>
    </section>
  );
}
