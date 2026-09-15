/**
 * Hub Registry - display labels for Aave v4 hubs
 *
 * One spoke lists reserves from several hubs, so the same token (e.g. USDC)
 * can be two reserves with their own rate, liquidity and debt. The hub label
 * is what tells those rows apart, so it comes from this compile-time table and
 * never from the indexer. A hub contract has no `name()` to fall back on.
 *
 * Display only: nothing routes or resolves by hub label, every flow keys on
 * the reserve id. The hub address a label is looked up for is itself proven
 * against the Core Spoke at config load (`fetchConfig.ts`).
 */

import { getAddress, type Address } from "viem";

import { logger } from "@/infrastructure";
import { truncateAddress } from "@/utils/addressUtils";

/** Hub address -> display label, for one deployment. */
type DeploymentHubs = Record<string, string>;

/**
 * Hubs per deployment. Labels repeat across deployments (every network has a
 * "Babylon Hub"), so uniqueness is enforced within one; addresses never repeat.
 */
export const HUBS_BY_DEPLOYMENT: Record<string, DeploymentHubs> = {
  // Vault Devnet (2026-09 multi-hub deploy)
  "vault-devnet": {
    "0xb3283508a0E96F80CF79DC2a1135F10dA170138D": "Babylon Hub",
    "0xF5E52D571Ed9b4779399A815815ABeFF7D7ec4ca": "Core Hub",
  },
  // Testnet (single hub; lists the vaultBTC reserve, like devnet's Babylon Hub)
  testnet: {
    "0x6ca0d39f8bD5Cf226878DA80BC073227d6E52C34": "Babylon Hub",
  },
};

/**
 * Flatten the per-deployment table into one checksummed-address lookup.
 *
 * Throws when two hubs in one deployment share a label, since both rows would
 * then read the same while carrying different rates and debt, and when one
 * address appears twice, since its label would depend on table order.
 */
export function buildHubRegistry(
  deployments: Record<string, DeploymentHubs>,
): ReadonlyMap<Address, string> {
  const registry = new Map<Address, string>();
  for (const [deployment, hubs] of Object.entries(deployments)) {
    const labels = new Set<string>();
    for (const [rawAddress, label] of Object.entries(hubs)) {
      if (labels.has(label)) {
        throw new Error(
          `Hub label "${label}" is used twice in deployment ${deployment}`,
        );
      }
      labels.add(label);
      const address = getAddress(rawAddress);
      if (registry.has(address)) {
        throw new Error(`Hub ${address} is registered more than once`);
      }
      registry.set(address, label);
    }
  }
  return registry;
}

const HUB_REGISTRY = buildHubRegistry(HUBS_BY_DEPLOYMENT);

/**
 * How a reserve's hub is named on screen. A `registry` label is curated above;
 * `address` means this build doesn't know the hub, so it is shown by its short
 * address and callers flag it as unrecognised. Never gate an action on
 * `address`: existing debt on an unknown hub must stay repayable.
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
