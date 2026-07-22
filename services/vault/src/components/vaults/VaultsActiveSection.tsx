/**
 * VaultsActiveSection — the v3 /vaults active-vaults list (issue #2041).
 *
 * One row per collateral vault: amount with its liquidation ordinal, in-use
 * status, provider, transaction hash, and a per-row Withdraw action.
 * Presentational — entries arrive demo-merged from useVaultsPageData. Withdraw
 * passes the on-chain `vaultId` (the withdraw flow's selection key) and is
 * enabled only for in-use, indexer-backed rows — demo (`displayOnly`) and
 * optimistic (`isActivating`) rows never reach an action flow.
 */

import { Heading, Loader } from "@babylonlabs-io/core-ui";

import { ApplicationLogo } from "@/components/ApplicationLogo";
import { NEUTRAL_ROW_BUTTON_CLASS } from "@/components/shared/buttonClasses";
import { CopyableHash } from "@/components/shared/CopyableHash";
import { COPY } from "@/copy";
import type { CollateralVaultEntry } from "@/types/collateral";
import { getBtcExplorerTxUrl } from "@/utils/explorer";
import { formatBtcAmount, formatOrdinal } from "@/utils/formatting";

interface VaultsActiveSectionProps {
  vaults: CollateralVaultEntry[];
  onWithdraw: (vaultId: string) => void;
  isWithdrawDisabled: boolean;
}

function ActiveVaultRow({
  vault,
  onWithdraw,
  isWithdrawDisabled,
}: {
  vault: CollateralVaultEntry;
  onWithdraw: (vaultId: string) => void;
  isWithdrawDisabled: boolean;
}) {
  // Peg-in first: once a vault is active the peg-in tx is the canonical
  // on-Bitcoin one (pending/inactive rows prefer the opposite).
  const hash = vault.peginTxHash ?? vault.prePeginTxHash;

  return (
    <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-secondary-strokeLight bg-secondary-highlight p-4 dark:bg-[#202020]">
      {/* Amount + liquidation ordinal */}
      <div className="flex w-[180px] shrink-0 items-center gap-2">
        <ApplicationLogo
          logoUrl={vault.providerIconUrl ?? null}
          name={vault.providerName}
          size="small"
        />
        <span className="min-w-0 truncate">
          <span className="text-base leading-6 tracking-[0.15px] text-accent-primary">
            {formatBtcAmount(vault.amountBtc)}
          </span>{" "}
          {!vault.isActivating && (
            <span className="text-xs leading-[1.66] tracking-[0.4px] text-accent-secondary">
              {COPY.vaults.summary.liquidationOrdinal(
                formatOrdinal(vault.liquidationIndex + 1),
              )}
            </span>
          )}
        </span>
      </div>

      {/* Status */}
      <div className="flex w-[180px] shrink-0 items-center">
        {vault.isActivating ? (
          <span className="flex items-center gap-2 text-sm text-accent-secondary">
            <Loader size={16} />
            {COPY.collateral.activating}
          </span>
        ) : (
          <span className="flex items-center gap-1">
            <span
              className={`size-3 rounded-full ${
                vault.inUse ? "bg-success-main" : "bg-accent-disabled"
              }`}
            />
            <span className="text-sm leading-[1.43] tracking-[0.17px] text-accent-primary">
              {vault.inUse
                ? COPY.pegin.labels.IN_USE
                : COPY.pegin.labels.AVAILABLE}
            </span>
          </span>
        )}
      </div>

      {/* Provider */}
      <div className="flex w-[180px] shrink-0 items-center gap-2">
        <ApplicationLogo
          logoUrl={vault.providerIconUrl ?? null}
          name={vault.providerName}
          size="xs"
        />
        <span className="truncate text-sm leading-[1.43] tracking-[0.17px] text-accent-primary">
          {vault.providerName}
        </span>
      </div>

      {/* Transaction hash */}
      <div className="flex min-w-[180px] flex-1 items-center [&_a]:underline">
        {hash && (
          <CopyableHash
            hash={hash}
            chain="BTC"
            explorerUrl={getBtcExplorerTxUrl(hash)}
          />
        )}
      </div>

      <button
        type="button"
        onClick={() => onWithdraw(vault.vaultId)}
        disabled={
          isWithdrawDisabled ||
          !vault.inUse ||
          vault.displayOnly ||
          vault.isActivating
        }
        className={NEUTRAL_ROW_BUTTON_CLASS}
      >
        {COPY.vaults.actions.withdraw}
      </button>
    </div>
  );
}

export function VaultsActiveSection({
  vaults,
  onWithdraw,
  isWithdrawDisabled,
}: VaultsActiveSectionProps) {
  if (vaults.length === 0) return null;

  return (
    <section className="w-full space-y-3">
      <Heading variant="h6" as="h2" className="font-normal text-accent-primary">
        {COPY.vaults.sections.activeVaultsTitle}{" "}
        <span className="text-accent-secondary">
          {COPY.vaults.sections.count(vaults.length)}
        </span>
      </Heading>
      <div className="space-y-2">
        {vaults.map((vault) => (
          <ActiveVaultRow
            key={vault.id}
            vault={vault}
            onWithdraw={onWithdraw}
            isWithdrawDisabled={isWithdrawDisabled}
          />
        ))}
      </div>
    </section>
  );
}
