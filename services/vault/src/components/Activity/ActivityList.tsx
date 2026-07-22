import { Avatar, Heading, useIsMobile } from "@babylonlabs-io/core-ui";
import { useEffect, useState } from "react";
import { twJoin } from "tailwind-merge";

import { FeatureFlags } from "@/config";
import { COPY } from "@/copy";
import type { ActivityRow, ActivityType } from "@/types/activityLog";
import { formatActivityDateGroup } from "@/utils/formatting";

import { ActivityCard } from "./ActivityCard";
import { ActivityEmptyState } from "./ActivityEmptyState";
import { ActivityRowV3 } from "./ActivityRowV3";
import { FilterDropdown } from "./FilterDropdown";
import { LiquidationGroupCard } from "./LiquidationGroupCard";

interface ActivityDateGroup {
  label: string;
  rows: ActivityRow[];
}

// Buckets the (already newest-first) rows under date-group headers, preserving
// order: each row keeps its position and groups appear in first-seen order.
function groupByDate(
  rows: ActivityRow[],
  reference: Date,
): ActivityDateGroup[] {
  const labels = {
    today: COPY.activity.dateToday,
    yesterday: COPY.activity.dateYesterday,
  };
  const ordered: ActivityDateGroup[] = [];
  const byLabel = new Map<string, ActivityDateGroup>();
  for (const row of rows) {
    const label = formatActivityDateGroup(row.date, reference, labels);
    let group = byLabel.get(label);
    if (!group) {
      group = { label, rows: [] };
      byLabel.set(label, group);
      ordered.push(group);
    }
    group.rows.push(row);
  }
  return ordered;
}

function ActivityRow({ row }: { row: ActivityRow }) {
  return row.kind === "liquidationGroup" ? (
    <LiquidationGroupCard row={row} />
  ) : (
    <ActivityRowV3 row={row} />
  );
}

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
  const isMobile = useIsMobile();
  const isV3 = FeatureFlags.isV3UiEnabled;
  // v3 desktop replaces this in-page heading with the persistent header's
  // page title; v3 mobile has no header title slot (Header only shows it on
  // desktop), so the heading must stay to avoid a page with no title at all.
  const hideHeading = isV3 && !isMobile;
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
      {(!hideHeading || isConnected) && (
        <div
          className={twJoin(
            "flex items-center gap-4",
            hideHeading ? "justify-end" : "justify-between",
          )}
        >
          {!hideHeading && (
            <Heading
              variant="h5"
              as="h2"
              className="font-normal text-accent-primary"
            >
              {COPY.activity.pageTitle}
            </Heading>
          )}
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
      )}

      {visible.length === 0 ? (
        <ActivityEmptyState
          isConnected={isConnected}
          isFiltered={filter !== null}
        />
      ) : isV3 ? (
        // v3: rows grouped under date headers, each group a rounded card with
        // divider-separated rows (matches the Figma "after deposit" frame).
        <div className="flex flex-col gap-6">
          {groupByDate(visible, new Date()).map((group) => (
            <div key={group.label} className="flex flex-col gap-3">
              <p className="text-sm leading-[1.43] tracking-[0.17px] text-accent-secondary">
                {group.label}
              </p>
              <ul
                role="list"
                className="overflow-hidden rounded-lg bg-secondary-highlight"
              >
                {group.rows.map((r, index) => (
                  <li
                    key={r.id}
                    className={
                      index > 0
                        ? "border-t border-secondary-strokeLight dark:border-secondary-strokeDark"
                        : ""
                    }
                  >
                    <ActivityRow row={r} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        // v2 scroll container: min-h keeps the card substantial when there are
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
