import { Callout } from "@babylonlabs-io/core-ui";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { Hex } from "viem";

import { useReorderOverride } from "@/applications/aave/context";
import { usePositionNotifications } from "@/applications/aave/hooks/usePositionNotifications";
import { useReorderVaults } from "@/applications/aave/hooks/useReorderVaults";
import { useSplitVaultOrder } from "@/applications/aave/hooks/useSplitVaultOrder";
import {
  calculate,
  type CalculatorParams,
  type Vault,
} from "@/applications/aave/positionNotifications";
import { NotificationCard } from "@/components/shared/NotificationCard";
import { isReorderBlocked } from "@/components/shared/protocolStatus";
import { COPY } from "@/copy";
import { useProtocolGateState } from "@/hooks/useProtocolGate";
import {
  invalidateSplitVaultOrderQuery,
  invalidateVaultQueries,
} from "@/utils/queryKeys";

/**
 * True when the "Apply Optimal Order" optimizer would move the position away
 * from `orderedIds` at once. Restoring such an order would only make the two
 * prompts recommend opposite orders, so the split warning defers to it.
 * Null when the optimizer cannot judge the order yet (no position params, or
 * a different vault set), so Restore must wait.
 */
function optimizerRejectsOrder(
  params: CalculatorParams | null,
  orderedIds: readonly Hex[],
): boolean | null {
  if (params === null) return null;
  const vaultsById = new Map(
    params.vaults.map((vault) => [vault.id.toLowerCase(), vault]),
  );
  const orderedVaults: Vault[] = [];
  for (const id of orderedIds) {
    const vault = vaultsById.get(id.toLowerCase());
    if (!vault) return null;
    orderedVaults.push(vault);
  }
  return (
    calculate({ ...params, vaults: orderedVaults }).optimalVaultOrder !== null
  );
}

export function SplitVaultOrderWarning({
  connectedAddress,
  currentVaultIds,
  onSuccess,
}: {
  connectedAddress: string | undefined;
  currentVaultIds: readonly string[];
  onSuccess: () => void;
}) {
  const { expectedVaultIds, hasMismatch, isError } =
    useSplitVaultOrder(currentVaultIds);
  const { params } = usePositionNotifications(connectedAddress);
  const { executeReorder, isProcessing, error } = useReorderVaults();
  const { applyReorderedOrder } = useReorderOverride();
  const gate = useProtocolGateState();
  const queryClient = useQueryClient();
  // The queue this card already repaired. The position read lags the reorder,
  // so the button stays disabled until the queue it shows actually changes.
  const currentOrderKey = currentVaultIds.join(",");
  const [repairedOrderKey, setRepairedOrderKey] = useState<string | null>(null);

  const optimizerVerdict = useMemo(
    () =>
      expectedVaultIds === null
        ? null
        : optimizerRejectsOrder(params, expectedVaultIds),
    [params, expectedVaultIds],
  );

  if (isError) {
    return (
      <NotificationCard
        tone="urgent"
        title={COPY.vaults.splitOrderWarning.unverifiedTitle}
        data-testid="split-vault-order-warning"
      >
        <span>{COPY.vaults.splitOrderWarning.unverifiedBody}</span>
      </NotificationCard>
    );
  }

  if (!hasMismatch || expectedVaultIds === null || optimizerVerdict === true) {
    return null;
  }

  const handleRepair = async () => {
    const success = await executeReorder(expectedVaultIds, {
      expectedCurrentVaultIds: currentVaultIds as readonly Hex[],
    });
    if (!success) return;
    setRepairedOrderKey(currentOrderKey);
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
          disabled:
            isProcessing ||
            optimizerVerdict === null ||
            repairedOrderKey === currentOrderKey ||
            isReorderBlocked(gate),
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
