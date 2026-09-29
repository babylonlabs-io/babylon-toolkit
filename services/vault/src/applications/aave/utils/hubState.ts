/**
 * Our Core Spoke's standing on each Hub, and what it blocks.
 *
 * A Hub keeps a config per (asset, spoke). `Hub.sol` rejects every add, remove,
 * draw and restore for a spoke that is inactive (`SpokeNotActive`) or halted
 * (`SpokeHalted`), so an inactive or halted reserve can be neither borrowed nor
 * repaid. The hubs are also coupled: every borrow and every collateral withdraw
 * refreshes the user's risk premium on each hub where they have debt, and that
 * refresh requires our spoke to be active there (halted does not matter). A
 * repay touches only its own hub.
 *
 * The coupled block is conservative: the Spoke skips the refresh when the
 * user's risk premium is zero before and after (`Spoke._notifyRiskPremiumUpdate`),
 * and then an inactive debt hub would not reject the transaction. Predicting
 * that needs the premium the Spoke would compute, so any inactive debt hub
 * blocks borrow and withdraw.
 *
 * A config that could not be read counts as usable: the transaction simulation
 * and the decoded revert are the backstop, and a failed display read must not
 * lock a user out of their debt.
 */

import { formatUnits } from "viem";

import { COPY } from "@/copy";
import { getHubIdentity } from "@/services/aave/hubRegistry";

import {
  UNLIMITED_SPOKE_CAP,
  type HubSpokeConfig,
  type SpokeDrawUsage,
} from "../clients/aaveHub";
import type { AaveReserveConfig } from "../services/fetchConfig";

/** Spoke config per reserve id (`reserveId.toString()`); null when unread. */
export type HubSpokeConfigs = Readonly<Record<string, HubSpokeConfig | null>>;

/**
 * A hub state that blocks an action. `via` says where it comes from: the hub of
 * the reserve being acted on, or the hub of another reserve the user owes on.
 */
export interface HubBlock {
  status: "inactive" | "halted";
  via: "reserve" | "debt";
  reserve: AaveReserveConfig;
}

/** Blocks every add, remove, draw and restore on the reserve's own hub. */
export function getReserveHubBlock(
  reserve: AaveReserveConfig,
  configs: HubSpokeConfigs,
): HubBlock | null {
  const config = configs[reserve.reserveId.toString()];
  if (config == null) return null;
  if (!config.active) return { status: "inactive", via: "reserve", reserve };
  if (config.halted) return { status: "halted", via: "reserve", reserve };
  return null;
}

/** A debt reserve whose hub would reject the risk-premium refresh. */
function findInactiveDebtHub(
  debtReserves: readonly AaveReserveConfig[],
  configs: HubSpokeConfigs,
): HubBlock | null {
  const reserve = debtReserves.find(
    (r) => configs[r.reserveId.toString()]?.active === false,
  );
  return reserve ? { status: "inactive", via: "debt", reserve } : null;
}

/** The borrow or repay form's explanation for a hub block, naming the hub. */
export function describeHubBlock(block: HubBlock): string {
  const hub = getHubIdentity(block.reserve.reserve.hub).label;
  if (block.via === "debt") return COPY.loans.hub.debtHubInactive(hub);
  const { symbol } = block.reserve.token;
  return block.status === "halted"
    ? COPY.loans.hub.halted(symbol, hub)
    : COPY.loans.hub.inactive(symbol, hub);
}

/** The withdraw review's explanation for a hub block, naming the hub. */
export function describeWithdrawHubBlock(block: HubBlock): string {
  const hub = getHubIdentity(block.reserve.reserve.hub).label;
  return block.via === "debt"
    ? COPY.loans.hub.debtHubInactive(hub)
    : COPY.withdraw.review.collateralHubUnavailable(hub);
}

/** Why borrowing `target` would revert on a hub, if it would. */
export function getBorrowHubBlock(
  target: AaveReserveConfig,
  debtReserves: readonly AaveReserveConfig[],
  configs: HubSpokeConfigs,
): HubBlock | null {
  return (
    getReserveHubBlock(target, configs) ??
    findInactiveDebtHub(debtReserves, configs)
  );
}

/** Why withdrawing collateral would revert on a hub, if it would. */
export function getWithdrawHubBlock(
  collateralReserve: AaveReserveConfig | null,
  debtReserves: readonly AaveReserveConfig[],
  configs: HubSpokeConfigs,
): HubBlock | null {
  return (
    (collateralReserve && getReserveHubBlock(collateralReserve, configs)) ??
    findInactiveDebtHub(debtReserves, configs)
  );
}

/**
 * What our spoke may still draw on the reserve's hub, in whole tokens: the draw
 * cap less everything counted against it, floored at 0. Null when there is no
 * cap or the usage is unread, so the caller leaves the borrow uncapped.
 */
export function getDrawHeadroom(
  usage: SpokeDrawUsage | null,
  decimals: number,
): number | null {
  if (usage == null || usage.drawCap === UNLIMITED_SPOKE_CAP) return null;
  const capRaw = BigInt(usage.drawCap) * 10n ** BigInt(decimals);
  const headroomRaw = capRaw > usage.usedRaw ? capRaw - usage.usedRaw : 0n;
  return Number(formatUnits(headroomRaw, decimals));
}
