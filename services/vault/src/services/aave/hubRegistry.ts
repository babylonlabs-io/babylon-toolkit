/**
 * Hub Registry - display labels for Aave v4 hubs
 *
 * One spoke lists reserves from several hubs, so the same token (e.g. USDC)
 * can be two reserves with their own rate, liquidity and debt. The hub label
 * is what tells those rows apart, so it comes from the hubs the network
 * profile lists (`contracts.aaveHub`, `contracts.aaveHubStables`, generated
 * from tbv-networks by `pnpm sync-env`) and never from the indexer. A hub
 * contract has no `name()` to fall back on.
 *
 * Display only: nothing routes or resolves by hub label, every flow keys on
 * the reserve id. The hub address a label is looked up for is itself proven
 * against the Core Spoke at config load (`fetchConfig.ts`).
 */

import { getAddress, type Address } from "viem";

import { ENV } from "@/config/env";
import { HUB_ROLES } from "@/config/network/profile";
import { COPY } from "@/copy";
import { logger } from "@/infrastructure";
import { truncateAddress } from "@/utils/addressUtils";

/**
 * Checksummed hub address -> its role's label, for the hubs this build's
 * profile lists. The profile refuses one address in both roles, so no two
 * entries collide.
 */
const HUB_REGISTRY: ReadonlyMap<Address, string> = new Map(
  HUB_ROLES.flatMap((role) => {
    const hub = ENV.AAVE_HUBS[role];
    return hub === undefined
      ? []
      : [[getAddress(hub), COPY.loans.hub.roleLabels[role]] as const];
  }),
);

/**
 * How a reserve's hub is named on screen. A `registry` label is the role label
 * of a hub the profile lists; `address` means this build doesn't know the hub,
 * so it is shown by its short address and callers flag it as unrecognised.
 * Never gate an action on `address`: existing debt on an unknown hub must stay
 * repayable.
 */
export type HubIdentity =
  | { source: "registry"; address: Address; label: string }
  | { source: "address"; address: Address; label: string };

const warnedUnknownHubs = new Set<Address>();

export function getHubIdentity(hub: Address): HubIdentity {
  const address = getAddress(hub);
  const label = HUB_REGISTRY.get(address);
  if (label !== undefined) {
    return { source: "registry", address, label };
  }
  // Once per hub: every per-reserve surface resolves its hub on each render.
  if (!warnedUnknownHubs.has(address)) {
    warnedUnknownHubs.add(address);
    logger.warn(
      `[HubRegistry] Aave hub ${address} is not registered; showing its address`,
    );
  }
  return { source: "address", address, label: truncateAddress(address) };
}
