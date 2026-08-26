/**
 * Per-scope protocol gate state — composes the on-chain `pauseState()` reads
 * with the operator-flag override.
 *
 * Consumers call `useProtocolGateState()` for the snapshot and pass it to the
 * matching `is*Blocked(gate)` predicate from `protocolStatus`: components use it
 * to disable CTAs; transaction hooks guard their execution chokepoint with it.
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { getOnChainPauseState } from "@/clients/eth-contract/pause-state/query";
import {
  composeGateState,
  type ProtocolGateState,
} from "@/components/shared/protocolStatus";

const PAUSE_STATE_QUERY_KEY = "protocolPauseState";
// Freeze is high-frequency / transient — Risk Stewards can freeze/unfreeze in
// seconds — so poll briskly and keep the data fresh.
const PAUSE_STATE_REFETCH_INTERVAL_MS = 20_000;
const PAUSE_STATE_STALE_TIME_MS = 10_000;

/**
 * Raw on-chain pause-state query. `data` is undefined while loading or after a
 * failed (reverted) read; callers fall back to the operator-flag override. An
 * unrecognized enum value does NOT land here — it maps to "paused" (fail
 * closed) in `mapPauseState`, so it arrives as real data.
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
  // Depend on the primitive scope values (not the `data` object) so the gate
  // keeps a stable reference across polls when the status is unchanged — this
  // avoids churning the `useCallback`s in the tx hooks that consume it. Operator
  // flags are env-static, so these two values are the only dynamic inputs to
  // `composeGateState` (passing `{ protocol: null, aave: null }` is equivalent
  // to passing `null` — it collapses to the operator-flag value).
  const protocol = data?.protocol ?? null;
  const aave = data?.aave ?? null;
  return useMemo(() => composeGateState({ protocol, aave }), [protocol, aave]);
}
