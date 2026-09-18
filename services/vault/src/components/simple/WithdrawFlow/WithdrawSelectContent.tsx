import {
  Avatar,
  Button,
  Callout,
  Checkbox,
  Heading,
  Text,
  WarningIcon,
} from "@babylonlabs-io/core-ui";

import { WITHDRAW_HF_BLOCK_THRESHOLD } from "@/applications/aave/constants";
import {
  formatHealthFactor,
  getWithdrawHfWarningState,
} from "@/applications/aave/utils";
import { getNetworkConfigBTC } from "@/config";
import { COPY } from "@/copy";
import type { CollateralVaultEntry } from "@/types/collateral";
import { formatBtcAmount, formatOrdinal } from "@/utils/formatting";

const SELECT_COPY = COPY.withdraw.select;

interface WithdrawSelectContentProps {
  /** Selectable vaults, in liquidation order (seized-first leading). */
  vaults: CollateralVaultEntry[];
  selectedVaultIds: string[];
  /** Summed BTC of the current selection, shown on the action. */
  totalAmountBtc: number;
  /** Health factor after the current selection is withdrawn. Infinity when no debt. */
  projectedHealthFactor: number;
  /** Whether the user accepted the at-risk projection. */
  acknowledged: boolean;
  onToggleVault: (vaultId: string) => void;
  onAcknowledgedChange: (acknowledged: boolean) => void;
  onContinue: () => void;
}

export function WithdrawSelectContent({
  vaults,
  selectedVaultIds,
  totalAmountBtc,
  projectedHealthFactor,
  acknowledged,
  onToggleVault,
  onAcknowledgedChange,
  onContinue,
}: WithdrawSelectContentProps) {
  const btcConfig = getNetworkConfigBTC();
  const { wouldBreachHF, isAtRisk } = getWithdrawHfWarningState(
    projectedHealthFactor,
  );

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Heading variant="h5" className="font-normal text-accent-primary">
          {SELECT_COPY.heading}
        </Heading>
        <Text variant="body1" className="text-accent-secondary">
          {SELECT_COPY.subtitle}
        </Text>
      </div>

      {(wouldBreachHF || isAtRisk) && (
        <Callout
          variant="error"
          title={SELECT_COPY.riskTitle}
          icon={<WarningIcon size={14} color="text-accent-contrast" />}
          className="border-l-4 border-l-error-dark"
        >
          <div className="flex flex-col gap-4">
            <span>
              {wouldBreachHF
                ? COPY.withdraw.review.hfBlockWarning(
                    WITHDRAW_HF_BLOCK_THRESHOLD.toFixed(1),
                  )
                : SELECT_COPY.riskBody(
                    formatHealthFactor(projectedHealthFactor),
                  )}
            </span>
            {isAtRisk && (
              <label className="flex w-full cursor-pointer items-center gap-4">
                {/* This control's data-testid is a real-wallet E2E hook
                    (e2e/real/actions/withdraw.ts) — carry it over if you move
                    or rename the element. */}
                <Checkbox
                  checked={acknowledged}
                  onChange={() => onAcknowledgedChange(!acknowledged)}
                  variant="default"
                  showLabel={false}
                  data-testid="withdraw-select-acknowledge"
                />
                <span className="text-base leading-[1.5] tracking-[0.15px] text-accent-primary">
                  {SELECT_COPY.continueAnyway}
                </span>
              </label>
            )}
          </div>
        </Callout>
      )}

      <div className="flex flex-col gap-2">
        {vaults.map((vault) => (
          <label
            key={vault.vaultId}
            className="flex cursor-pointer items-center gap-4 rounded-lg bg-background-secondary px-6 py-4"
          >
            <Avatar
              size="medium"
              url={btcConfig.icon}
              alt={btcConfig.coinSymbol}
              className="shrink-0"
            />
            <span className="min-w-0 flex-1 truncate">
              <span className="text-xl leading-8 tracking-[0.15px] text-accent-primary">
                {formatBtcAmount(vault.amountBtc)}
              </span>{" "}
              <span className="text-accent-secondary">
                {COPY.vaults.summary.liquidationOrdinal(
                  formatOrdinal(vault.liquidationIndex + 1),
                )}
              </span>
            </span>
            {/* This control's data-testid is a real-wallet E2E hook
                (e2e/real/actions/withdraw.ts) — carry it over if you move or
                rename the element. */}
            <Checkbox
              checked={selectedVaultIds.includes(vault.vaultId)}
              onChange={() => onToggleVault(vault.vaultId)}
              variant="default"
              showLabel={false}
              data-testid={`withdraw-select-row-${vault.vaultId}`}
            />
          </label>
        ))}
      </div>

      {/* This control's data-testid is a real-wallet E2E hook
          (e2e/real/actions/withdraw.ts) — carry it over if you move or rename
          the element. */}
      <Button
        variant="contained"
        color="secondary"
        className="w-full"
        disabled={
          selectedVaultIds.length === 0 ||
          wouldBreachHF ||
          (isAtRisk && !acknowledged)
        }
        onClick={onContinue}
        data-testid="withdraw-select-continue"
      >
        {SELECT_COPY.button(formatBtcAmount(totalAmountBtc))}
      </Button>
    </div>
  );
}
