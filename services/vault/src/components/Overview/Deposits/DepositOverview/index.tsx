import {
  Avatar,
  AvatarGroup,
  Button,
  Checkbox,
  StatusBadge,
  Table,
  useIsMobile,
  VaultDetailCard,
  type ColumnProps,
} from "@babylonlabs-io/core-ui";
import { useWalletConnect } from "@babylonlabs-io/wallet-connector";
import { useMemo, useState } from "react";

import { useBTCWallet, useETHWallet } from "../../../../context/wallet";
import { useVaultDeposits } from "../../../../hooks/useVaultDeposits";
import { getPeginState } from "../../../../models/peginStateMachine";
import type { VaultActivity } from "../../../../types/activity";
import type { Deposit } from "../../../../types/vault";
import {
  useVaultDepositState,
  VaultDepositStep,
} from "../state/VaultDepositState";

function EmptyState({
  onDeposit,
  isConnected,
}: {
  onDeposit: () => void;
  isConnected: boolean;
}) {
  return (
    <div className="max-h-[500px] overflow-x-auto overflow-y-auto bg-primary-contrast">
      <div className="flex min-h-[200px] items-center justify-center p-6">
        <div className="flex flex-col items-center">
          <img src="/images/btc.png" alt="Bitcoin" className="mb-4 h-16 w-16" />
          <div className="flex flex-col gap-2 text-center">
            <h4 className="text-lg font-semibold text-accent-primary">
              Deposit BTC Trustlessly
            </h4>
            <p className="text-sm text-accent-secondary">
              {isConnected
                ? "Your deposit will appear here once confirmed."
                : "Connect your wallet to start depositing BTC."}
            </p>
          </div>
          <div className="mt-6">
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

export function DepositOverview() {
  const isMobile = useIsMobile();
  const { connected: btcConnected } = useBTCWallet();
  const { connected: ethConnected, address: ethAddress } = useETHWallet();
  const isConnected = btcConnected && ethConnected;
  const { open: openWalletModal } = useWalletConnect();

  // Fetch real deposit data
  const { activities } = useVaultDeposits(
    ethAddress as `0x${string}` | undefined,
  );

  // Transform VaultActivity to Deposit format
  const deposits: Deposit[] = useMemo(() => {
    return activities.map((activity: VaultActivity) => {
      // Get state from state machine
      const state = getPeginState(activity.contractStatus ?? 0);

      return {
        id: activity.id,
        amount: parseFloat(activity.collateral.amount),
        vaultProvider: {
          name: activity.providers[0]?.name || "Unknown Provider",
          icon: activity.providers[0]?.icon || "",
        },
        status: state.displayLabel as "Available" | "Pending" | "In Use",
      };
    });
  }, [activities]);

  const [selectedDepositIds, setSelectedDepositIds] = useState<
    Array<string | number>
  >([]);
  const { goToStep: goToDepositStep } = useVaultDepositState();

  const handleDeposit = () => {
    if (!isConnected) {
      // Open wallet connection modal
      openWalletModal();
    } else {
      // Already connected, open deposit modal directly
      goToDepositStep(VaultDepositStep.FORM);
    }
  };

  // Show empty state when not connected OR when connected but no data
  if (!isConnected || deposits.length === 0) {
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
      key: "vaultProvider",
      header: "Yield Provider",
      render: (_value: unknown, row: Deposit) => (
        <div className="flex items-center gap-2">
          <span className="text-base">{row.vaultProvider.icon}</span>
          <span className="text-sm text-accent-primary">
            {row.vaultProvider.name}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (_value: unknown, row: Deposit) => {
        const statusMap: Record<
          "Available" | "Pending" | "In Use",
          "inactive" | "pending" | "active"
        > = {
          Available: "inactive",
          Pending: "pending",
          "In Use": "active",
        };
        return (
          <StatusBadge status={statusMap[row.status]} label={row.status} />
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
        {/* TODO: Uncomment when redeem flow is ready */}
        {/* <Button
          variant="outlined"
          size="medium"
          rounded
          disabled={selectedDepositIds.length === 0}
          onClick={handleRedeem}
          aria-label="Redeem selected deposits"
        >
          Redeem
        </Button> */}
      </div>

      {/* Desktop: Deposits Table, Mobile: Deposit Cards */}
      {isMobile ? (
        <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto">
          {deposits.map((deposit) => {
            const statusMap: Record<
              "Available" | "Pending" | "In Use",
              "inactive" | "pending" | "active"
            > = {
              Available: "inactive",
              Pending: "pending",
              "In Use": "active",
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
                    label: "Yield Provider",
                    value: (
                      <div className="flex items-center gap-2">
                        <span className="text-base">
                          {deposit.vaultProvider.icon}
                        </span>
                        <span className="text-sm text-accent-primary">
                          {deposit.vaultProvider.name}
                        </span>
                      </div>
                    ),
                  },
                  {
                    label: "Status",
                    value: (
                      <StatusBadge
                        status={statusMap[deposit.status]}
                        label={deposit.status}
                      />
                    ),
                  },
                ]}
              />
            );
          })}
        </div>
      ) : (
        <div className="max-h-[500px] overflow-x-auto overflow-y-auto bg-primary-contrast">
          <Table
            data={deposits}
            columns={columns}
            fluid
            selectable
            selectedRows={selectedDepositIds}
            onSelectedRowsChange={setSelectedDepositIds}
            checkboxPosition="right"
            showSelectAll={false}
            renderCheckbox={(checked) => (
              <Checkbox
                checked={checked}
                variant="secondary"
                showLabel={false}
              />
            )}
          />
        </div>
      )}
    </div>
  );
}
