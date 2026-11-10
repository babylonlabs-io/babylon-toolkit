/**
 * Display labels for Aave v4 hubs, for the CLI's reserve menus and `--borrow-hub` / `--repay-hub`.
 *
 * The hub addresses come from the committed profiles of the CLI's networks (`contracts.aaveHub`,
 * `contracts.aaveHubStables`), as the app's do, so `pnpm sync-env` keeps both current. The labels only
 * help a human name a hub: every run resolves to a reserve id, and a hub missing here still matches by
 * address.
 */

import { readResolvedNetworkProfile } from "../../scripts/lib/networkProfiles";

import { NETWORKS } from "./config";

/**
 * Label per profile hub role. KEEP IN SYNC with `COPY.loans.hub.roleLabels` in src/copy.ts — mirrored
 * rather than imported because the e2e layer does not import from `src/` (see borrowParams.ts).
 */
const LABEL_BY_ROLE = {
  aaveHub: "Babylon Hub",
  aaveHubStables: "Core Hub",
} as const;

/** Lowercased hub address -> label, over every CLI network's profile. */
const HUB_LABELS: Record<string, string> = Object.fromEntries(
  Object.values(NETWORKS).flatMap(({ profile }) => {
    const { contracts } = readResolvedNetworkProfile(profile);
    return Object.entries(LABEL_BY_ROLE).flatMap(([role, label]) => {
      const hub = contracts[role as keyof typeof LABEL_BY_ROLE];
      return hub === undefined ? [] : [[hub.toLowerCase(), label]];
    });
  }),
);

/** Suffix every label ends with, so `--borrow-hub=core` matches "Core Hub". */
const HUB_LABEL_SUFFIX = " hub";

/** The hub's label, or its address when this table doesn't list it. */
export function describeHub(hub: string): string {
  return HUB_LABELS[hub.toLowerCase()] ?? hub;
}

/**
 * Whether a `--*-hub` value names this hub: its address, or its label (case-insensitive, with or
 * without the trailing "Hub").
 */
export function hubMatches(hub: string, query: string): boolean {
  const wanted = query.trim().toLowerCase();
  if (wanted === hub.toLowerCase()) return true;
  const label = HUB_LABELS[hub.toLowerCase()]?.toLowerCase();
  return (
    label !== undefined &&
    (wanted === label || `${wanted}${HUB_LABEL_SUFFIX}` === label)
  );
}
