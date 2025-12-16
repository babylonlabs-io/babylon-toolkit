/**
 * VaultsTable Component
 * Displays vaults with BTC Vault, Vault Provider, Status, and Actions columns
 */

import type { ColumnProps } from "@babylonlabs-io/core-ui";
import { Avatar, Button, Card, Popover, Table } from "@babylonlabs-io/core-ui";
import { useRef, useState } from "react";

import { InfoIcon, MenuButton } from "@/components/shared";

import { VaultsEmptyState } from "./VaultsEmptyState";

export interface VaultData {
  id: string;
  amount: string;
  amountValue: number;
  usdValue: string;
  usdValueNumber: number;
  provider: {
    name: string;
    icon: string;
  };
  status: "In use" | "Available";
}

interface VaultsTableProps {
  vaults: VaultData[];
  isConnected: boolean;
  onRedeem?: (vaultId: string) => void;
  onDeposit?: () => void;
}

function ActionMenu({
  vaultId,
  onRedeem,
}: {
  vaultId: string;
  onRedeem?: (vaultId: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleRedeem = () => {
    onRedeem?.(vaultId);
    setIsOpen(false);
  };

  return (
    <>
      <MenuButton ref={buttonRef} onClick={() => setIsOpen(!isOpen)} />

      <Popover
        open={isOpen}
        anchorEl={buttonRef.current}
        placement="bottom-end"
        offset={[0, 8]}
        onClickOutside={() => setIsOpen(false)}
      >
        <div className="min-w-[160px] rounded-lg border border-secondary-strokeLight bg-primary-contrast p-1 shadow-lg">
          <Button
            variant="ghost"
            onClick={handleRedeem}
            className="w-full justify-start rounded-lg text-left text-base text-accent-primary hover:bg-secondary-highlight dark:hover:bg-primary-main"
          >
            Redeem BTC
          </Button>
        </div>
      </Popover>
    </>
  );
}

export function VaultsTable({
  vaults,
  isConnected,
  onRedeem,
  onDeposit,
}: VaultsTableProps) {
  const columns: ColumnProps<VaultData>[] = [
    {
      key: "vault",
      header: "BTC Vault",
      headerClassName: "w-[50%]",
      cellClassName: "w-[50%]",
      sorter: (a, b) => a.amountValue - b.amountValue,
      render: (_value, row) => (
        <div className="flex items-center gap-3">
          <Avatar
            url="https://assets.coingecko.com/coins/images/1/standard/bitcoin.png?1696501400"
            alt="BTC"
            size="small"
          />
          <span className="text-base text-accent-primary">
            {row.amount}{" "}
            <span className="text-accent-secondary">({row.usdValue})</span>
          </span>
        </div>
      ),
    },
    {
      key: "provider",
      header: "Vault Provider",
      headerClassName: "w-[20%]",
      cellClassName: "w-[20%]",
      render: (_value, row) => (
        <Avatar url={row.provider.icon} alt={row.provider.name} size="small" />
      ),
    },
    {
      key: "status",
      header: "Status",
      headerClassName: "w-[20%]",
      cellClassName: "w-[20%]",
      sorter: (a, b) => a.status.localeCompare(b.status),
      render: (_value, row) => (
        <div className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full ${
              row.status === "In use" ? "bg-green-500" : "bg-gray-400"
            }`}
          />
          <span className="text-sm text-accent-primary">{row.status}</span>
          <InfoIcon />
        </div>
      ),
    },
    {
      key: "action",
      header: "",
      headerClassName: "w-[10%]",
      cellClassName: "w-[10%]",
      render: (_value, row) => (
        <div className="flex justify-end">
          <ActionMenu vaultId={row.id} onRedeem={onRedeem} />
        </div>
      ),
    },
  ];

  // Show empty state if no vaults
  if (vaults.length === 0) {
    return (
      <Card className="w-full">
        <div className="w-full space-y-6">
          <h2 className="text-[24px] font-normal text-accent-primary">
            Vaults
          </h2>
          <VaultsEmptyState
            isConnected={isConnected}
            onDeposit={onDeposit || (() => console.log("Deposit clicked"))}
          />
        </div>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <div className="w-full space-y-6">
        <h2 className="text-[24px] font-normal text-accent-primary">Vaults</h2>
        <Table data={vaults} columns={columns} fluid stylePreset="card" />
      </div>
    </Card>
  );
}
