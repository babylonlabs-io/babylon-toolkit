import type { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Hex } from "viem";

import { useReorderVaults } from "@/applications/aave/hooks";
import type { CollateralVaultEntry } from "@/types/collateral";

interface UseReorderModalParams {
  vaults: CollateralVaultEntry[];
  isOpen: boolean;
}

export interface UseReorderModalResult {
  orderedVaults: CollateralVaultEntry[];
  hasOrderChanged: boolean;
  handleDragEnd: (event: DragEndEvent) => void;
  handleConfirm: () => Promise<boolean>;
  isProcessing: boolean;
  /** Last failure message, shown inline under the action (null when none). */
  error: string | null;
}

export function useReorderModal({
  vaults,
  isOpen,
}: UseReorderModalParams): UseReorderModalResult {
  const [orderedVaults, setOrderedVaults] =
    useState<CollateralVaultEntry[]>(vaults);
  // The vault ordering the user reviewed at modal open. Drag mutations
  // only touch `orderedVaults`; this baseline stays put so the signing
  // guard can detect concurrent live-state changes during the user's
  // think-time.
  const [baselineVaultIds, setBaselineVaultIds] = useState<readonly Hex[]>(() =>
    vaults.map((v) => v.vaultId as Hex),
  );
  const { executeReorder, isProcessing, error } = useReorderVaults();

  // Initialize order only when modal opens — intentionally excludes `vaults`
  // to prevent background React Query refetches from resetting user's drag order
  useEffect(() => {
    if (isOpen) {
      setOrderedVaults(vaults);
      setBaselineVaultIds(vaults.map((v) => v.vaultId as Hex));
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

  const handleConfirm = useCallback(async () => {
    const permutedVaultIds = orderedVaults.map((v) => v.vaultId as Hex);
    return executeReorder(permutedVaultIds, {
      expectedCurrentVaultIds: baselineVaultIds,
    });
  }, [orderedVaults, baselineVaultIds, executeReorder]);

  return {
    orderedVaults,
    hasOrderChanged,
    handleDragEnd,
    handleConfirm,
    isProcessing,
    error,
  };
}
