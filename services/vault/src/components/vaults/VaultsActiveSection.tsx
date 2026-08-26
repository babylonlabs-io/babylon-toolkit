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
import type { ReactNode } from "react";

import { ApplicationLogo } from "@/components/ApplicationLogo";
import { NEUTRAL_ROW_BUTTON_CLASS } from "@/components/shared/buttonClasses";
import { CopyableHash } from "@/components/shared/CopyableHash";
import {
  LIST_ROW_ACTION_SLOT_CLASS,
  LIST_ROW_COLUMN_CLASS,
  LIST_ROW_LEADING_COLUMN_CLASS,
  LIST_ROW_MIN_HEIGHT_CLASS,
  ListRowCard,
} from "@/components/shared/ListRow";
import { COPY } from "@/copy";
import type { CollateralVaultEntry } from "@/types/collateral";
import { getBtcExplorerTxUrl } from "@/utils/explorer";
import { formatBtcAmount, formatOrdinal } from "@/utils/formatting";

interface VaultsActiveSectionProps {
  vaults: CollateralVaultEntry[];
  onWithdraw: (vaultId: string) => void;
  isWithdrawDisabled: boolean;
  /** Shown under a plain "Vaults" heading while no vault is active yet —
   *  the page reaches this section with pending deposits only. */
  emptyState?: ReactNode;
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
    // This row's data-testid is a real-wallet E2E hook
    // (e2e/real/actions/withdraw.ts, e2e/real/actions/stepMachine.ts) — carry it
    // over if you move or rename the element. It keys on the on-chain vaultId,
    // which is what the withdraw flow selects on.
    <ListRowCard
      testId={`vault-row-${vault.vaultId}`}
      className={LIST_ROW_MIN_HEIGHT_CLASS}
    >
      {/* Amount + liquidation ordinal */}
      <div
        className={`flex items-center gap-2 ${LIST_ROW_LEADING_COLUMN_CLASS}`}
      >
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
      <div className={`flex items-center ${LIST_ROW_COLUMN_CLASS}`}>
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
      <div className={`flex items-center gap-2 ${LIST_ROW_COLUMN_CLASS}`}>
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
      <div
        className={`flex items-center [&_a]:underline ${LIST_ROW_COLUMN_CLASS}`}
      >
        {hash && (
          <CopyableHash
            hash={hash}
            chain="BTC"
            explorerUrl={getBtcExplorerTxUrl(hash)}
          />
        )}
      </div>

      <div className={LIST_ROW_ACTION_SLOT_CLASS}>
        {/* This control's data-testid is a real-wallet E2E hook
            (e2e/real/actions/withdraw.ts) — carry it over if you move or rename
            the element. Its disabled state is the harness's eligibility gate. */}
        <button
          type="button"
          data-testid="vault-withdraw-button"
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
    </ListRowCard>
  );
}

export function VaultsActiveSection({
  vaults,
  onWithdraw,
  isWithdrawDisabled,
  emptyState,
}: VaultsActiveSectionProps) {
  if (vaults.length === 0) {
    if (!emptyState) return null;
    return (
      <section className="w-full space-y-3">
        <Heading
          variant="h6"
          as="h2"
          className="font-normal text-accent-primary"
        >
          {COPY.vaults.sections.vaultsTitle}
        </Heading>
        {emptyState}
      </section>
    );
  }

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
