/**
 * Display labels for Aave v4 hubs, for the CLI's reserve menus and `--borrow-hub` / `--repay-hub`.
 *
 * KEEP IN SYNC with src/services/aave/hubRegistry.ts (`HUBS_BY_DEPLOYMENT`). Copied rather than imported
 * because the e2e layer does not import from `src/` (see borrowParams.ts). The labels only help a human
 * name a hub: every run resolves to a reserve id, and a hub missing here still matches by address.
 */

/** Lowercased hub address -> label. */
const HUB_LABELS: Record<string, string> = {
  // Vault Devnet (2026-09 multi-hub deploy)
  "0xb3283508a0e96f80cf79dc2a1135f10da170138d": "Babylon Hub",
  "0xf5e52d571ed9b4779399a815815abeff7d7ec4ca": "Core Hub",
  // Testnet (single hub)
  "0x6ca0d39f8bd5cf226878da80bc073227d6e52c34": "Babylon Hub",
};

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
