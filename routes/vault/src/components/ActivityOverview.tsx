import {
  Table,
  useIsMobile,
  VaultDetailCard,
  Avatar,
  type ColumnProps,
} from "@babylonlabs-io/core-ui";
import { useState } from "react";
import type { Activity } from "../types/activity";

// Hardcoded activity data
const HARDCODED_ACTIVITIES: Activity[] = [
  {
    id: "1",
    date: "14/10/2025",
    type: "Deposit",
    amount: "10 BTC ($1,126,941.61 USD)",
    transactionHash: "a1b2c3d4e5...f6g7h8i9j1",
  },
];

export function ActivityOverview() {
  const isMobile = useIsMobile();
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
          <Avatar url="/btc.png" alt="BTC" size="small" variant="circular" />
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
          className="text-sm text-accent-secondary hover:text-accent-primary transition-colors cursor-pointer"
          title="Click to copy"
        >
          {copiedHash === row.transactionHash ? "Copied!" : truncateHash(row.transactionHash)}
        </button>
      ),
    },
  ];

  return (
    <>
      {isMobile ? (
        <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto">
          {activities.length === 0 ? (
            <div className="py-8 text-center text-sm text-accent-secondary">
              Your activity will appear here.
            </div>
          ) : (
            activities.map((activity) => (
              <VaultDetailCard
                key={activity.id}
                id={activity.id}
                title={{
                  icons: ["/btc.png"],
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
                        className="text-sm text-accent-secondary hover:text-accent-primary transition-colors"
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
            ))
          )}
        </div>
      ) : (
        <div className="overflow-x-auto bg-primary-contrast max-h-[500px] overflow-y-auto">
          <Table data={activities} columns={columns} fluid />
        </div>
      )}
    </>
  );
}

