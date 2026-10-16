import { Avatar, IconButton } from "@babylonlabs-io/core-ui";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useRef } from "react";
import { IoChevronDown, IoChevronUp, IoReorderThree } from "react-icons/io5";

import { getNetworkConfigBTC } from "@/config";
import { COPY } from "@/copy";
import { formatBtcAmount, formatOrdinal } from "@/utils/formatting";

const btcConfig = getNetworkConfigBTC();

type MoveDirection = "up" | "down";

interface ReorderVaultItemProps {
  id: string;
  amountBtc: number;
  position: number;
  isFirst: boolean;
  isLast: boolean;
  disabled: boolean;
  onMove: (id: string, direction: MoveDirection) => void;
}

export function ReorderVaultItem({
  id,
  amountBtc,
  position,
  isFirst,
  isLast,
  disabled,
  onMove,
}: ReorderVaultItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  const moveUpRef = useRef<HTMLButtonElement>(null);
  const moveDownRef = useRef<HTMLButtonElement>(null);
  const focusAfterMove = useRef<MoveDirection | null>(null);

  useEffect(() => {
    const direction = focusAfterMove.current;
    if (direction === null) return;
    focusAfterMove.current = null;
    const pressed = direction === "up" ? moveUpRef : moveDownRef;
    const other = direction === "up" ? moveDownRef : moveUpRef;
    const target = (pressed.current?.disabled ? other : pressed).current;
    target?.focus();
    target?.scrollIntoView({ block: "nearest" });
  }, [position]);

  const handleMove = (direction: MoveDirection) => {
    focusAfterMove.current = direction;
    onMove(id, direction);
  };

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
      <div className="flex items-center gap-2">
        <IconButton
          ref={moveUpRef}
          type="button"
          size="small"
          className="[@media(pointer:coarse)]:size-11"
          aria-label={COPY.reorder.moveUp(formatOrdinal(position))}
          disabled={disabled || isFirst}
          onClick={() => handleMove("up")}
        >
          <IoChevronUp size={16} />
        </IconButton>
        <IconButton
          ref={moveDownRef}
          type="button"
          size="small"
          className="[@media(pointer:coarse)]:size-11"
          aria-label={COPY.reorder.moveDown(formatOrdinal(position))}
          disabled={disabled || isLast}
          onClick={() => handleMove("down")}
        >
          <IoChevronDown size={16} />
        </IconButton>
        <button
          type="button"
          className="cursor-grab touch-manipulation text-accent-secondary active:cursor-grabbing"
          aria-label={COPY.reorder.dragHandle}
          {...attributes}
          {...listeners}
        >
          <IoReorderThree size={24} />
        </button>
      </div>
    </div>
  );
}
