import { Avatar } from "@babylonlabs-io/core-ui";
import { useState } from "react";

import { COPY } from "@/copy";
import type { ActivityLog, ActivityType } from "@/types/activityLog";

import { ActivityCard } from "./ActivityCard";
import { ActivityEmptyState } from "./ActivityEmptyState";
import { FilterDropdown } from "./FilterDropdown";

// Single-app surface today. When multi-app ships this becomes an app picker
// fed from the applications registry.
const AAVE_LOGO_URL = "/images/aave.svg";

const ALL_FILTER = "all" as const;

type FilterValue = ActivityType | typeof ALL_FILTER;

const FILTER_ENTRIES = Object.entries(COPY.activity.filterTypes) as Array<
  [ActivityType, string]
>;

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
    ...FILTER_ENTRIES.map(([value, label]) => ({ value, label })),
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-[24px] font-normal text-accent-primary">
          {COPY.activity.pageTitle}
        </h2>
        {isConnected && (
          <div className="flex items-center gap-4">
            <Avatar url={AAVE_LOGO_URL} alt="Aave" size="small" />
            <FilterDropdown
              value={filter}
              options={options}
              onChange={setFilter}
            />
          </div>
        )}
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
