import { Avatar, Heading } from "@babylonlabs-io/core-ui";
import { useEffect, useState } from "react";

import { COPY } from "@/copy";
import type { ActivityRow, ActivityType } from "@/types/activityLog";

import { ActivityCard } from "./ActivityCard";
import { ActivityEmptyState } from "./ActivityEmptyState";
import { FilterDropdown } from "./FilterDropdown";
import { LiquidationGroupCard } from "./LiquidationGroupCard";

// Single-app surface today. When multi-app ships this becomes an app picker
// fed from the applications registry.
const AAVE_LOGO_URL = "/images/aave.svg";

// Only the ActivityTypes that appear as filter options in the Figma menu.
// `Redeem` and `Pending Deposit` rows still render in the list but are not
// directly filterable. `claim_expired` is remapped to a refunded Deposit
// upstream, so it falls under the `Deposit` filter automatically.
const FILTER_OPTIONS = (
  Object.entries(COPY.activity.filterTypes) as Array<[ActivityType, string]>
).map(([value, label]) => ({ value, label }));

interface ActivityListProps {
  activities: ActivityRow[];
  isConnected: boolean;
}

export function ActivityList({ activities, isConnected }: ActivityListProps) {
  const [filter, setFilter] = useState<ActivityType | null>(null);

  // The filter control is hidden when the wallet disconnects, so leaving the
  // selection in place would trap the user on an empty-but-filtered list with
  // no visible way to clear it. Reset on disconnect.
  useEffect(() => {
    if (!isConnected) setFilter(null);
  }, [isConnected]);

  const visible = filter
    ? activities.filter((r) => r.type === filter)
    : activities;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <Heading
          variant="h5"
          as="h2"
          className="font-normal text-accent-primary"
        >
          {COPY.activity.pageTitle}
        </Heading>
        {isConnected && (
          <div className="flex items-center gap-4">
            <Avatar url={AAVE_LOGO_URL} alt="Aave" size="small" />
            <FilterDropdown
              value={filter}
              placeholder={COPY.activity.filterAll}
              options={FILTER_OPTIONS}
              onChange={setFilter}
            />
          </div>
        )}
      </div>

      {visible.length === 0 ? (
        <ActivityEmptyState
          isConnected={isConnected}
          isFiltered={filter !== null}
        />
      ) : (
        // Scroll container: min-h keeps the card substantial when there are
        // only a handful of rows; max-h caps tall histories so the page never
        // grows arbitrarily. Only the row list scrolls — the title + filter
        // sit outside the container and stay pinned.
        <div className="max-h-[600px] min-h-[240px] overflow-y-auto">
          <ul role="list" className="flex flex-col gap-4">
            {visible.map((r) => (
              <li key={r.id}>
                {r.kind === "liquidationGroup" ? (
                  <LiquidationGroupCard row={r} />
                ) : (
                  <ActivityCard row={r} />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
