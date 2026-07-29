/**
 * Loans page (v3)
 * Dedicated `/loans` route: borrow-capacity + health-factor summary and the
 * list of active loans, reusing the existing Aave data hooks and the
 * reserve-detail borrow/repay overlay (route-driven via `?reserve=&tab=`).
 */

import { Container, Loader } from "@babylonlabs-io/core-ui";
import { useMemo } from "react";
import { useOutletContext } from "react-router";

import { AssetSelectionModal } from "@/applications/aave/components/AssetSelectionModal";
import { LOAN_TAB } from "@/applications/aave/constants";
import { useActiveLoans } from "@/applications/aave/hooks";
import type { RootLayoutContext } from "@/components/pages/RootLayout";
import { EmptyState } from "@/components/shared";
import { PAGE_CONTENT_CLASS } from "@/components/shared/layoutClasses";
import { useConnection, useETHWallet } from "@/context/wallet";
import { COPY } from "@/copy";
import {
  resolveShownHealthFactor,
  useDebugBorrowCapacity,
  useDebugHealthFactorOverride,
} from "@/dev/debugPositionStore";
import { useDemoLoan } from "@/dev/demoDeposit";
import { useDashboardState } from "@/hooks/useDashboardState";
import { useLoanActions } from "@/hooks/useLoanActions";
import { formatUsdValue } from "@/utils/formatting";

import { ActiveLoansList } from "../simple/ActiveLoansList";
import { LoansSummary } from "../simple/LoansSummary";

export default function Loans() {
  const { openDeposit } = useOutletContext<RootLayoutContext>();
  const { address } = useETHWallet();
  const { isConnected } = useConnection();

  const {
    debtValueUsd,
    maxTotalDebtUsd,
    availableToBorrowUsd,
    canBorrow,
    healthFactor,
    healthFactorStatus,
    borrowedAssets,
    hasLoans,
    hasCollateral,
    selectableBorrowedAssets,
    isBorrowCapacityLoading,
    borrowCapacityError,
    isLoading,
  } = useDashboardState(isConnected ? address : undefined);

  const { openBorrowPicker, openRepay, goToReserve, assetModalProps } =
    useLoanActions({ borrowedAssets, selectableBorrowedAssets });

  const activeLoans = useActiveLoans(borrowedAssets);

  // God-mode demo loans (dev only; null unless the panel's "Inject demo" toggle
  // is on). Merged into the rendered rows — real rows dropped when `hideReal`
  // is set — so the Loans page can be exercised without a borrow position, or
  // a wallet. Every mock row is `displayOnly`, so ActiveLoansList disables its
  // actions and the real borrow/repay flows never see one. Inert in production.
  const demoLoans = useDemoLoan();
  const displayLoans = useMemo(() => {
    if (!demoLoans) return activeLoans;
    return [...demoLoans.rows, ...(demoLoans.hideReal ? [] : activeLoans)];
  }, [activeLoans, demoLoans]);
  const demoAffectsLoans =
    demoLoans !== null && (demoLoans.rows.length > 0 || demoLoans.hideReal);

  // God-mode summary overrides (dev only; null unless the panel forces them,
  // compile-time null in production builds).
  const healthFactorOverride = useDebugHealthFactorOverride();
  const borrowCapacityOverride = useDebugBorrowCapacity();
  const {
    healthFactor: shownHealthFactor,
    healthFactorStatus: shownHealthFactorStatus,
  } = resolveShownHealthFactor(
    healthFactorOverride,
    healthFactor,
    healthFactorStatus,
  );
  // A forced state REPLACES the live one wholesale — combining them field by
  // field would leave "Error" showing the live loader (or "Loading" showing a
  // live error), i.e. never actually render the state that was forced.
  const shownCapacityLoading = borrowCapacityOverride
    ? borrowCapacityOverride.loading
    : isBorrowCapacityLoading;
  const shownCapacityError = borrowCapacityOverride
    ? borrowCapacityOverride.error
    : borrowCapacityError;
  // A forced summary state is as much a reason to render the page as a mock
  // row is — otherwise setting one on an empty position shows nothing.
  const godModeAffectsPage =
    demoAffectsLoans ||
    healthFactorOverride !== null ||
    borrowCapacityOverride !== null;

  // A borrow position exists once there is collateral to borrow against (or an
  // active loan). With collateral but no debt yet, the summary still renders so
  // the depositor can borrow via its Borrow action — mirroring the v2 Loans
  // section, whose Borrow button was enabled whenever collateral was present.
  const hasPosition = hasCollateral || hasLoans || godModeAffectsPage;

  // Position is still loading for a connected wallet: hold on a spinner rather
  // than flashing the full-page "deposit" empty state before the summary lands
  // (hasCollateral/hasLoans are false until the position resolves).
  if (isConnected && isLoading && !godModeAffectsPage) {
    return (
      <Container className={`${PAGE_CONTENT_CLASS} pb-6`}>
        <div className="flex items-center justify-center py-12">
          <Loader />
        </div>
      </Container>
    );
  }

  // Nothing to borrow against yet: prompt to deposit collateral first (or to
  // connect a wallet when disconnected).
  if (!hasPosition || (!isConnected && !godModeAffectsPage)) {
    return (
      <Container className={`${PAGE_CONTENT_CLASS} pb-6`}>
        <EmptyState
          title={
            isConnected
              ? COPY.loans.noActiveLoans.title
              : COPY.loans.emptyDisconnected
          }
          description={isConnected ? COPY.loans.noActiveLoans.body : undefined}
          isConnected={isConnected}
          actionLabel={COPY.overview.depositAction}
          onAction={() => openDeposit()}
          withCard
        />
      </Container>
    );
  }

  // Display-only totals: when the demo changes the rendered rows, the summary
  // must total what is on screen — otherwise it reads "$0 borrowed" above a mock
  // row. With no real borrow capacity to scale against (the usual demo case:
  // no position at all), the mock debt itself becomes the meter's denominator,
  // so the bar reads fully-borrowed rather than empty. The values passed to the
  // borrow/repay actions stay demo-unaware.
  const shownDebtUsd = demoAffectsLoans
    ? (demoLoans?.debtUsd ?? 0) + (demoLoans?.hideReal ? 0 : debtValueUsd)
    : debtValueUsd;
  const meterBaseUsd = maxTotalDebtUsd > 0 ? maxTotalDebtUsd : shownDebtUsd;
  const availableMeterPercent =
    meterBaseUsd > 0 ? availableToBorrowUsd / meterBaseUsd : 0;
  const borrowedMeterPercent =
    meterBaseUsd > 0 ? shownDebtUsd / meterBaseUsd : 0;

  return (
    <Container className={`${PAGE_CONTENT_CLASS} pb-6`}>
      <div className="space-y-6">
        <LoansSummary
          availableToBorrow={formatUsdValue(availableToBorrowUsd)}
          availableMeterPercent={availableMeterPercent}
          totalBorrowed={formatUsdValue(shownDebtUsd)}
          borrowedMeterPercent={borrowedMeterPercent}
          borrowCapacityLoading={shownCapacityLoading}
          borrowCapacityError={shownCapacityError}
          healthFactor={shownHealthFactor}
          healthFactorStatus={shownHealthFactorStatus}
          onBorrow={openBorrowPicker}
          onRepay={openRepay}
          canBorrow={canBorrow}
          canRepay={hasLoans}
        />

        {/* `hasLoans` (debt in USD), not `displayLoans.length`: the two can
            disagree — dust debt, or a reserve with a debt position whose USD
            value reads 0 — and the real page's choice here must not shift. The
            demo only ever adds a reason to render the list. */}
        {hasLoans || demoAffectsLoans ? (
          <ActiveLoansList
            rows={displayLoans}
            canBorrow={canBorrow}
            onBorrow={(symbol) => goToReserve(symbol, LOAN_TAB.BORROW)}
            onRepay={(symbol) => goToReserve(symbol, LOAN_TAB.REPAY)}
          />
        ) : (
          // Has collateral but no borrows yet: the Borrow action lives in the
          // summary above; this just labels the empty active-loans area.
          <EmptyState
            title={COPY.loans.noActiveLoans.title}
            description={COPY.loans.noActiveLoans.body}
            isConnected
            withCard
          />
        )}
      </div>

      <AssetSelectionModal {...assetModalProps} />
    </Container>
  );
}
