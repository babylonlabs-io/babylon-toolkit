/**
 * One spoke can list the same token on several hubs, each a separate reserve.
 * The pickers and the Loans list present those reserves together, so they are
 * grouped by underlying token address, never by the indexer's symbol.
 */

import { getAddress, type Address } from "viem";

import type { AaveReserveConfig } from "../services/fetchConfig";

export interface UnderlyingGroup {
  /** Checksummed underlying token address shared by every reserve in the group. */
  underlying: Address;
  /** The token's reserves, one per hub, ordered by reserve id. */
  reserves: AaveReserveConfig[];
}

function compareReserveIds(a: AaveReserveConfig, b: AaveReserveConfig) {
  if (a.reserveId === b.reserveId) return 0;
  return a.reserveId < b.reserveId ? -1 : 1;
}

/**
 * Group reserves by underlying token. Groups are ordered by their lowest
 * reserve id, so the order never depends on the order the indexer returned.
 */
export function groupReservesByUnderlying(
  reserves: readonly AaveReserveConfig[],
): UnderlyingGroup[] {
  const groups = new Map<Address, AaveReserveConfig[]>();
  for (const reserve of [...reserves].sort(compareReserveIds)) {
    const underlying = getAddress(reserve.reserve.underlying);
    const group = groups.get(underlying);
    if (group) {
      group.push(reserve);
    } else {
      groups.set(underlying, [reserve]);
    }
  }
  return Array.from(groups, ([underlying, grouped]) => ({
    underlying,
    reserves: grouped,
  }));
}
