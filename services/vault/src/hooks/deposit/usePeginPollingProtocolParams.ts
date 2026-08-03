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
 * The resolvers return `undefined` until BOTH queries have landed. (The
 * blocking provider gates on a third, `universalChallengers`, which nothing
 * here reads — so this is the same discipline, not the same gate.) Callers must
 * read `undefined` as "depth not yet known" and withhold any confirmation
 * conclusion — never substitute a default, which would assert a Bitcoin depth
 * the chain has not reached.
 */

import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { pegInConfigQueryOptions } from "@/context/ProtocolParamsContext";
import { offchainParamsQueryOptions } from "@/hooks/useOffchainParams";

export interface PeginPollingProtocolParams {
  /** True once both queries resolved; every resolver below is live. */
  ready: boolean;
  /**
   * First query error, or null — but only while {@link ready} is false.
   * why: React Query retains `data` when a *refetch* fails, so once the
   * stale time elapses an error can sit beside a cached value that is present
   * and correct. Reporting it then would withhold conclusions over a depth the
   * hook already knows. Same discipline as the resolvers below: withhold only
   * when the value is genuinely unknown.
   */
  error: Error | null;
  /** On-chain activation window. `undefined` until {@link ready}. */
  pegInActivationTimeout: bigint | undefined;
  /**
   * Required Pre-PegIn confirmation depth (`minPrepeginDepth`), pinned to the
   * deposit's registered offchain-params version. The latest version applies
   * ONLY pre-sign (no registered version): a registered version missing from
   * `byVersion` withholds (`undefined`) rather than falling back — the
   * at-depth conclusion this feeds persists (`confirmedTxids`), so a
   * fallback depth would confirm at the wrong threshold and the mistake
   * would survive the params catching up. Strict like
   * {@link resolveRefundTimelock}; deliberately stricter than the blocking
   * `useRequiredPrePeginDepthResolver`, whose consumers only display the
   * depth and never persist a conclusion from it.
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

/**
 * @param enabled Gates both contract reads. This hook mounts app-wide (the
 * polling provider sits in the root layout), so without a gate every session
 * pays two multicalls on page load — disconnected visitors and param-free
 * routes included. The caller passes "is there anything to conclude about"
 * (deposits exist); while disabled the resolvers simply stay in their
 * withheld `undefined` state, which is already the correct answer when
 * nothing needs a conclusion.
 */
export function usePeginPollingProtocolParams(
  enabled: boolean,
): PeginPollingProtocolParams {
  const { data: config, error: configError } = useQuery({
    ...pegInConfigQueryOptions(),
    enabled,
  });
  const { data: offchainParams, error: offchainError } = useQuery({
    ...offchainParamsQueryOptions(),
    enabled,
  });

  const resolveRequiredPrePeginDepth = useCallback(
    (offchainParamsVersion?: number): number | undefined => {
      if (!config || !offchainParams) return undefined;
      // Pre-sign: the deposit has no registered version yet → latest params.
      if (offchainParamsVersion === undefined) {
        return config.offchainParams.minPrepeginDepth;
      }
      // Registered version: strict — see the interface doc. A missing
      // version withholds the conclusion; it must never substitute the
      // latest depth, because the at-depth observation this feeds is
      // persisted and would outlive the wrong threshold that produced it.
      return offchainParams.byVersion.get(offchainParamsVersion)
        ?.minPrepeginDepth;
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

  const ready = config !== undefined && offchainParams !== undefined;

  return {
    ready,
    error: ready ? null : (configError ?? offchainError),
    pegInActivationTimeout: config?.pegInActivationTimeout,
    resolveRequiredPrePeginDepth,
    resolveRefundTimelock,
  };
}
