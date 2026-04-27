/**
 * ActivityTable Component
 * Displays aggregated user activities across all applications
 */

import { getNetworkConfigETH } from "@babylonlabs-io/config";
import type { ColumnProps } from "@babylonlabs-io/core-ui";
import { Avatar, Table } from "@babylonlabs-io/core-ui";

import { getNetworkConfigBTC } from "@/config";
import { stripHexPrefix } from "@/utils/btc";

import type { ActivityChain, ActivityLog } from "../../types/activityLog";
import { formatDateTime } from "../../utils/formatting";
import { CopyableHash } from "../shared/CopyableHash";

interface ActivityTableProps {
  activities: ActivityLog[];
}

/** mempoolApiUrl is shaped like "https://mempool.space/signet" — tx page is `{base}/tx/{txid}`. */
function getBtcExplorerTxUrl(txHash: string): string {
  const btcConfig = getNetworkConfigBTC();
  return `${btcConfig.mempoolApiUrl}/tx/${stripHexPrefix(txHash)}`;
}

function getEthExplorerTxUrl(txHash: string): string {
  const { explorerUrl } = getNetworkConfigETH();
  return `${explorerUrl}/tx/${txHash}`;
}

function getExplorerTxUrl(chain: ActivityChain, txHash: string): string {
  return chain === "BTC"
    ? getBtcExplorerTxUrl(txHash)
    : getEthExplorerTxUrl(txHash);
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
        <span
          className={`text-sm ${row.isPending ? "text-accent-secondary" : "text-accent-primary"}`}
        >
          {row.type}
        </span>
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
      render: (_value, row) => {
        if (row.isPending || !row.transactionHash) {
          return (
            <span className="text-sm italic text-accent-secondary">
              Pending...
            </span>
          );
        }
        return (
          <CopyableHash
            hash={row.transactionHash}
            chain={row.chain}
            explorerUrl={getExplorerTxUrl(row.chain, row.transactionHash)}
            showChainBadge
          />
        );
      },
    },
  ];

  return <Table data={activities} columns={columns} fluid stylePreset="card" />;
}
