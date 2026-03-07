import { useCallback, useMemo, useState } from "react";

import type { VaultProvider } from "../../types";
import type { VaultActivity } from "../../types/activity";

export interface ArtifactDownloadModalParams {
  providerUrl: string;
  peginTxid: string;
  depositorPk: string;
}

function getArtifactParams(
  activity: VaultActivity,
  findProvider: (address: string) => VaultProvider | undefined,
): ArtifactDownloadModalParams | null {
  const providerId = activity.providers?.[0]?.id;
  const provider = providerId ? findProvider(providerId) : undefined;
  const providerUrl = provider?.url;
  const peginTxid = activity.txHash || activity.id;
  const depositorPk = activity.depositorBtcPubkey;

  if (!providerUrl || !peginTxid || !depositorPk) {
    return null;
  }
  return { providerUrl, peginTxid, depositorPk };
}

export function useArtifactDownloadModal(options: {
  allActivities: VaultActivity[];
  findProvider: (address: string) => VaultProvider | undefined;
  onSuccess?: () => void;
}) {
  const { allActivities, findProvider, onSuccess } = options;
  const [activity, setActivity] = useState<VaultActivity | null>(null);

  const params = useMemo((): ArtifactDownloadModalParams | null => {
    if (!activity) return null;
    return getArtifactParams(activity, findProvider);
  }, [activity, findProvider]);

  const handleArtifactDownloadClick = useCallback(
    (depositId: string) => {
      const found = allActivities.find((a) => a.id === depositId);
      if (found && getArtifactParams(found, findProvider)) {
        setActivity(found);
      }
    },
    [allActivities, findProvider],
  );

  const handleClose = useCallback(() => {
    setActivity(null);
  }, []);

  const handleComplete = useCallback(() => {
    setActivity(null);
    onSuccess?.();
  }, [onSuccess]);

  return {
    activity,
    params,
    isOpen: !!activity && !!params,
    handleArtifactDownloadClick,
    handleClose,
    handleComplete,
  };
}
