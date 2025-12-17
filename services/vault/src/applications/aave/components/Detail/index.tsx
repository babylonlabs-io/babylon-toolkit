/**
 * Aave Reserve Detail Page
 *
 * Borrow card layout with real position data from Aave oracle.
 * Reserve is selected from the overview page and passed via URL param.
 */

import { Container } from "@babylonlabs-io/core-ui";
import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";

import { BackButton } from "@/components/shared";
import { useETHWallet } from "@/context/wallet";
import { getTokenByAddress } from "@/services/token/tokenService";

import { useAaveConfig } from "../../context";
import { useAaveUserPosition } from "../../hooks";
import { LoanProvider } from "../context/LoanContext";
import { LoanCard } from "../LoanCard";

export function AaveReserveDetail() {
  const navigate = useNavigate();
  const { reserveId } = useParams<{ reserveId: string }>();
  const [searchParams] = useSearchParams();
  const [borrowedAmount, setBorrowedAmount] = useState(0);

  // Read tab from URL query params (defaults to "borrow")
  const tabParam = searchParams.get("tab");
  const defaultTab = tabParam === "repay" ? "repay" : "borrow";

  const { address } = useETHWallet();

  // Fetch reserves from Aave config
  const {
    vbtcReserve,
    borrowableReserves,
    isLoading: configLoading,
  } = useAaveConfig();

  // Find the selected reserve by symbol (from URL param)
  const selectedReserve = useMemo(() => {
    if (!reserveId) return null;
    return borrowableReserves.find(
      (r) => r.token.symbol.toLowerCase() === reserveId.toLowerCase(),
    );
  }, [borrowableReserves, reserveId]);

  // Build asset config from reserve
  const assetConfig = useMemo(() => {
    if (!selectedReserve) return null;
    const tokenMetadata = getTokenByAddress(selectedReserve.token.address);
    return {
      name: selectedReserve.token.name,
      symbol: selectedReserve.token.symbol,
      icon: tokenMetadata?.icon ?? "",
    };
  }, [selectedReserve]);

  // Fetch user position from Aave (uses Aave oracle for USD values)
  const {
    collateralValueUsd,
    debtValueUsd,
    healthFactor,
    isLoading: positionLoading,
  } = useAaveUserPosition(address);

  const handleBack = () => navigate("/app/aave");

  // Stub handlers for UI-only mode
  const handleBorrow = (collateralAmount: number, borrowAmount: number) => {
    void collateralAmount;
    setBorrowedAmount(borrowAmount);
  };

  const handleRepay = (
    repayAmount: number,
    withdrawCollateralAmount: number,
  ) => {
    // TODO: wire to Aave repay transaction flow
    void repayAmount;
    void withdrawCollateralAmount;
  };

  const handleViewLoan = () => {
    if (!assetConfig) return;
    // Navigate back to dashboard with borrowedAssets state
    navigate("/app/aave", {
      state: {
        borrowedAssets: [
          {
            symbol: assetConfig.symbol,
            icon: assetConfig.icon,
            amount: String(borrowedAmount),
          },
        ],
      },
    });
  };

  // Show loading state
  const isLoading = configLoading || positionLoading;
  if (isLoading) {
    return (
      <Container className="pb-6">
        <div className="space-y-6">
          <BackButton label="Aave" onClick={handleBack} />
          <div className="flex items-center justify-center py-12">
            <p className="text-accent-secondary">Loading...</p>
          </div>
        </div>
      </Container>
    );
  }

  // Reserve not found or vBTC config missing
  if (!selectedReserve || !assetConfig || !vbtcReserve) {
    return (
      <Container className="pb-6">
        <div className="space-y-6">
          <BackButton label="Aave" onClick={handleBack} />
          <div className="flex items-center justify-center py-12">
            <p className="text-accent-secondary">Reserve not found</p>
          </div>
        </div>
      </Container>
    );
  }

  // Build loan context from Aave position
  const loanData = {
    collateralValueUsd,
    currentDebtUsd: debtValueUsd,
    healthFactor,
  };

  // Get liquidation threshold (collateralFactor) from vBTC reserve
  // collateralFactor is the proportion of collateral that can be borrowed against, in BPS
  const liquidationThresholdBps = vbtcReserve.reserve.collateralFactor;

  return (
    <LoanProvider value={loanData}>
      <Container className="pb-6">
        <div className="space-y-6">
          {/* Back Button */}
          <BackButton label="Aave" onClick={handleBack} />

          {/* Loan Card - Full width like other cards */}
          <LoanCard
            defaultTab={defaultTab}
            selectedAsset={assetConfig}
            liquidationThresholdBps={liquidationThresholdBps}
            onBorrow={handleBorrow}
            onRepay={handleRepay}
            onViewLoan={handleViewLoan}
          />
        </div>
      </Container>
    </LoanProvider>
  );
}
