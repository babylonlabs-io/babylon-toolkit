import {
  Avatar,
  Table,
  useIsMobile,
  VaultDetailCard,
  type ColumnProps,
} from "@babylonlabs-io/core-ui";
import { useState } from "react";

import { useBTCWallet, useETHWallet } from "../../../context/wallet";
import type { Activity } from "../../../types/activity";

// Hardcoded activity data
const HARDCODED_ACTIVITIES: Activity[] = [];

export function Activity() {
  const isMobile = useIsMobile();
  const { connected: btcConnected } = useBTCWallet();
  const { connected: ethConnected } = useETHWallet();
  const isConnected = btcConnected && ethConnected;

  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const activities: Activity[] = HARDCODED_ACTIVITIES;

  const handleCopyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const truncateHash = (hash: string) => {
    if (hash.length <= 20) return hash;
    return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
  };

  const columns: ColumnProps<Activity>[] = [
    {
      key: "date",
      header: "Date",
      render: (_value: unknown, row: Activity) => (
        <span className="text-sm text-accent-primary">{row.date}</span>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (_value: unknown, row: Activity) => (
        <span className="text-sm text-accent-primary">{row.type}</span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      render: (_value: unknown, row: Activity) => (
        <div className="flex items-center gap-2">
          <Avatar
            url="/images/btc.png"
            alt="BTC"
            size="small"
            variant="circular"
          />
          <span className="text-sm text-accent-primary">{row.amount}</span>
        </div>
      ),
    },
    {
      key: "transactionHash",
      header: "Transaction Hash",
      render: (_value: unknown, row: Activity) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleCopyHash(row.transactionHash);
          }}
          className="cursor-pointer text-sm text-accent-secondary transition-colors hover:text-accent-primary"
          title="Click to copy"
        >
          {copiedHash === row.transactionHash
            ? "Copied!"
            : truncateHash(row.transactionHash)}
        </button>
      ),
    },
  ];

  // Show empty state when not connected OR when connected but no data
  if (!isConnected || activities.length === 0) {
    return (
      <div className="max-h-[500px] overflow-x-auto overflow-y-auto bg-primary-contrast">
        <div className="flex min-h-[200px] items-center justify-center px-8 py-16 text-center text-sm text-accent-secondary">
          Your transactions will be shown here
        </div>
      </div>
    );
  }

  return (
    <>
      {isMobile ? (
        <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto">
          {activities.map((activity) => (
            <VaultDetailCard
              key={activity.id}
              id={activity.id}
              title={{
                icons: ["/images/btc.png"],
                text: activity.type,
              }}
              details={[
                { label: "Date", value: activity.date },
                { label: "Amount", value: activity.amount },
                {
                  label: "Transaction Hash",
                  value: (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyHash(activity.transactionHash);
                      }}
                      className="text-sm text-accent-secondary transition-colors hover:text-accent-primary"
                    >
                      {copiedHash === activity.transactionHash
                        ? "Copied!"
                        : truncateHash(activity.transactionHash)}
                    </button>
                  ),
                },
              ]}
              actions={[]}
            />
          ))}
        </div>
      ) : (
        <div className="max-h-[500px] overflow-x-auto overflow-y-auto bg-primary-contrast">
          <Table data={activities} columns={columns} fluid />
        </div>
      )}
    </>
  );
}
