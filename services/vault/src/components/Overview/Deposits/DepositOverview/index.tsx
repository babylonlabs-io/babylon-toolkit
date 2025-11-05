import {
  Avatar,
  AvatarGroup,
  Button,
  StatusBadge,
  Table,
  useIsMobile,
  VaultDetailCard,
  type ColumnProps,
} from "@babylonlabs-io/core-ui";
import { useWalletConnect } from "@babylonlabs-io/wallet-connector";
import { useCallback, useMemo, useState } from "react";
import type { Hex } from "viem";

import { useBTCWallet, useETHWallet } from "../../../../context/wallet";
import { useBtcPublicKey } from "../../../../hooks/useBtcPublicKey";
import { useVaultDeposits } from "../../../../hooks/useVaultDeposits";
import { getPeginState } from "../../../../models/peginStateMachine";
import { usePeginStorage } from "../../../../storage/usePeginStorage";
import type { VaultActivity } from "../../../../types/activity";
import type { Deposit } from "../../../../types/vault";
import { truncateAddress } from "../../../../utils/addressUtils";
import { BroadcastSignModal } from "../BroadcastSignModal";
import { BroadcastSuccessModal } from "../BroadcastSuccessModal";
import { DepositTableRowActions } from "../DepositTableRow";
import { useDepositRowPolling } from "../hooks/useDepositRowPolling";
import { usePayoutSignModal } from "../hooks/usePayoutSignModal";
import { PayoutSignModal } from "../PayoutSignModal";
import {
  useVaultDepositState,
  VaultDepositStep,
} from "../state/VaultDepositState";
import {
  useVaultRedeemState,
  VaultRedeemStep,
} from "../state/VaultRedeemState";

function EmptyState({
  onDeposit,
  isConnected,
}: {
  onDeposit: () => void;
  isConnected: boolean;
}) {
  return (
    <div className="max-h-[500px] overflow-x-auto overflow-y-auto rounded-2xl bg-primary-contrast dark:bg-primary-main">
      <div className="flex min-h-[200px] items-center justify-center p-6">
        <div className="flex flex-col items-center">
          <img
            src="/images/btc.svg"
            alt="Bitcoin"
            className="mb-4"
            style={{ height: 100, width: 100, marginTop: 24 }}
          />
          <div className="flex flex-col gap-2 text-center">
            <h4
              className="text-lg text-accent-primary"
              style={{ letterSpacing: "0.15px" }}
            >
              Deposit BTC Trustlessly
            </h4>
            <p className="text-sm text-accent-secondary">
              {isConnected
                ? "Your deposit will appear here once confirmed."
                : "Connect your wallet to start depositing BTC."}
            </p>
          </div>
          <div className="mt-8">
            <Button
              variant="outlined"
              size="medium"
              rounded
              onClick={onDeposit}
              aria-label={isConnected ? "Add deposit" : "Connect wallet"}
            >
              {isConnected ? "Deposit" : "Connect Wallet"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper component for status with row polling
function StatusCell({
  activity,
  deposit,
  btcPublicKey,
  pendingPegins,
}: {
  activity: VaultActivity;
  deposit: Deposit;
  btcPublicKey?: string;
  pendingPegins: any[];
}) {
  const pendingPegin = pendingPegins.find((p) => p.id === deposit.id);
  const { peginState } = useDepositRowPolling({
    activity,
    btcPublicKey,
    pendingPegin,
  });
  const status = peginState.displayLabel;

  // Map status labels to badge variants
  const statusMap: Record<string, "inactive" | "pending" | "active"> = {
    Available: "inactive",
    Pending: "pending",
    "In Use": "active",
    "Signing required": "pending",
    Processing: "pending",
    Verified: "pending",
    "Pending Bitcoin Confirmations": "pending",
    Expired: "inactive",
  };

  return (
    <div title={peginState.message || ""} className="cursor-help">
      <StatusBadge status={statusMap[status] || "pending"} label={status} />
    </div>
  );
}

// Helper component for action buttons with row polling
function ActionCell({
  activity,
  deposit,
  btcPublicKey,
  pendingPegins,
  onSignClick,
  onBroadcastClick,
}: {
  activity: VaultActivity;
  deposit: Deposit;
  btcPublicKey?: string;
  pendingPegins: any[];
  onSignClick: (depositId: string, transactions: any[]) => void;
  onBroadcastClick: (depositId: string) => void;
}) {
  const pendingPegin = pendingPegins.find((p) => p.id === deposit.id);

  return (
    <DepositTableRowActions
      deposit={deposit}
      activity={activity}
      btcPublicKey={btcPublicKey}
      pendingPegin={pendingPegin}
      onSignClick={onSignClick}
      onBroadcastClick={onBroadcastClick}
    />
  );
}

// Helper component for copyable provider address
function CopyableProviderAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy address:", err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-2 text-sm text-accent-primary transition-colors hover:text-accent-secondary"
      title={copied ? "Copied!" : "Click to copy address"}
    >
      <span>{truncateAddress(address)}</span>
      {copied && <span className="text-xs text-green-500">✓</span>}
    </button>
  );
}

// Mobile card component with row polling
function DepositMobileCard({
  deposit,
  activity,
  btcPublicKey,
  pendingPegins,
  onSignClick,
  onBroadcastClick,
}: {
  deposit: Deposit;
  activity: VaultActivity;
  btcPublicKey?: string;
  pendingPegins: any[];
  onSignClick: (depositId: string, transactions: any[]) => void;
  onBroadcastClick: (depositId: string) => void;
}) {
  const pendingPegin = pendingPegins.find((p) => p.id === deposit.id);
  const {
    peginState,
    shouldShowSignButton,
    shouldShowBroadcastButton,
    transactions,
  } = useDepositRowPolling({
    activity,
    btcPublicKey,
    pendingPegin,
  });
  const status = peginState.displayLabel;

  const statusMap: Record<string, "inactive" | "pending" | "active"> = {
    Available: "inactive",
    Pending: "pending",
    "In Use": "active",
    "Signing required": "pending",
    Processing: "pending",
    Verified: "pending",
    "Pending Bitcoin Confirmations": "pending",
    Expired: "inactive",
  };

  return (
    <VaultDetailCard
      key={deposit.id}
      id={deposit.id}
      title={{
        icons: ["/images/btc.png"],
        text: `${deposit.amount} BTC`,
      }}
      details={[
        {
          label: "Peg-In Tx",
          value: <CopyableProviderAddress address={deposit.pegInTxHash} />,
        },
        {
          label: "Vault",
          value: (
            <div className="flex items-center gap-2">
              <span className="text-base">{deposit.vaultProvider.icon}</span>
              <CopyableProviderAddress
                address={deposit.vaultProvider.address}
              />
            </div>
          ),
        },
        {
          label: "Status",
          value: (
            <div title={peginState.message || ""} className="cursor-help">
              <StatusBadge
                status={statusMap[status] || "pending"}
                label={status}
              />
            </div>
          ),
        },
      ]}
      actions={
        shouldShowSignButton
          ? [{ name: "Sign", action: "sign" }]
          : shouldShowBroadcastButton
            ? [{ name: "Sign & Broadcast", action: "broadcast" }]
            : undefined
      }
      onAction={(id, action) => {
        if (action === "sign" && transactions) {
          onSignClick(id, transactions);
        } else if (action === "broadcast") {
          onBroadcastClick(id);
        }
      }}
    />
  );
}

export function DepositOverview() {
  const isMobile = useIsMobile();
  const { connected: btcConnected } = useBTCWallet();
  const { connected: ethConnected, address: ethAddress } = useETHWallet();
  const isConnected = btcConnected && ethConnected;
  const { open: openWalletModal } = useWalletConnect();

  // Get BTC public key from wallet
  const btcPublicKey = useBtcPublicKey(btcConnected);

  // Fetch real deposit data from contract
  const { activities, refetchActivities } = useVaultDeposits(
    ethAddress as `0x${string}` | undefined,
  );

  // Get pending pegins from localStorage and merge with confirmed
  const { allActivities, pendingPegins } = usePeginStorage({
    ethAddress: ethAddress || "",
    confirmedPegins: activities,
  });

  // Manage payout sign modal state
  const {
    signingActivity,
    signingTransactions,
    isOpen: isPayoutSignModalOpen,
    handleSignClick,
    handleClose: handlePayoutSignClose,
    handleSuccess: handlePayoutSignSuccess,
  } = usePayoutSignModal({
    allActivities,
    onSuccess: refetchActivities,
  });

  // Manage broadcast modal state
  const [broadcastingActivity, setBroadcastingActivity] =
    useState<VaultActivity | null>(null);
  const [broadcastSuccessOpen, setBroadcastSuccessOpen] = useState(false);

  // Broadcast modal handlers
  const handleBroadcastClick = useCallback(
    (depositId: string) => {
      const activity = allActivities.find((a) => a.id === depositId);
      if (activity) {
        setBroadcastingActivity(activity);
      }
    },
    [allActivities],
  );

  const handleBroadcastClose = useCallback(() => {
    setBroadcastingActivity(null);
  }, []);

  const handleBroadcastSuccess = useCallback(() => {
    setBroadcastingActivity(null);
    setBroadcastSuccessOpen(true);
    refetchActivities(); // Trigger refetch to update status
  }, [refetchActivities]);

  const handleBroadcastSuccessClose = useCallback(() => {
    setBroadcastSuccessOpen(false);
  }, []);

  const { goToStep: goToDepositStep } = useVaultDepositState();
  const { goToStep: goToRedeemStep } = useVaultRedeemState();

  const handleDeposit = () => {
    if (!isConnected) {
      // Open wallet connection modal
      openWalletModal();
    } else {
      // Already connected, open deposit modal directly
      goToDepositStep(VaultDepositStep.FORM);
    }
  };

  const handleRedeem = () => {
    if (isConnected) {
      goToRedeemStep(VaultRedeemStep.FORM);
    }
  };

  // Transform VaultActivity to Deposit format for table
  const deposits: Deposit[] = useMemo(() => {
    return allActivities.map((activity: VaultActivity) => {
      // Get state from state machine (without transactionsReady for initial display)
      const state = getPeginState(activity.contractStatus ?? 0);

      return {
        id: activity.id,
        amount: parseFloat(activity.collateral.amount),
        vaultProvider: {
          address: activity.providers[0]?.id || "",
          name: activity.providers[0]?.name || "Unknown Provider",
          icon: activity.providers[0]?.icon || "",
        },
        pegInTxHash: activity.txHash || activity.id,
        status: state.displayLabel,
      };
    });
  }, [allActivities]);

  // Show empty state when not connected OR when connected but no data
  if (!isConnected || allActivities.length === 0) {
    return <EmptyState onDeposit={handleDeposit} isConnected={isConnected} />;
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
        <CopyableProviderAddress address={row.pegInTxHash} />
      ),
    },
    {
      key: "vaultProvider",
      header: "Vault(s)",
      render: (_value: unknown, row: Deposit) => (
        <div className="flex items-center gap-2">
          <span className="text-base">{row.vaultProvider.icon}</span>
          <CopyableProviderAddress address={row.vaultProvider.address} />
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (_value: unknown, row: Deposit) => {
        const activity = allActivities.find((a) => a.id === row.id)!;
        return (
          <StatusCell
            activity={activity}
            deposit={row}
            btcPublicKey={btcPublicKey}
            pendingPegins={pendingPegins}
          />
        );
      },
    },
    {
      key: "actions",
      header: "",
      render: (_value: unknown, row: Deposit) => {
        const activity = allActivities.find((a) => a.id === row.id)!;
        return (
          <ActionCell
            activity={activity}
            deposit={row}
            btcPublicKey={btcPublicKey}
            pendingPegins={pendingPegins}
            onSignClick={handleSignClick}
            onBroadcastClick={handleBroadcastClick}
          />
        );
      },
    },
  ];

  return (
    <div className="relative">
      {/* Header with Deposit and Redeem buttons */}
      <div className="mb-4 flex items-center justify-end gap-2">
        <Button
          variant="outlined"
          size="medium"
          rounded
          onClick={handleDeposit}
          aria-label={isConnected ? "Deposit BTC" : "Connect wallet to deposit"}
        >
          {isConnected ? "Deposit" : "Connect Wallet"}
        </Button>
        <Button
          variant="outlined"
          size="medium"
          rounded
          onClick={handleRedeem}
          aria-label="Redeem BTC"
          disabled={!isConnected}
        >
          Redeem
        </Button>
      </div>

      {/* Desktop: Deposits Table, Mobile: Deposit Cards */}
      {isMobile ? (
        <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto">
          {deposits.map((deposit) => {
            const activity = allActivities.find((a) => a.id === deposit.id)!;
            return (
              <DepositMobileCard
                key={deposit.id}
                deposit={deposit}
                activity={activity}
                btcPublicKey={btcPublicKey}
                pendingPegins={pendingPegins}
                onSignClick={handleSignClick}
                onBroadcastClick={handleBroadcastClick}
              />
            );
          })}
        </div>
      ) : (
        <div className="max-h-[500px] overflow-x-auto overflow-y-auto bg-primary-contrast">
          <Table data={deposits} columns={columns} fluid />
        </div>
      )}

      {/* Payout Sign Modal - Opens when clicking Sign button from table */}
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

      {/* Broadcast Sign Modal - Opens when clicking Sign & Broadcast button */}
      {broadcastingActivity && ethAddress && (
        <BroadcastSignModal
          open={!!broadcastingActivity}
          onClose={handleBroadcastClose}
          activity={broadcastingActivity}
          depositorEthAddress={ethAddress}
          onSuccess={handleBroadcastSuccess}
        />
      )}

      {/* Broadcast Success Modal - Shows after successful broadcast */}
      <BroadcastSuccessModal
        open={broadcastSuccessOpen}
        onClose={handleBroadcastSuccessClose}
        amount={broadcastingActivity?.collateral.amount || "0"}
      />
    </div>
  );
}
