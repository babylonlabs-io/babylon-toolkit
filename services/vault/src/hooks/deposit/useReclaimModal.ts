import { useCallback, useState } from "react";

import type { VaultActivity } from "@/types/activity";

/**
 * Open/close state for the reclaim review modal. Sibling of `useRefundModal`;
 * the execution machinery lives in `useReclaimState`.
 *
 * Also owns the in-session set of vaults whose sweep this session broadcast.
 * The reserve poll runs on a 60s tick, so without it a row would keep offering
 * an enabled Reclaim button for up to a minute after the depositor confirmed.
 * In-session only, deliberately: the vault is terminal by now and its local
 * storage entry has been cleared, and a page reload picks the state back up
 * from the chain read (`spent && !confirmed`) anyway.
 */
export function useReclaimModal(options: {
  allActivities: VaultActivity[];
  onSuccess: () => void;
}) {
  const { allActivities, onSuccess } = options;

  const [reclaimingActivity, setReclaimingActivity] =
    useState<VaultActivity | null>(null);
  const [inFlightVaultIds, setInFlightVaultIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const handleReclaimClick = useCallback(
    (depositId: string) => {
      const activity = allActivities.find((a) => a.id === depositId);
      if (activity) {
        setReclaimingActivity(activity);
      }
    },
    [allActivities],
  );

  const handleClose = useCallback(() => {
    setReclaimingActivity(null);
  }, []);

  const handleSuccess = useCallback(() => {
    setReclaimingActivity((current) => {
      if (current) {
        const vaultId = current.id.toLowerCase();
        setInFlightVaultIds((prev) => new Set(prev).add(vaultId));
      }
      return null;
    });
    onSuccess();
  }, [onSuccess]);

  return {
    reclaimingActivity,
    /** Vault ids (lowercased) whose sweep this session broadcast. */
    inFlightVaultIds,
    handleReclaimClick,
    handleClose,
    handleSuccess,
  };
}
