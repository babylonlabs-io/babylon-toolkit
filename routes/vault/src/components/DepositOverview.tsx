import {
  Table,
  useIsMobile,
  StatusBadge,
  Hint,
  VaultDetailCard,
  Avatar,
  AvatarGroup,
  type ColumnProps,
} from "@babylonlabs-io/core-ui";
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

function EmptyState() {
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
      </div>
    </div>
  );
}

export function DepositOverview() {
  const isMobile = useIsMobile();
  const deposits = HARDCODED_DEPOSITS;

  if (deposits.length === 0) {
    return <EmptyState />;
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
          "Available": "inactive" as const,
          "Pending": "pending" as const,
          "In Use": "active" as const,
        };
        return (
          <div className="flex items-center gap-2">
            <StatusBadge
              status={statusMap[row.status]}
              label={row.status}
            />
            <Hint tooltip={statusMap[row.status]} placement="top" />
          </div>
        );
      },
    },
  ];

  return (
    <div className="relative">

      {/* Desktop: Deposits Table, Mobile: Deposit Cards */}
      {isMobile ? (
        <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto">
          {deposits.map((deposit) => {
            const statusMap = {
              "Available": "inactive" as const,
              "Pending": "pending" as const,
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
                        <span className="text-base">{deposit.vaultProvider.icon}</span>
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
                actions={[
                  { name: "Withdraw Deposit", action: "withdraw" },
                ]}
                onAction={(depositId, action) =>
                  console.log(`Action ${action} on deposit ${depositId}`)
                }
              />
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto bg-primary-contrast max-h-[500px] overflow-y-auto">
          <Table data={deposits} columns={columns} fluid />
        </div>
      )}
    </div>
  );
}
