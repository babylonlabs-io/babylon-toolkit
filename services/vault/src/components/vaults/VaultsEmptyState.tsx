/**
 * VaultsEmptyState — the "Your BTC Vaults will appear here" prompt.
 *
 * Two placements share it:
 * - the whole-page state when the account has nothing at all, on the standalone
 *   v3 empty-state card (illustration + copy + CTA), matching the Loans and
 *   Activity tabs; and
 * - the Vaults section when a deposit is still pending — a pending deposit is
 *   not yet a vault, so the list below it stays empty until the deposit confirms
 *   and activates. That placement sits on the same bordered surface as the
 *   sibling summary card and lifecycle rows.
 */

import type { ReactNode } from "react";

import {
  ACTION_WIDTH_CLASS,
  DepositButton,
  EmptyState,
} from "@/components/shared";
import { COPY } from "@/copy";

interface VaultsEmptyStateProps {
  isConnected: boolean;
  /** Deposits kill-switch — swaps in the paused copy. */
  isDepositsPaused: boolean;
  isDepositDisabled: boolean;
  onDeposit: () => void;
  /** Rendered inline in the Vaults section (beneath a pending deposit) rather
   *  than as the whole-page empty state. The section sits on the sibling-card
   *  surface; the whole-page state sits on the standalone empty-state card. */
  sectionPlacement?: boolean;
}

/** The section-placement surface: same bordered fill as the summary card and
 *  the lifecycle rows, at the empty state's larger 16px radius. */
const SECTION_CARD_CLASS =
  "w-full rounded-2xl border border-secondary-strokeLight bg-secondary-highlight p-6 dark:bg-[#202020]";

export function VaultsEmptyState({
  isConnected,
  isDepositsPaused,
  isDepositDisabled,
  onDeposit,
  sectionPlacement = false,
}: VaultsEmptyStateProps): ReactNode {
  // The paused notice outranks the connect prompt: a depositor should learn
  // deposits are off without having to connect a wallet first. Disconnected is
  // a title-only prompt (the Loans and Activity tabs do the same) — there is no
  // position to describe until a wallet is attached.
  const { title, description } = isDepositsPaused
    ? COPY.deposit.disabled
    : isConnected
      ? COPY.vaults.empty
      : { title: COPY.vaults.empty.disconnected, description: undefined };

  const emptyState = (
    <EmptyState
      title={title}
      description={description}
      isConnected={isConnected}
      // Whole-page renders on the standalone empty-state card; the section
      // placement supplies its own card wrapper below.
      withCard={!sectionPlacement}
      action={
        <DepositButton
          // This control's data-testid is a real-wallet E2E hook
          // (e2e/real/actions/walletConnect.ts, e2e/real/actions/pegin.ts)
          // — carry it over if you move or rename the element.
          data-testid="deposit-button"
          variant="contained"
          color="secondary"
          size="large"
          className={ACTION_WIDTH_CLASS}
          onClick={onDeposit}
          disabled={isDepositDisabled}
        >
          {COPY.vaults.empty.depositAction}
        </DepositButton>
      }
    />
  );

  return sectionPlacement ? (
    <div className={SECTION_CARD_CLASS}>{emptyState}</div>
  ) : (
    emptyState
  );
}
