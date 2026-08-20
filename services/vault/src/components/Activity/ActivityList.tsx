import { Heading, useIsMobile } from "@babylonlabs-io/core-ui";
import { useEffect, useState } from "react";
import { twJoin } from "tailwind-merge";

import { ListRowCard } from "@/components/shared/ListRow";
import { COPY } from "@/copy";
import { useMidnightTick } from "@/hooks/useMidnightTick";
import type { ActivityRow, ActivityType } from "@/types/activityLog";
import { formatActivityDateGroup } from "@/utils/formatting";

import { ActivityEmptyState } from "./ActivityEmptyState";
import { ActivityRowV3 } from "./ActivityRowV3";
import { ExpiredWithdrawButton } from "./ExpiredWithdrawButton";
import { FilterDropdown } from "./FilterDropdown";
import { LiquidationGroupCardV3 } from "./LiquidationGroupCardV3";

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
  /** Current USD price per token symbol, for each row's USD sub-line. */
  prices?: Record<string, number>;
  /** Vault ids ACTIVE on chain, for a deposit row's live status. `undefined`
   *  while the vault read is in flight. */
  activeVaultIds?: ReadonlySet<string>;
  /** Vault ids of expired deposits whose HTLC refund is still outstanding —
   *  those rows get the Withdraw action. Matched against a row's `vaultId`,
   *  never its `id` (see ActivityLog). */
  refundableVaultIds?: ReadonlySet<string>;
  onWithdraw?: (vaultId: string) => void;
}

export function ActivityList({
  activities,
  isConnected,
  prices,
  activeVaultIds,
  refundableVaultIds,
  onWithdraw,
}: ActivityListProps) {
  const isMobile = useIsMobile();
  // Desktop replaces this in-page heading with the persistent header's page
  // title; mobile has no header title slot (Header only shows it on desktop),
  // so the heading must stay to avoid a page with no title at all.
  const hideHeading = !isMobile;
  const [filter, setFilter] = useState<ActivityType | null>(null);

  // Re-render at local midnight so the "Today" / "Yesterday" date-group
  // headers stay correct on a page left open overnight (the feed doesn't poll).
  useMidnightTick();

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
            !hideHeading && "justify-between",
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
              <FilterDropdown
                value={filter}
                placeholder={COPY.activity.filterAll}
                options={FILTER_OPTIONS}
                onChange={setFilter}
                // The trigger sits to the left of the row, so the menu opens
                // rightward from it.
                align="start"
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
      ) : (
        // Rows grouped under date headers. Each row is its own card, the same
        // one the Vaults tab uses — except a liquidation, whose child events
        // share one card with divider-separated rows.
        <div className="flex flex-col gap-6">
          {groupByDate(visible, new Date()).map((group) => (
            <div key={group.label} className="flex flex-col gap-3">
              <p className="text-sm leading-[1.43] tracking-[0.17px] text-accent-secondary">
                {group.label}
              </p>
              <ul role="list" className="flex flex-col gap-2">
                {group.rows.map((r) => (
                  <li key={r.id}>
                    {r.kind === "liquidationGroup" ? (
                      <LiquidationGroupCardV3 row={r} />
                    ) : (
                      <ListRowCard>
                        <ActivityRowV3
                          row={r}
                          prices={prices}
                          activeVaultIds={activeVaultIds}
                          action={
                            r.vaultId &&
                            refundableVaultIds?.has(r.vaultId) &&
                            onWithdraw ? (
                              <ExpiredWithdrawButton
                                vaultId={r.vaultId}
                                onWithdraw={onWithdraw}
                              />
                            ) : undefined
                          }
                        />
                      </ListRowCard>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
