import { useCallback } from "react";

import { useProtocolParamsContext } from "@/context/ProtocolParamsContext";

/**
 * Stable resolver for the required Pre-PegIn confirmation depth
 * (`minPrepeginDepth`): pinned to the deposit's registered offchain-params
 * version when given, or the latest version otherwise (pre-sign, where the
 * deposit has no registered version yet). Single source of this rule — also
 * consumed by `PeginPollingContext.getRequiredPrePeginDepth`.
 */
export function useRequiredPrePeginDepthResolver(): (
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
