/**
 * Per-scope protocol gate state — composes the on-chain `pauseState()` reads
 * with the operator-flag override and exposes per-action gating booleans.
 *
 * Components read `useGating()` to disable CTAs; transaction hooks read
 * `useProtocolGateState()` and pass the snapshot to the matching
 * `is*Blocked(gate)` predicate at their execution chokepoint.
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { getOnChainPauseState } from "@/clients/eth-contract/pause-state/query";
import {
  composeGateState,
  isActivationBlocked,
  isBorrowBlocked,
  isDepositBlocked,
  isReorderBlocked,
  isRepayBlocked,
  isWithdrawBlocked,
  type ProtocolGateState,
} from "@/components/shared/protocolStatus";

const PAUSE_STATE_QUERY_KEY = "protocolPauseState";
// Freeze is high-frequency / transient — Risk Stewards can freeze/unfreeze in
// seconds — so poll briskly and keep the data fresh.
const PAUSE_STATE_REFETCH_INTERVAL_MS = 20_000;
const PAUSE_STATE_STALE_TIME_MS = 10_000;

/**
 * Raw on-chain pause-state query. `data` is undefined while loading or after a
 * failed/unrecognized read; callers fall back to the operator-flag override.
 */
export function useProtocolPauseStatus() {
  return useQuery({
    queryKey: [PAUSE_STATE_QUERY_KEY],
    queryFn: getOnChainPauseState,
    refetchInterval: PAUSE_STATE_REFETCH_INTERVAL_MS,
    staleTime: PAUSE_STATE_STALE_TIME_MS,
    networkMode: "always",
  });
}

/**
 * The effective per-scope gate state: on-chain reads composed with the operator
 * flags (more severe wins). While loading or on a read failure, on-chain is
 * treated as `null`, so the state falls back to the operator-flag value — exits
 * stay available unless an operator explicitly paused.
 */
export function useProtocolGateState(): ProtocolGateState {
  const { data } = useProtocolPauseStatus();
  return useMemo(() => composeGateState(data ?? null), [data]);
}

export interface GatingFlags {
  depositBlocked: boolean;
  borrowBlocked: boolean;
  reorderBlocked: boolean;
  withdrawBlocked: boolean;
  repayBlocked: boolean;
  activationBlocked: boolean;
}

/** Derived per-action booleans for disabling CTAs in components. */
export function useGating(): GatingFlags {
  const gate = useProtocolGateState();
  return useMemo(
    () => ({
      depositBlocked: isDepositBlocked(gate),
      borrowBlocked: isBorrowBlocked(gate),
      reorderBlocked: isReorderBlocked(gate),
      withdrawBlocked: isWithdrawBlocked(gate),
      repayBlocked: isRepayBlocked(gate),
      activationBlocked: isActivationBlocked(gate),
    }),
    [gate],
  );
}
