/**
 * ActivityTable Component
 * Displays aggregated user activities across all applications
 */

import { getNetworkConfigETH } from "@babylonlabs-io/config";
import type { ColumnProps } from "@babylonlabs-io/core-ui";
import { Avatar, Table, trim } from "@babylonlabs-io/core-ui";

import type { ActivityLog } from "../../types/activityLog";
import { formatDateTime } from "../../utils/formatting";

interface ActivityTableProps {
  activities: ActivityLog[];
}

/**
 * Generate block explorer URL for a transaction hash
 */
function getExplorerTxUrl(txHash: string): string {
  const { explorerUrl } = getNetworkConfigETH();
  return `${explorerUrl}/tx/${txHash}`;
}

export function ActivityTable({ activities }: ActivityTableProps) {
  const columns: ColumnProps<ActivityLog>[] = [
    {
      key: "date",
      header: "Date",
      headerClassName: "w-[20%]",
      cellClassName: "w-[20%]",
      sorter: (a, b) => b.date.getTime() - a.date.getTime(),
      render: (_value, row) => (
        <span className="text-sm text-accent-primary">
          {formatDateTime(row.date)}
        </span>
      ),
    },
    {
      key: "application",
      header: "Application",
      headerClassName: "w-[15%]",
      cellClassName: "w-[15%]",
      render: (_value, row) => (
        <div className="flex items-center gap-2">
          <Avatar
            url={row.application.logoUrl}
            alt={row.application.name}
            size="small"
          />
          <span className="text-sm text-accent-primary">
            {row.application.name}
          </span>
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      headerClassName: "w-[15%]",
      cellClassName: "w-[15%]",
      render: (_value, row) => (
        <span className="text-sm text-accent-primary">{row.type}</span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      headerClassName: "w-[25%]",
      cellClassName: "w-[25%]",
      render: (_value, row) => (
        <div className="flex items-center gap-2">
          {row.amount.icon && (
            <Avatar
              url={row.amount.icon}
              alt={row.amount.symbol}
              size="small"
            />
          )}
          <span className="text-sm text-accent-primary">
            {row.amount.value} {row.amount.symbol}
          </span>
        </div>
      ),
    },
    {
      key: "transactionHash",
      header: "Transaction Hash",
      headerClassName: "w-[25%]",
      cellClassName: "w-[25%]",
      render: (_value, row) => (
        <a
          href={getExplorerTxUrl(row.transactionHash)}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-sm text-accent-secondary hover:text-primary-main hover:underline"
        >
          {trim(row.transactionHash)}
        </a>
      ),
    },
  ];

  return <Table data={activities} columns={columns} fluid stylePreset="card" />;
}
