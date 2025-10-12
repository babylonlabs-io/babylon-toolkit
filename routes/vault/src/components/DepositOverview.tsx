import {
  Button,
  Table,
  Menu,
  MenuItem,
  ThreeDotsMenuIcon,
  useIsMobile,
  type ColumnProps,
} from "@babylonlabs-io/core-ui";
import { useNavigate } from "react-router";
import type { Deposit } from "../types/vault";

// Hardcoded deposit data
const HARDCODED_DEPOSITS: Deposit[] = [
  {
    id: "1",
    amount: 5,
    vaultProvider: {
      name: "Ironclad BTC",
      icon: "🔷",
    },
    status: "Available",
    totalLiquidity: "4.2%",
  },
  {
    id: "2",
    amount: 2,
    vaultProvider: {
      name: "Atlas Custody",
      icon: "🟠",
    },
    status: "Available",
    totalLiquidity: "4.2%",
  },
  {
    id: "3",
    amount: 3,
    vaultProvider: {
      name: "Ironclad BTC",
      icon: "🔷",
    },
    status: "Available",
    totalLiquidity: "4.2%",
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
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const deposits = HARDCODED_DEPOSITS;

  const handleBorrow = () => {
    navigate("/vault/borrow");
  };

  if (deposits.length === 0) {
    return <EmptyState />;
  }

  const columns: ColumnProps<Deposit>[] = [
    {
      key: "amount",
      header: "Deposit",
      render: (_value: unknown, row: Deposit) => (
        <div className="flex items-center gap-2">
          <span className="text-sm text-accent-primary">₿</span>
          <span className="text-sm font-medium text-accent-primary">
            {row.amount} BTC
          </span>
        </div>
      ),
    },
    {
      key: "vaultProvider",
      header: "Vault Provider(s)",
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
      render: (_value: unknown, row: Deposit) => (
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          <span className="text-sm text-accent-primary">{row.status}</span>
        </div>
      ),
    },
    {
      key: "totalLiquidity",
      header: "Total Liquidity",
      render: (_value: unknown, row: Deposit) => (
        <span className="text-sm text-accent-primary">{row.totalLiquidity}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (_value: unknown, row: Deposit) => (
        <div className="flex justify-end">
          <Menu
            trigger={
              <button
                className="rounded p-1 hover:bg-surface-secondary"
                aria-label="Actions"
              >
                <ThreeDotsMenuIcon size={20} variant="accent-primary" />
              </button>
            }
            placement="bottom-end"
          >
            <MenuItem name="Action 1" onClick={() => console.log("Action 1", row.id)} />
            <MenuItem name="Action 2" onClick={() => console.log("Action 2", row.id)} />
          </Menu>
        </div>
      ),
    },
  ];

  return (
    <div className="relative">
      {/* Desktop Borrow Button */}
      {!isMobile && (
        <div className="mb-4 flex justify-end">
          <Button
            variant="contained"
            color="primary"
            size="medium"
            onClick={handleBorrow}
          >
            Borrow
          </Button>
        </div>
      )}

      {/* Deposits Table */}
      <div className="overflow-x-auto rounded-2xl bg-primary-contrast">
        <Table data={deposits} columns={columns} fluid />
      </div>

      {/* Mobile Sticky Borrow Button */}
      {isMobile && (
        <div className="fixed bottom-0 left-0 right-0 z-10 border-t border-surface-secondary bg-surface p-4">
          <Button
            variant="contained"
            color="primary"
            size="large"
            fluid
            onClick={handleBorrow}
          >
            Borrow
          </Button>
        </div>
      )}
    </div>
  );
}
