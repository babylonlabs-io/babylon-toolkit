import { Text } from "@babylonlabs-io/core-ui";

import { DEFAULT_CONFIRMATION_DEPTH } from "@/ui/common/constants";
import { useNetworkInfo } from "@/ui/common/hooks/client/api/useNetworkInfo";

interface ExpansionPendingBannerProps {
  className?: string;
}

export function ExpansionPendingBanner({
  className = "",
}: ExpansionPendingBannerProps) {
  const { data: networkInfo } = useNetworkInfo();
  const confirmationDepth =
    networkInfo?.params.btcEpochCheckParams?.latestParam
      ?.btcConfirmationDepth || DEFAULT_CONFIRMATION_DEPTH;

  return (
    <div
      className={`bg-warning-surface border-warning-strokeLight mb-4 rounded border p-4 ${className}`}
    >
      <Text variant="body1" className="mb-2 font-medium text-accent-primary">
        Stake Expansion Pending
      </Text>
      <Text variant="body2" className="text-accent-secondary">
        Your stake expansion transaction has been forwarded to Bitcoin. It will
        be activated once it receives {confirmationDepth} Bitcoin block
        confirmations. Your original stake is still Active and you can find it
        in the "Expansion History" tab.
      </Text>
    </div>
  );
}
