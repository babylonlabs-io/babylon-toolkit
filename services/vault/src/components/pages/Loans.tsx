/**
 * Loans page (v3)
 * Dedicated `/loans` route: borrow-capacity + health-factor summary and the
 * list of active loans, reusing the existing Aave data hooks and the
 * reserve-detail borrow/repay overlay (route-driven via `?reserve=&tab=`).
 */

import { Container } from "@babylonlabs-io/core-ui";
import { useOutletContext } from "react-router";

import { AssetSelectionModal } from "@/applications/aave/components/AssetSelectionModal";
import { LOAN_TAB } from "@/applications/aave/constants";
import { useActiveLoans } from "@/applications/aave/hooks";
import type { RootLayoutContext } from "@/components/pages/RootLayout";
import { EmptyState, EmptyStateIcon } from "@/components/shared";
import { PAGE_CONTENT_CLASS } from "@/components/shared/layoutClasses";
import { useConnection, useETHWallet } from "@/context/wallet";
import { COPY } from "@/copy";
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
  } = useDashboardState(isConnected ? address : undefined);

  const { openBorrowPicker, openRepay, goToReserve, assetModalProps } =
    useLoanActions({ borrowedAssets, selectableBorrowedAssets });

  const activeLoans = useActiveLoans(borrowedAssets);

  // A borrow position exists once there is collateral to borrow against (or an
  // active loan). With collateral but no debt yet, the summary still renders so
  // the depositor can borrow via its Borrow action — mirroring the v2 Loans
  // section, whose Borrow button was enabled whenever collateral was present.
  const hasPosition = hasCollateral || hasLoans;

  // Nothing to borrow against yet: prompt to deposit collateral first (or to
  // connect a wallet when disconnected).
  if (!isConnected || !hasPosition) {
    return (
      <Container className={`${PAGE_CONTENT_CLASS} pb-6`}>
        <EmptyState
          icon={<EmptyStateIcon />}
          title={COPY.loans.noActiveLoans.title}
          description={COPY.loans.noActiveLoans.body}
          isConnected={isConnected}
          actionLabel={COPY.overview.depositAction}
          onAction={() => openDeposit()}
          withCard
        />
      </Container>
    );
  }

  const availableMeterPercent =
    maxTotalDebtUsd > 0 ? availableToBorrowUsd / maxTotalDebtUsd : 0;
  const borrowedMeterPercent =
    maxTotalDebtUsd > 0 ? debtValueUsd / maxTotalDebtUsd : 0;

  return (
    <Container className={`${PAGE_CONTENT_CLASS} pb-6`}>
      <div className="space-y-6">
        <LoansSummary
          availableToBorrow={formatUsdValue(availableToBorrowUsd)}
          availableMeterPercent={availableMeterPercent}
          totalBorrowed={formatUsdValue(debtValueUsd)}
          borrowedMeterPercent={borrowedMeterPercent}
          borrowCapacityLoading={isBorrowCapacityLoading}
          borrowCapacityError={borrowCapacityError}
          healthFactor={healthFactor}
          healthFactorStatus={healthFactorStatus}
          onBorrow={openBorrowPicker}
          onRepay={openRepay}
          canBorrow={canBorrow}
          canRepay={hasLoans}
        />

        {hasLoans ? (
          <ActiveLoansList
            rows={activeLoans}
            canBorrow={canBorrow}
            onBorrow={(symbol) => goToReserve(symbol, LOAN_TAB.BORROW)}
            onRepay={(symbol) => goToReserve(symbol, LOAN_TAB.REPAY)}
          />
        ) : (
          // Has collateral but no borrows yet: the Borrow action lives in the
          // summary above; this just labels the empty active-loans area.
          <EmptyState
            icon={<EmptyStateIcon />}
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
