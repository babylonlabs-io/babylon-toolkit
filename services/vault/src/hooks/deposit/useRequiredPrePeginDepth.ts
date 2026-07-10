import { useProtocolParamsContext } from "@/context/ProtocolParamsContext";

/**
 * Required Pre-PegIn confirmation depth (`minPrepeginDepth`), pinned to the
 * deposit's registered offchain-params version when given — matching
 * `PeginPollingContext.getRequiredPrePeginDepth` — or the latest version
 * otherwise (pre-sign, where the deposit has no registered version yet).
 */
export function useRequiredPrePeginDepth(
  offchainParamsVersion?: number,
): number {
  const { config, getOffchainParamsByVersion } = useProtocolParamsContext();
  return (
    (offchainParamsVersion !== undefined
      ? getOffchainParamsByVersion(offchainParamsVersion)?.minPrepeginDepth
      : undefined) ?? config.offchainParams.minPrepeginDepth
  );
}
