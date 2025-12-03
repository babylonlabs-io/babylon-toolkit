/**
 * DepositOverview Component
 *
 * Main component for displaying user's vault deposits.
 * Shows a table (desktop) or cards (mobile) with deposit status and actions.
 */

import {
  Avatar,
  AvatarGroup,
  Table,
  useIsMobile,
  type ColumnProps,
} from "@babylonlabs-io/core-ui";
import { useMemo } from "react";
import type { Hex } from "viem";

import { PeginPollingProvider } from "../../../context/deposit/PeginPollingContext";
import { VaultRedeemStep } from "../../../context/deposit/VaultRedeemState";
import type { Deposit } from "../../../types/vault";
import { BroadcastSignModal } from "../BroadcastSignModal";
import { BroadcastSuccessModal } from "../BroadcastSuccessModal";
import { PayoutSignModal } from "../PayoutSignModal";
import { RedeemCollateralModal } from "../RedeemFormModal";
import { RedeemCollateralReviewModal } from "../RedeemReviewModal";
import { RedeemCollateralSignModal } from "../RedeemSignModal";
import { RedeemCollateralSuccessModal } from "../RedeemSuccessModal";

import { DepositMobileCard } from "./DepositMobileCard";
import {
  ActionCell,
  CopyableAddressCell,
  StatusCell,
} from "./DepositTableCells";
import { EmptyState } from "./EmptyState";
import { useDepositOverviewState } from "./useDepositOverviewState";

export function DepositOverview() {
  const isMobile = useIsMobile();
  const state = useDepositOverviewState();

  const {
    isConnected,
    ethAddress,
    btcPublicKey,
    allActivities,
    pendingPegins,
    vaultProviders,
    deposits,
    signingActivity,
    signingTransactions,
    isPayoutSignModalOpen,
    handleSignClick,
    handlePayoutSignClose,
    handlePayoutSignSuccess,
    broadcastingActivity,
    broadcastSuccessOpen,
    handleBroadcastClick,
    handleBroadcastClose,
    handleBroadcastSuccess,
    handleBroadcastSuccessClose,
    redeemStep,
    redeemDepositIds,
    handleRedeemClick,
    handleRedeemFormNext,
    handleRedeemReviewConfirm,
    handleRedeemSignSuccess,
    handleRedeemClose,
  } = state;

  const redeemTotalAmount = useMemo(() => {
    return deposits
      .filter((d) => redeemDepositIds.includes(d.id))
      .reduce((sum, d) => sum + d.amount, 0);
  }, [deposits, redeemDepositIds]);

  // Show empty state when not connected OR when connected but no data
  if (!isConnected || allActivities.length === 0) {
    return <EmptyState isConnected={isConnected} />;
  }

  const columns: ColumnProps<Deposit>[] = [
    {
      key: "amount",
      header: "BTC Vault",
      render: (_value: unknown, row: Deposit) => (
        <div className="flex items-center gap-2">
          <AvatarGroup size="small">
            <Avatar
              url="/images/btc.png"
              alt="BTC"
              size="small"
              variant="circular"
            />
          </AvatarGroup>
          <span className="text-sm font-medium text-accent-primary">
            {row.amount} BTC
          </span>
        </div>
      ),
    },
    {
      key: "pegInTxHash",
      header: "Peg-In Tx",
      render: (_value: unknown, row: Deposit) => (
        <CopyableAddressCell address={row.pegInTxHash} />
      ),
    },
    {
      key: "appName",
      header: "Application",
      render: (_value: unknown, row: Deposit) => (
        <span className="text-sm text-accent-primary">
          {row.appName || "Unknown"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (_value: unknown, row: Deposit) => (
        <StatusCell depositId={row.id} />
      ),
    },
    {
      key: "actions",
      header: "",
      render: (_value: unknown, row: Deposit) => (
        <ActionCell
          depositId={row.id}
          onSignClick={handleSignClick}
          onBroadcastClick={handleBroadcastClick}
          onRedeemClick={handleRedeemClick}
        />
      ),
    },
  ];

  return (
    <PeginPollingProvider
      activities={allActivities}
      pendingPegins={pendingPegins}
      btcPublicKey={btcPublicKey}
      vaultProviders={vaultProviders}
    >
      <div className="relative">
        {/* Desktop: Deposits Table, Mobile: Deposit Cards */}
        {isMobile ? (
          <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto">
            {deposits.map((deposit) => (
              <DepositMobileCard
                key={deposit.id}
                deposit={deposit}
                onSignClick={handleSignClick}
                onBroadcastClick={handleBroadcastClick}
                onRedeemClick={handleRedeemClick}
              />
            ))}
          </div>
        ) : (
          <div className="max-h-[500px] overflow-x-auto overflow-y-auto dark:bg-primary-main">
            <Table data={deposits} columns={columns} fluid />
          </div>
        )}

        {/* Payout Sign Modal */}
        {isPayoutSignModalOpen && signingTransactions && btcPublicKey && (
          <PayoutSignModal
            open={isPayoutSignModalOpen}
            onClose={handlePayoutSignClose}
            activity={signingActivity!}
            transactions={signingTransactions}
            btcPublicKey={btcPublicKey}
            depositorEthAddress={ethAddress as Hex}
            onSuccess={handlePayoutSignSuccess}
          />
        )}

        {/* Broadcast Sign Modal */}
        {broadcastingActivity && ethAddress && (
          <BroadcastSignModal
            open={!!broadcastingActivity}
            onClose={handleBroadcastClose}
            activity={broadcastingActivity}
            depositorEthAddress={ethAddress}
            onSuccess={handleBroadcastSuccess}
          />
        )}

        {/* Broadcast Success Modal */}
        <BroadcastSuccessModal
          open={broadcastSuccessOpen}
          onClose={handleBroadcastSuccessClose}
          amount={broadcastingActivity?.collateral.amount || "0"}
        />

        {/* Redeem Form Modal */}
        <RedeemCollateralModal
          open={redeemStep === VaultRedeemStep.FORM}
          onClose={handleRedeemClose}
          onNext={handleRedeemFormNext}
          deposits={deposits}
        />

        {/* Redeem Review Modal */}
        <RedeemCollateralReviewModal
          open={redeemStep === VaultRedeemStep.REVIEW}
          onClose={handleRedeemClose}
          onConfirm={handleRedeemReviewConfirm}
          depositIds={redeemDepositIds}
          deposits={deposits}
        />

        {/* Redeem Sign Modal */}
        <RedeemCollateralSignModal
          open={redeemStep === VaultRedeemStep.SIGN}
          onClose={handleRedeemClose}
          onSuccess={handleRedeemSignSuccess}
          activities={allActivities}
          depositIds={redeemDepositIds}
        />

        {/* Redeem Success Modal */}
        <RedeemCollateralSuccessModal
          open={redeemStep === VaultRedeemStep.SUCCESS}
          onClose={handleRedeemClose}
          totalAmount={redeemTotalAmount}
          depositCount={redeemDepositIds.length}
        />
      </div>
    </PeginPollingProvider>
  );
}
