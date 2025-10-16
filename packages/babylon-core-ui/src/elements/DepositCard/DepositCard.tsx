import { Card } from "../../components/Card";
import { Menu, MenuItem } from "../../components/Menu";
import { ThreeDotsMenuIcon } from "../../components/Icons";
import { StatusBadge } from "../StatusBadge";

interface DepositCardProps {
  deposit: {
    id: string;
    amount: number;
    vaultProvider: {
      name: string;
      icon: string;
    };
    status: "Available" | "Pending" | "In Use";
    totalLiquidity: string;
  };
  onAction?: (depositId: string, action: string) => void;
}

export function DepositCard({ deposit, onAction }: DepositCardProps) {
  const statusMap = {
    "Available": "active" as const,
    "Pending": "pending" as const,
    "In Use": "inactive" as const,
  };

  return (
    <Card className="flex flex-col gap-3 p-4">
      {/* Header with Amount and Menu */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/btc.png" alt="BTC" className="h-6 w-6" />
          <span className="text-base font-semibold text-accent-primary">
            {deposit.amount} BTC
          </span>
        </div>
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
          <MenuItem
            name="Withdraw Deposit"
            onClick={() => onAction?.(deposit.id, "withdraw")}
          />
        </Menu>
      </div>

      {/* Vault Provider */}
      <div className="flex flex-col gap-1">
        <span className="text-xs text-accent-secondary">Vault Provider(s)</span>
        <div className="flex items-center gap-2">
          <span className="text-base">{deposit.vaultProvider.icon}</span>
          <span className="text-sm text-accent-primary">
            {deposit.vaultProvider.name}
          </span>
        </div>
      </div>

      {/* Status */}
      <div className="flex flex-col gap-1">
        <span className="text-xs text-accent-secondary">Status</span>
        <StatusBadge
          status={statusMap[deposit.status]}
          label={deposit.status}
        />
      </div>

      {/* Total Liquidity */}
      <div className="flex flex-col gap-1">
        <span className="text-xs text-accent-secondary">Total Liquidity</span>
        <span className="text-sm text-accent-primary">
          {deposit.totalLiquidity}
        </span>
      </div>
    </Card>
  );
}

