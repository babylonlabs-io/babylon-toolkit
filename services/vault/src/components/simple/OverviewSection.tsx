/**
 * OverviewSection Component
 * Displays the position summary as stat cards: total collateral value plus the
 * borrow-capacity cards. Rendered only while a wallet is connected; the
 * disconnected entry screen is handled by DashboardPage.
 */

import { Heading, useIsMobile } from "@babylonlabs-io/core-ui";
import { useMemo } from "react";

import { COPY } from "@/copy";

import {
  buildBorrowCapacityCards,
  PositionStatCards,
  type PositionStatCard,
} from "./PositionStatCards";

interface OverviewSectionProps {
  totalCollateralValue: string;
  totalBorrowed: string;
  availableToBorrow: string;
  collateralBtc: string;
  borrowCapacityLoading: boolean;
  borrowCapacityError: Error | null;
  onDeposit: () => void;
  /** True while `isDepositBlocked` holds — greys the Deposit CTA (issue #2068). */
  isDepositDisabled: boolean;
  onBorrow: () => void;
  onRepay: () => void;
  canBorrow: boolean;
  canRepay: boolean;
}

export function OverviewSection({
  totalCollateralValue,
  totalBorrowed,
  availableToBorrow,
  collateralBtc,
  borrowCapacityLoading,
  borrowCapacityError,
  onDeposit,
  isDepositDisabled,
  onBorrow,
  onRepay,
  canBorrow,
  canRepay,
}: OverviewSectionProps) {
  const isMobile = useIsMobile();
  // Desktop replaces this in-page heading with the persistent header's page
  // title; mobile has no header title slot (Header only shows it on desktop),
  // so the heading must stay to avoid a page with no title at all.
  const hideHeading = !isMobile;

  const statCards: PositionStatCard[] = useMemo(
    () => [
      {
        label: COPY.overview.totalCollateralValueLabel,
        value: totalCollateralValue,
        valueNode: (
          <span>
            {totalCollateralValue}{" "}
            <span className="text-sm leading-[1.43] tracking-[0.17px] text-accent-secondary">
              {collateralBtc}
            </span>
          </span>
        ),
        actionLabel: COPY.overview.depositAction,
        onAction: onDeposit,
        actionDisabled: isDepositDisabled,
      },
      ...buildBorrowCapacityCards({
        availableToBorrow,
        totalBorrowed,
        borrowCapacityLoading,
        borrowCapacityError,
        onBorrow,
        onRepay,
        canBorrow,
        canRepay,
      }),
    ],
    [
      totalCollateralValue,
      collateralBtc,
      onDeposit,
      isDepositDisabled,
      availableToBorrow,
      borrowCapacityLoading,
      borrowCapacityError,
      onBorrow,
      canBorrow,
      totalBorrowed,
      onRepay,
      canRepay,
    ],
  );

  return (
    <div className="w-full space-y-6">
      {!hideHeading && (
        <div className="flex items-center justify-between">
          <Heading
            variant="h5"
            as="h2"
            className="font-normal text-accent-primary"
          >
            {COPY.overview.heading}
          </Heading>
        </div>
      )}

      <div className="space-y-2">
        <Heading
          variant="h6"
          as="h2"
          className="font-normal text-accent-primary"
        >
          {COPY.overview.positionTitle}
        </Heading>
        <PositionStatCards cards={statCards} />
      </div>
    </div>
  );
}
