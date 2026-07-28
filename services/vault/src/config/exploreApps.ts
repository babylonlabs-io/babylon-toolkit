/**
 * Static registry for the v3 Explore page (see components/pages/Explore.tsx).
 *
 * This is intentionally hand-authored static data for now. The page consumes
 * it through `useExploreApps()`, whose return shape is stable, so a later swap
 * to a fetched source only changes the hook internals — not the page or card.
 *
 * The app `name` / `description` live here (not in copy.ts) because they are
 * dataset content — the per-app records that a future fetch will replace —
 * rather than UI chrome. The page's own chrome strings live in `COPY.explore`.
 *
 * Destination URLs are the partners' verified official dapps. None currently
 * run a distinct testnet endpoint (Aave uses an in-app testnet toggle on the
 * same domain), so every entry is a single universal URL. The per-network map
 * form (`Partial<Record<BtcNetworkName, string>>`) stays supported for any
 * future partner whose testnet and mainnet destinations differ.
 */

import { getBTCNetwork, type BtcNetworkName } from "@/config/network";

/** A destination that is either the same everywhere, or differs per network. */
type ExploreAppUrl = string | Partial<Record<BtcNetworkName, string>>;

/** Raw registry entry, before the per-network destination is resolved. */
interface ExploreAppConfig {
  id: string;
  name: string;
  description: string;
  /** App logo served from `public/images/explore/`. */
  logoUrl: string;
  appUrl: ExploreAppUrl;
}

/** Explore entry with its destination resolved for the active network. */
export interface ExploreApp {
  id: string;
  name: string;
  description: string;
  logoUrl: string;
  appUrl: string;
}

const EXPLORE_APPS: readonly ExploreAppConfig[] = [
  {
    id: "aave",
    name: "AAVE Protocol",
    description:
      "Decentralized lending protocol enabling users to borrow and lend digital assets.",
    logoUrl: "/images/explore/aave.svg",
    appUrl: "https://app.aave.com",
  },
  {
    id: "cradle",
    name: "Cradle",
    description:
      "Platform building financial products around Bitcoin-backed liquidity.",
    logoUrl: "/images/explore/cradle.svg",
    appUrl: "https://cradle.exchange",
  },
  {
    id: "aegis",
    name: "AEGIS",
    description:
      "Platform for managing Bitcoin-backed stablecoins with built-in yield generation transparency.",
    logoUrl: "/images/explore/aegis.svg",
    appUrl: "https://app.aegis.im",
  },
  {
    id: "b14g",
    name: "b14g",
    description:
      "Bitcoin dual-staking platform that helps BTC holders earn yield while keeping BTC non-custodial.",
    logoUrl: "/images/explore/b14g.svg",
    appUrl: "https://app.b14g.xyz",
  },
] as const;

/**
 * Resolve an app's destination for the active BTC network. A single string is
 * used as-is; a per-network map must contain the active network — a missing
 * entry is a configuration error and throws rather than silently dropping the
 * link (an external destination we can't resolve should surface loudly).
 */
export function resolveExploreAppUrl(appUrl: ExploreAppUrl): string {
  if (typeof appUrl === "string") return appUrl;

  const network = getBTCNetwork();
  const resolved = appUrl[network];
  if (!resolved) {
    throw new Error(
      `Explore: no destination URL configured for network "${network}"`,
    );
  }
  return resolved;
}

/** The registry with every destination resolved for the active network. */
export function getExploreApps(): ExploreApp[] {
  return EXPLORE_APPS.map((app) => ({
    id: app.id,
    name: app.name,
    description: app.description,
    logoUrl: app.logoUrl,
    appUrl: resolveExploreAppUrl(app.appUrl),
  }));
}
