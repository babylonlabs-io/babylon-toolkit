import { useCallback, useMemo, useState } from "react";

import type { VaultActivity } from "../../types/activity";

export interface ArtifactDownloadModalParams {
  providerAddress: string;
  peginTxid: string;
  depositorPk: string;
}

function getArtifactParams(
  activity: VaultActivity,
): ArtifactDownloadModalParams | null {
  const providerAddress = activity.providers?.[0]?.id;
  const peginTxid = activity.peginTxHash;
  const depositorPk = activity.depositorBtcPubkey;

  if (!providerAddress || !peginTxid || !depositorPk) {
    return null;
  }
  return { providerAddress, peginTxid, depositorPk };
}

export function useArtifactDownloadModal(options: {
  allActivities: VaultActivity[];
  onSuccess?: () => void;
}) {
  const { allActivities, onSuccess } = options;
  const [activity, setActivity] = useState<VaultActivity | null>(null);

  const params = useMemo((): ArtifactDownloadModalParams | null => {
    if (!activity) return null;
    return getArtifactParams(activity);
  }, [activity]);

  const handleArtifactDownloadClick = useCallback(
    (depositId: string) => {
      const found = allActivities.find((a) => a.id === depositId);
      if (found && getArtifactParams(found)) {
        setActivity(found);
      }
    },
    [allActivities],
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
