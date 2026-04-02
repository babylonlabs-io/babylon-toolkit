import { Avatar } from "@babylonlabs-io/core-ui";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { IoReorderThree } from "react-icons/io5";

import { getNetworkConfigBTC } from "@/config";
import { formatBtcAmount, formatOrdinal } from "@/utils/formatting";

const btcConfig = getNetworkConfigBTC();

interface ReorderVaultItemProps {
  id: string;
  amountBtc: number;
  position: number;
}

export function ReorderVaultItem({
  id,
  amountBtc,
  position,
}: ReorderVaultItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  // Movement is constrained to vertical-only by DndContext modifiers
  // (restrictToVerticalAxis + restrictToParentElement)
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between rounded-xl border border-secondary-strokeLight p-3 ${
        isDragging ? "z-10 opacity-80 shadow-lg" : ""
      }`}
    >
      <div className="flex items-center gap-3">
        <Avatar url={btcConfig.icon} alt={btcConfig.coinSymbol} size="small" />
        <span className="text-base font-medium text-accent-primary">
          {formatBtcAmount(amountBtc)} -{" "}
          <span className="font-mono text-sm opacity-75">
            {formatOrdinal(position)}
          </span>
        </span>
      </div>
      <button
        type="button"
        className="cursor-grab touch-none text-accent-secondary active:cursor-grabbing"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <IoReorderThree size={24} />
      </button>
    </div>
  );
}
