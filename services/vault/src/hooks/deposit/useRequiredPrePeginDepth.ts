import { useCallback } from "react";

import { useProtocolParamsContext } from "@/context/ProtocolParamsContext";

/**
 * Stable resolver for the required Pre-PegIn confirmation depth
 * (`minPrepeginDepth`): pinned to the deposit's registered offchain-params
 * version when given, or the latest version otherwise (pre-sign, where the
 * deposit has no registered version yet).
 *
 * The BLOCKING half, for components that render under
 * `ProtocolParamsProvider` and are typed against a guaranteed `number`.
 * `usePeginPollingProtocolParams.resolveRequiredPrePeginDepth` is the
 * non-blocking twin, and the two now deliberately DIVERGE on a registered
 * version missing from the params: the polling twin withholds (`undefined`),
 * because the at-depth conclusion it feeds is persisted (`confirmedTxids`);
 * this one keeps the latest-version fallback, because its consumers only
 * display the depth and persist nothing from it. why two hooks: sharing the
 * loading model would widen this return to `undefined` for three components
 * that legitimately cannot receive it.
 */
function useRequiredPrePeginDepthResolver(): (
  offchainParamsVersion?: number,
) => number {
  const { config, getOffchainParamsByVersion } = useProtocolParamsContext();
  return useCallback(
    (offchainParamsVersion?: number) =>
      (offchainParamsVersion !== undefined
        ? getOffchainParamsByVersion(offchainParamsVersion)?.minPrepeginDepth
        : undefined) ?? config.offchainParams.minPrepeginDepth,
    [getOffchainParamsByVersion, config.offchainParams.minPrepeginDepth],
  );
}

/** Required Pre-PegIn depth for one deposit (see the resolver above). */
export function useRequiredPrePeginDepth(
  offchainParamsVersion?: number,
): number {
  return useRequiredPrePeginDepthResolver()(offchainParamsVersion);
}
