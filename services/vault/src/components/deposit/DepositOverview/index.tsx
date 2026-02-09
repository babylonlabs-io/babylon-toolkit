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
import { useCallback, useMemo } from "react";
import type { Hex } from "viem";

import { getNetworkConfigBTC } from "@/config";

import { PeginPollingProvider } from "../../../context/deposit/PeginPollingContext";
import type { Deposit } from "../../../types/vault";
import { formatTimeAgo } from "../../../utils/formatting";
import { isVaultOwnedByWallet } from "../../../utils/vaultWarnings";
import { BroadcastSignModal } from "../BroadcastSignModal";
import { BroadcastSuccessModal } from "../BroadcastSuccessModal";
import { PayoutSignModal } from "../PayoutSignModal";
import { RedeemModals } from "../RedeemModals";

import { ActionCell } from "./ActionCell";
import { DepositMobileCard } from "./DepositMobileCard";
import { CopyableAddressCell, StatusCell } from "./DepositTableCells";
import { EmptyState } from "./EmptyState";
import { useDepositOverviewState } from "./useDepositOverviewState";

const btcConfig = getNetworkConfigBTC();

export function DepositOverview() {
  const isMobile = useIsMobile();
  const state = useDepositOverviewState();

  const {
    isConnected,
    ethAddress,
    btcPublicKey,
    btcAddress,
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
    broadcastSuccessAmount,
    handleBroadcastClick,
    handleBroadcastClose,
    handleBroadcastSuccess,
    handleBroadcastSuccessClose,
    triggerRedeem,
    refetchActivities,
  } = state;

  // Memoized map for O(1) activity lookups by id
  const activityById = useMemo(() => {
    return new Map(allActivities.map((a) => [a.id, a]));
  }, [allActivities]);

  // Check if a deposit row should be disabled (not owned by connected wallet)
  const isRowDisabled = useCallback(
    (deposit: Deposit) => {
      const activity = activityById.get(deposit.id);
      return !isVaultOwnedByWallet(activity?.depositorBtcPubkey, btcPublicKey);
    },
    [activityById, btcPublicKey],
  );

  // Show empty state when not connected OR when connected but no data
  if (!isConnected || allActivities.length === 0) {
    return <EmptyState isConnected={isConnected} />;
  }

  const columns: ColumnProps<Deposit>[] = [
    {
      key: "amount",
      header: `${btcConfig.coinSymbol} Vault`,
      render: (_value: unknown, row: Deposit) => (
        <div className="flex items-center gap-2">
          <AvatarGroup size="small">
            <Avatar
              url={btcConfig.icon}
              alt={btcConfig.coinSymbol}
              size="small"
              variant="circular"
            />
          </AvatarGroup>
          <span className="text-sm font-medium text-accent-primary">
            {row.amount} {btcConfig.coinSymbol}
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
      key: "timestamp",
      header: "Time",
      render: (_value: unknown, row: Deposit) => (
        <span className="text-sm text-accent-secondary">
          {row.timestamp ? formatTimeAgo(row.timestamp) : "-"}
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
      cellClassName: "bbn-table-cell-no-dim",
      render: (_value: unknown, row: Deposit) => (
        <ActionCell
          depositId={row.id}
          onSignClick={handleSignClick}
          onBroadcastClick={handleBroadcastClick}
          onRedeemClick={triggerRedeem}
        />
      ),
    },
  ];

  return (
    <PeginPollingProvider
      activities={allActivities}
      pendingPegins={pendingPegins}
      btcPublicKey={btcPublicKey}
      btcAddress={btcAddress}
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
                onRedeemClick={triggerRedeem}
              />
            ))}
          </div>
        ) : (
          <div className="max-h-[500px] overflow-x-auto overflow-y-auto dark:bg-primary-main">
            <Table
              data={deposits}
              columns={columns}
              fluid
              stylePreset="card"
              isRowDisabled={isRowDisabled}
            />
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
          amount={broadcastSuccessAmount}
        />

        {/* Redeem Modals - manages its own state internally */}
        <RedeemModals
          deposits={deposits}
          activities={allActivities}
          onSuccess={refetchActivities}
        />
      </div>
    </PeginPollingProvider>
  );
}
