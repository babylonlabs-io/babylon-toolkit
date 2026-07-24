/**
 * Non-blocking access to the protocol params the peg-in polling tree needs.
 *
 * Mirrors the `pegInConfig` and `allOffchainParams` queries owned by
 * ProtocolParamsContext and shares their React Query cache via the same keys,
 * so this adds no extra request. Unlike `useProtocolParamsContext` it does NOT
 * block: `PeginPollingProvider` is mounted above the routes that own the
 * blocking provider, and that provider renders a spinner *in place of* its
 * children — depending on it there would gate the whole app on three contract
 * reads and blank it on failure.
 *
 * The resolvers return `undefined` until BOTH queries have landed, matching the
 * blocking provider's own gate. Callers must read that as "depth not yet known"
 * and withhold any confirmation conclusion — never substitute a default, which
 * would assert a Bitcoin depth the chain has not reached.
 */

import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { pegInConfigQueryOptions } from "@/context/ProtocolParamsContext";
import { offchainParamsQueryOptions } from "@/hooks/useOffchainParams";

export interface PeginPollingProtocolParams {
  /** True once both queries resolved; every resolver below is live. */
  ready: boolean;
  /** First query error, or null. Surfaced per-deposit rather than swallowed. */
  error: Error | null;
  /** On-chain activation window. `undefined` until {@link ready}. */
  pegInActivationTimeout: bigint | undefined;
  /**
   * Required Pre-PegIn confirmation depth (`minPrepeginDepth`), pinned to the
   * deposit's registered offchain-params version, or the latest version when it
   * has none (pre-sign). Same rule as `useRequiredPrePeginDepthResolver`, which
   * still serves the components that render under the blocking provider.
   */
  resolveRequiredPrePeginDepth: (
    offchainParamsVersion?: number,
  ) => number | undefined;
  /**
   * Per-deposit `tRefund`. Strict by design: never falls back to the latest
   * version, because a since-lowered `tRefund` would mark a vault mature early
   * and Bitcoin would reject the refund with `non-BIP68-final`.
   */
  resolveRefundTimelock: (offchainParamsVersion?: number) => number | undefined;
}

export function usePeginPollingProtocolParams(): PeginPollingProtocolParams {
  const { data: config, error: configError } = useQuery(
    pegInConfigQueryOptions(),
  );
  const { data: offchainParams, error: offchainError } = useQuery(
    offchainParamsQueryOptions(),
  );

  const resolveRequiredPrePeginDepth = useCallback(
    (offchainParamsVersion?: number): number | undefined => {
      if (!config || !offchainParams) return undefined;
      const pinned =
        offchainParamsVersion !== undefined
          ? offchainParams.byVersion.get(offchainParamsVersion)
              ?.minPrepeginDepth
          : undefined;
      return pinned ?? config.offchainParams.minPrepeginDepth;
    },
    [config, offchainParams],
  );

  const resolveRefundTimelock = useCallback(
    (offchainParamsVersion?: number): number | undefined =>
      offchainParamsVersion !== undefined
        ? offchainParams?.byVersion.get(offchainParamsVersion)?.tRefund
        : undefined,
    [offchainParams],
  );

  return {
    ready: config !== undefined && offchainParams !== undefined,
    error: configError ?? offchainError,
    pegInActivationTimeout: config?.pegInActivationTimeout,
    resolveRequiredPrePeginDepth,
    resolveRefundTimelock,
  };
}
