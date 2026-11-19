import { useDepositPollingResult } from "@/context/deposit/PeginPollingContext";
import { DepositFlowStep } from "@/hooks/deposit/depositFlowSteps/types";

import { ProviderWaitDetail } from "./ProviderWaitDetail";

export function ProviderWaitDetailContainer({
  depositId,
}: {
  depositId: string;
}) {
  const polling = useDepositPollingResult(depositId);
  return (
    <ProviderWaitDetail
      step={DepositFlowStep.AWAIT_VP_VERIFICATION}
      verification={polling?.providerVerification}
    />
  );
}
