/**
 * Why withdrawing BTCVault collateral would revert on a hub, as the review's
 * message, or null when no known hub state blocks it: the collateral's own hub
 * halted or inactive, or an inactive hub where the connected user has debt.
 * Hub state is read live, so a hub that recovers unblocks the withdrawal
 * without a reload.
 */

import { useMemo } from "react";

import { useETHWallet } from "@/context/wallet";

import { useAaveConfig } from "../context";
import {
  describeWithdrawHubBlock,
  getWithdrawHubBlock,
} from "../utils/hubState";

import { useDebtReserves } from "./useDebtReserves";
import { useHubSpokeConfigs } from "./useHubSpokeConfigs";

export function useWithdrawHubBlockMessage(): string | null {
  const { address } = useETHWallet();
  const { vbtcReserve } = useAaveConfig();
  const debtReserves = useDebtReserves(address);
  const hubReserves = useMemo(
    () => (vbtcReserve ? [vbtcReserve, ...debtReserves] : debtReserves),
    [vbtcReserve, debtReserves],
  );
  const hubSpokeConfigs = useHubSpokeConfigs(hubReserves);
  const block = getWithdrawHubBlock(vbtcReserve, debtReserves, hubSpokeConfigs);
  return block ? describeWithdrawHubBlock(block) : null;
}
