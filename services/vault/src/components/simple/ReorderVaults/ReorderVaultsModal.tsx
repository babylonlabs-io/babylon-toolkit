import { Button, Callout, Heading, Text } from "@babylonlabs-io/core-ui";
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

import { useReorderOverride } from "@/applications/aave/context";
import { V3ModalShell } from "@/components/shared/V3ModalShell";
import { COPY } from "@/copy";
import type { CollateralVaultEntry } from "@/types/collateral";

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
    error,
  } = useReorderModal({ vaults, isOpen });

  const vaultIds = orderedVaults.map((v) => v.vaultId as Hex);
  const { feeEth, feeUsd } = useReorderGasEstimate(
    vaultIds,
    isOpen && hasOrderChanged,
  );

  const { applyReorderedOrder } = useReorderOverride();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Prevent closing while transaction is in-flight
  const handleClose = isProcessing ? undefined : onClose;

  const handleConfirmClick = async () => {
    const success = await handleConfirm();
    if (success) {
      // Show the just-submitted order immediately; the indexer catches up later.
      applyReorderedOrder(vaultIds);
      onClose();
      onSuccess();
    }
  };

  return (
    <V3ModalShell
      open={isOpen}
      onClose={handleClose}
      contentClassName="max-w-[564px]"
    >
      <div className="flex w-full flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Heading
            variant="h5"
            as="h2"
            className="font-normal text-accent-primary"
          >
            {COPY.reorder.modalTitle}
          </Heading>
          <Text variant="subtitle1" className="text-accent-secondary">
            {COPY.reorder.modalSubtitle}
          </Text>
        </div>

        <div className="flex flex-col gap-6">
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
              <div className="flex max-h-[400px] flex-col gap-3 overflow-y-auto">
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
              {COPY.reorder.infoText}
            </p>
          )}

          <div>
            <Button
              variant="contained"
              color="secondary"
              size="large"
              fluid
              onClick={handleConfirmClick}
              disabled={!hasOrderChanged || isProcessing}
            >
              {isProcessing
                ? COPY.common.confirming
                : COPY.reorder.confirmButton}
            </Button>
            {error && (
              <Callout
                variant="error"
                title={COPY.common.transactionFailedTitle}
                className="mt-3"
              >
                {error}
              </Callout>
            )}
            {hasOrderChanged && (
              <div className="flex items-center justify-between pt-3 text-sm text-accent-secondary">
                <span>{COPY.reorder.networkFeeLabel}</span>
                <span>
                  {feeEth} {feeUsd}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </V3ModalShell>
  );
}
