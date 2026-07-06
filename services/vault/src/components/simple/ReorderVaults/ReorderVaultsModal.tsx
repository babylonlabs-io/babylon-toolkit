import {
  Button,
  Callout,
  FullScreenDialog,
  Heading,
  Text,
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

import { useReorderOverride } from "@/applications/aave/context";
import { COPY } from "@/copy";
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
    <FullScreenDialog
      open={isOpen}
      onClose={handleClose}
      className="items-center justify-center p-6"
    >
      <div className="mx-auto flex w-full max-w-[564px] flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Heading
            variant="h5"
            as="h2"
            className="font-normal text-accent-primary"
          >
            {REORDER_MODAL_TITLE}
          </Heading>
          <Text variant="subtitle1" className="text-accent-secondary">
            {REORDER_MODAL_SUBTITLE}
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
              {REORDER_INFO_TEXT}
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
                <span>{NETWORK_FEE_LABEL}</span>
                <span>
                  {feeEth} {feeUsd}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </FullScreenDialog>
  );
}
