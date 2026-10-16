import type { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Hex } from "viem";

import { useReorderVaults } from "@/applications/aave/hooks";
import type { CollateralAmountPair } from "@/applications/aave/services";
import type { PendingAaveWrite } from "@/applications/aave/services/pendingAaveWrite";
import type { CollateralVaultEntry } from "@/types/collateral";

interface UseReorderModalParams {
  vaults: CollateralVaultEntry[];
  isOpen: boolean;
}

/** The vault IDs and the amounts the modal shows, in the order it shows them. */
function toCollateralAmountPairs(
  vaults: CollateralVaultEntry[],
): CollateralAmountPair[] {
  return vaults.map((vault) => ({
    vaultId: vault.vaultId as Hex,
    amountSats: vault.amountSats,
  }));
}

export interface UseReorderModalResult {
  orderedVaults: CollateralVaultEntry[];
  hasOrderChanged: boolean;
  handleDragEnd: (event: DragEndEvent) => void;
  moveVault: (vaultId: string, direction: "up" | "down") => void;
  handleConfirm: () => Promise<boolean>;
  isProcessing: boolean;
  /** The account's Aave write in progress, which keeps the confirm disabled. */
  pendingWrite: PendingAaveWrite | null;
  /** Last failure message, shown inline under the action (null when none). */
  error: string | null;
  /** Last outcome that is not a failure (null when none). */
  notice: string | null;
}

export function useReorderModal({
  vaults,
  isOpen,
}: UseReorderModalParams): UseReorderModalResult {
  const [orderedVaults, setOrderedVaults] =
    useState<CollateralVaultEntry[]>(vaults);
  // The vault ordering and amounts the user reviewed at modal open. Drag
  // mutations only touch `orderedVaults`; this baseline stays put so the
  // signing guards can detect concurrent live-state changes during the
  // user's think-time and bind the reviewed amounts to the registry.
  const [baselineVaults, setBaselineVaults] = useState<
    readonly CollateralAmountPair[]
  >(() => toCollateralAmountPairs(vaults));
  const { executeReorder, isProcessing, pendingWrite, error, notice } =
    useReorderVaults();

  // Initialize order only when modal opens — intentionally excludes `vaults`
  // to prevent background React Query refetches from resetting user's drag order
  useEffect(() => {
    if (isOpen) {
      setOrderedVaults(vaults);
      setBaselineVaults(toCollateralAmountPairs(vaults));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const hasOrderChanged = useMemo(() => {
    if (orderedVaults.length !== vaults.length) return false;
    return orderedVaults.some((v, i) => v.id !== vaults[i].id);
  }, [orderedVaults, vaults]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setOrderedVaults((current) => {
      const oldIndex = current.findIndex((v) => v.id === active.id);
      const newIndex = current.findIndex((v) => v.id === over.id);
      return arrayMove(current, oldIndex, newIndex);
    });
  }, []);

  const moveVault = useCallback((vaultId: string, direction: "up" | "down") => {
    setOrderedVaults((current) => {
      const index = current.findIndex((v) => v.id === vaultId);
      const target = direction === "up" ? index - 1 : index + 1;
      if (index === -1 || target < 0 || target >= current.length) {
        return current;
      }
      return arrayMove(current, index, target);
    });
  }, []);

  const handleConfirm = useCallback(async () => {
    const permutedVaultIds = orderedVaults.map((v) => v.vaultId as Hex);
    return executeReorder(permutedVaultIds, {
      kind: "manual",
      expectedCurrentVaults: baselineVaults,
    });
  }, [orderedVaults, baselineVaults, executeReorder]);

  return {
    orderedVaults,
    hasOrderChanged,
    handleDragEnd,
    moveVault,
    handleConfirm,
    isProcessing,
    pendingWrite,
    error,
    notice,
  };
}
