/**
 * VaultsTable Component
 * Displays vaults with BTC Vault, Vault Provider, Status, and Actions columns
 */

import type { ColumnProps } from "@babylonlabs-io/core-ui";
import { Avatar, Button, Card, Popover, Table } from "@babylonlabs-io/core-ui";
import { useRef, useState } from "react";

import { EmptyState, InfoIcon, MenuButton } from "@/components/shared";
import { getNetworkConfigBTC } from "@/config";
import { useConnection } from "@/context/wallet";
import { PEGIN_DISPLAY_LABELS } from "@/models/peginStateMachine";
import { formatBtcValue, formatUsdValue } from "@/utils/formatting";

import type { VaultData } from "../../../../types";

const btcConfig = getNetworkConfigBTC();

interface VaultsTableProps {
  vaults: VaultData[];
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
            Redeem {btcConfig.coinSymbol}
          </Button>
        </div>
      </Popover>
    </>
  );
}

export function VaultsTable({ vaults, onRedeem, onDeposit }: VaultsTableProps) {
  const { isConnected } = useConnection();

  const columns: ColumnProps<VaultData>[] = [
    {
      key: "vault",
      header: `${btcConfig.coinSymbol} Vault`,
      headerClassName: "w-[50%]",
      cellClassName: "w-[50%]",
      sorter: (a, b) => a.amount - b.amount,
      render: (_value, row) => (
        <div className="flex items-center gap-3">
          <Avatar
            url={btcConfig.icon}
            alt={btcConfig.coinSymbol}
            size="small"
          />
          <span className="text-base text-accent-primary">
            {formatBtcValue(row.amount)}{" "}
            <span className="text-accent-secondary">
              ({formatUsdValue(row.usdValue)})
            </span>
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
              row.status === PEGIN_DISPLAY_LABELS.IN_USE
                ? "bg-green-500"
                : "bg-gray-400"
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

  // Show empty state if no vaults or wallet is disconnected
  // When disconnected, don't show cached vault data
  if (vaults.length === 0 || !isConnected) {
    const emptyStateTitle = isConnected
      ? `You have no ${btcConfig.coinSymbol} Vaults available.`
      : `Please connect your wallet to view your ${btcConfig.coinSymbol} collateral.`;

    const emptyStateDescription = isConnected
      ? `Deposit ${btcConfig.coinSymbol} to create your first vault and enable borrowing.`
      : undefined;

    return (
      <Card className="w-full">
        <div className="w-full space-y-6">
          <h2 className="text-[24px] font-normal text-accent-primary">
            Vaults
          </h2>
          <EmptyState
            avatarUrl={btcConfig.icon}
            avatarAlt={btcConfig.name}
            title={emptyStateTitle}
            description={emptyStateDescription}
            isConnected={isConnected}
            actionLabel={`Deposit ${btcConfig.coinSymbol}`}
            onAction={onDeposit || (() => console.log("Deposit clicked"))}
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
