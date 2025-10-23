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
import { useState } from "react";

import {
  useVaultDepositState,
  VaultDepositStep,
} from "../state/VaultDepositState";
import {
  useVaultRedeemState,
  VaultRedeemStep,
} from "../state/VaultRedeemState";
import type { Deposit } from "../types/vault";

// Hardcoded deposit data
const HARDCODED_DEPOSITS: Deposit[] = [
  {
    id: "1",
    amount: 5,
    vaultProvider: {
      name: "Ironclad BTC",
      icon: "",
    },
    status: "In Use",
  },
  {
    id: "2",
    amount: 2,
    vaultProvider: {
      name: "Atlas Custody",
      icon: "",
    },
    status: "Available",
  },
  {
    id: "3",
    amount: 3,
    vaultProvider: {
      name: "Ironclad BTC",
      icon: "",
    },
    status: "Available",
  },
];

function EmptyState({ onDeposit }: { onDeposit: () => void }) {
  return (
    <div className="rounded-2xl bg-primary-contrast p-6">
      <div className="flex flex-col items-center">
        <img
          src="/mascot-bitcoin.png"
          alt="Supply collateral mascot"
          className="h-auto max-w-[240px]"
        />
        <div className="flex flex-col gap-1 text-center">
          <h4 className="text-lg font-semibold text-accent-primary">
            Supply Collateral BTC Trustlessly
          </h4>
          <p className="text-sm text-accent-secondary">
            Enter the amount of BTC you want to deposit and select a provider to
            secure it.
            <br />
            Your deposit will appear here once confirmed.
          </p>
        </div>
        <div className="mt-8">
          <Button
            variant="outlined"
            size="large"
            rounded
            onClick={onDeposit}
            aria-label="Add deposit"
          >
            Deposit
          </Button>
        </div>
      </div>
    </div>
  );
}

export function DepositOverview() {
  const isMobile = useIsMobile();
  const deposits = HARDCODED_DEPOSITS;
  const [selectedDepositIds, setSelectedDepositIds] = useState<
    Array<string | number>
  >([]);
  const { goToStep: goToDepositStep } = useVaultDepositState();
  const { goToStep: goToRedeemStep, setRedeemData } = useVaultRedeemState();

  const handleDeposit = () => {
    goToDepositStep(VaultDepositStep.FORM);
  };

  const handleRedeem = () => {
    if (selectedDepositIds.length > 0) {
      setRedeemData(selectedDepositIds as string[]);
      goToRedeemStep(VaultRedeemStep.FORM);
    }
  };

  if (deposits.length === 0) {
    return <EmptyState onDeposit={handleDeposit} />;
  }

  const columns: ColumnProps<Deposit>[] = [
    {
      key: "amount",
      header: "BTC Vault",
      render: (_value: unknown, row: Deposit) => (
        <div className="flex items-center gap-2">
          <AvatarGroup size="small">
            <Avatar url="/btc.png" alt="BTC" size="small" variant="circular" />
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
        const statusMap = {
          // Hardcoded statuses for now
          Available: "inactive" as const,
          Pending: "pending" as const,
          "In Use": "active" as const,
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
          aria-label="Deposit BTC"
        >
          Deposit
        </Button>
        <Button
          variant="outlined"
          size="medium"
          rounded
          disabled={selectedDepositIds.length === 0}
          onClick={handleRedeem}
          aria-label="Redeem selected deposits"
        >
          Redeem
        </Button>
      </div>

      {/* Desktop: Deposits Table, Mobile: Deposit Cards */}
      {isMobile ? (
        <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto">
          {deposits.map((deposit) => {
            const statusMap = {
              Available: "inactive" as const,
              Pending: "pending" as const,
              "In Use": "active" as const,
            };
            return (
              <VaultDetailCard
                key={deposit.id}
                id={deposit.id}
                title={{
                  icons: ["/btc.png"],
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
