import {
  Button,
  DialogBody,
  DialogFooter,
  DialogHeader,
  ResponsiveDialog,
} from "@babylonlabs-io/core-ui";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { Hex } from "viem";

import type { CollateralVaultEntry } from "@/types/collateral";

import {
  NETWORK_FEE_LABEL,
  REORDER_INFO_TEXT,
  REORDER_MODAL_SUBTITLE,
  REORDER_MODAL_TITLE,
} from "./constants";
import { ReorderVaultItem } from "./ReorderVaultItem";
import { useReorderGasEstimate } from "./useReorderGasEstimate";
import { useReorderModal } from "./useReorderModal";

interface ReorderVaultsModalProps {
  isOpen: boolean;
  onClose: () => void;
  vaults: CollateralVaultEntry[];
  onSuccess: () => void;
}

export function ReorderVaultsModal({
  isOpen,
  onClose,
  vaults,
  onSuccess,
}: ReorderVaultsModalProps) {
  const {
    orderedVaults,
    hasOrderChanged,
    handleDragEnd,
    handleConfirm,
    isProcessing,
  } = useReorderModal({ vaults, isOpen });

  const vaultIds = orderedVaults.map((v) => v.vaultId as Hex);
  const { feeEth, feeUsd } = useReorderGasEstimate(
    vaultIds,
    isOpen && hasOrderChanged,
  );

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleConfirmClick = async () => {
    const success = await handleConfirm();
    if (success) {
      onClose();
      onSuccess();
    }
  };

  return (
    <ResponsiveDialog open={isOpen} onClose={onClose}>
      <DialogHeader title={REORDER_MODAL_TITLE} onClose={onClose} />
      <DialogBody className="space-y-4">
        <p className="text-sm text-accent-secondary">
          {REORDER_MODAL_SUBTITLE}
        </p>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={orderedVaults.map((v) => v.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="max-h-[400px] space-y-3 overflow-y-auto">
              {orderedVaults.map((vault, index) => (
                <ReorderVaultItem
                  key={vault.id}
                  id={vault.id}
                  amountBtc={vault.amountBtc}
                  position={index + 1}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {hasOrderChanged && (
          <p className="rounded-lg bg-secondary-contrast/5 p-3 text-sm text-accent-secondary">
            {REORDER_INFO_TEXT}
          </p>
        )}
      </DialogBody>
      <DialogFooter className="pt-3">
        <Button
          variant="contained"
          color="secondary"
          size="large"
          fluid
          onClick={handleConfirmClick}
          disabled={!hasOrderChanged || isProcessing}
        >
          {isProcessing ? "Confirming..." : "Confirm"}
        </Button>
        {hasOrderChanged && (
          <div className="flex items-center justify-between pt-3 text-sm text-accent-secondary">
            <span>{NETWORK_FEE_LABEL}</span>
            <span>
              {feeEth} {feeUsd}
            </span>
          </div>
        )}
      </DialogFooter>
    </ResponsiveDialog>
  );
}
