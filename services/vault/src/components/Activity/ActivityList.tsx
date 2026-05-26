import { Select } from "@babylonlabs-io/core-ui";
import { useState } from "react";

import { COPY } from "@/copy";
import type { ActivityLog, ActivityType } from "@/types/activityLog";

import { ActivityCard } from "./ActivityCard";
import { ActivityEmptyState } from "./ActivityEmptyState";

const ALL_FILTER = "all" as const;

const ACTIVITY_TYPE_ORDER: readonly ActivityType[] = [
  "Deposit",
  "Withdraw",
  "Borrow",
  "Repay",
  "Redeem",
  "Liquidation",
  "Claim Expired",
  "Pending Deposit",
];

type FilterValue = ActivityType | typeof ALL_FILTER;

function isFilterValue(value: string | number): value is FilterValue {
  if (value === ALL_FILTER) return true;
  return ACTIVITY_TYPE_ORDER.some((t) => t === value);
}

interface ActivityListProps {
  activities: ActivityLog[];
  isConnected: boolean;
}

export function ActivityList({ activities, isConnected }: ActivityListProps) {
  const [filter, setFilter] = useState<FilterValue>(ALL_FILTER);

  const visible =
    filter === ALL_FILTER
      ? activities
      : activities.filter((r) => r.type === filter);

  const options = [
    { value: ALL_FILTER, label: COPY.activity.filterAll },
    ...ACTIVITY_TYPE_ORDER.map((type) => ({
      value: type,
      label: COPY.activity.filterTypes[type],
    })),
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-[24px] font-normal text-accent-primary">
          {COPY.activity.pageTitle}
        </h2>
        <div className="w-[220px]">
          <Select
            value={filter}
            options={options}
            onSelect={(value) => {
              if (isFilterValue(value)) setFilter(value);
            }}
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <ActivityEmptyState isConnected={isConnected} />
      ) : (
        <ul role="list" className="flex flex-col gap-4">
          {visible.map((r) => (
            <li key={r.id}>
              <ActivityCard row={r} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
