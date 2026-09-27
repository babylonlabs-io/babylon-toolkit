import { Callout } from "@babylonlabs-io/core-ui";
import { useQueryClient } from "@tanstack/react-query";
import type { Hex } from "viem";

import { useReorderOverride } from "@/applications/aave/context";
import { useReorderVaults } from "@/applications/aave/hooks/useReorderVaults";
import { useSplitVaultOrder } from "@/applications/aave/hooks/useSplitVaultOrder";
import { NotificationCard } from "@/components/shared/NotificationCard";
import { isReorderBlocked } from "@/components/shared/protocolStatus";
import { COPY } from "@/copy";
import { useProtocolGateState } from "@/hooks/useProtocolGate";
import {
  invalidateSplitVaultOrderQuery,
  invalidateVaultQueries,
} from "@/utils/queryKeys";

export function SplitVaultOrderWarning({
  currentVaultIds,
  onSuccess,
}: {
  currentVaultIds: readonly string[];
  onSuccess: () => void;
}) {
  const { expectedVaultIds, hasMismatch } = useSplitVaultOrder(currentVaultIds);
  const { executeReorder, isProcessing, error } = useReorderVaults();
  const { applyReorderedOrder } = useReorderOverride();
  const gate = useProtocolGateState();
  const queryClient = useQueryClient();

  if (!hasMismatch || expectedVaultIds === null) return null;

  const handleRepair = async () => {
    const success = await executeReorder(expectedVaultIds, {
      expectedCurrentVaultIds: currentVaultIds as readonly Hex[],
    });
    if (!success) return;
    applyReorderedOrder(expectedVaultIds);
    await Promise.all([
      invalidateVaultQueries(queryClient),
      invalidateSplitVaultOrderQuery(queryClient),
    ]);
    onSuccess();
  };

  return (
    <NotificationCard
      tone="urgent"
      title={COPY.vaults.splitOrderWarning.title}
      data-testid="split-vault-order-warning"
      actions={[
        {
          label: COPY.vaults.splitOrderWarning.action,
          onClick: () => void handleRepair(),
          emphasis: "primary",
          disabled: isProcessing || isReorderBlocked(gate),
        },
      ]}
    >
      <div className="flex flex-col gap-3">
        <span>{COPY.vaults.splitOrderWarning.body}</span>
        {error && (
          <Callout variant="error" title={COPY.common.transactionFailedTitle}>
            {error}
          </Callout>
        )}
      </div>
    </NotificationCard>
  );
}
