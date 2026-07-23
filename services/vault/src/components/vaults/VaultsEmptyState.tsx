/**
 * VaultsEmptyState — the "Your BTC Vaults will appear here" prompt.
 *
 * Two placements share it: the whole-page state when the account has nothing
 * at all, and the Vaults section when a deposit is still pending — a pending
 * deposit is not yet a vault, so the list below it stays empty until the
 * deposit confirms and activates.
 */

import type { ReactNode } from "react";

import { DepositButton, EmptyState } from "@/components/shared";
import { COPY } from "@/copy";

const EMPTY_ILLUSTRATION_SRC = "/images/vaults-empty.svg";

interface VaultsEmptyStateProps {
  isConnected: boolean;
  /** Deposits kill-switch — swaps in the paused copy. */
  isDepositsPaused: boolean;
  isDepositDisabled: boolean;
  onDeposit: () => void;
  /** Render on the page's card surface — the section placement sits on its
   *  own panel, matching the summary card and the lifecycle rows. */
  withCard?: boolean;
}

/** Same surface as the summary card and the lifecycle rows, at the empty
 *  state's larger 16px radius. */
const CARD_CLASS =
  "w-full rounded-2xl border border-secondary-strokeLight bg-secondary-highlight dark:bg-[#202020]";

export function VaultsEmptyState({
  isConnected,
  isDepositsPaused,
  isDepositDisabled,
  onDeposit,
  withCard = false,
}: VaultsEmptyStateProps): ReactNode {
  const emptyState = (
    <EmptyState
      icon={
        <img
          src={EMPTY_ILLUSTRATION_SRC}
          alt=""
          className="h-[100px] w-[94px]"
        />
      }
      title={
        isDepositsPaused ? COPY.deposit.disabled.title : COPY.vaults.empty.title
      }
      description={
        isDepositsPaused
          ? COPY.deposit.disabled.description
          : COPY.vaults.empty.description
      }
      descriptionVariant="wide"
      isConnected={isConnected}
      action={
        <DepositButton
          // This control's data-testid is a real-wallet E2E hook
          // (e2e/real/actions/walletConnect.ts, e2e/real/actions/pegin.ts)
          // — carry it over if you move or rename the element.
          data-testid="deposit-button"
          variant="contained"
          color="secondary"
          size="medium"
          onClick={onDeposit}
          disabled={isDepositDisabled}
        >
          {COPY.vaults.empty.depositAction}
        </DepositButton>
      }
    />
  );

  return withCard ? <div className={CARD_CLASS}>{emptyState}</div> : emptyState;
}
