/**
 * CollateralActionsMenu Component
 * The "⋯" overflow menu on the Collateral summary card. Exposes the Withdraw
 * and Reorder actions in a popover anchored to a circular icon button.
 */

import { Popover } from "@babylonlabs-io/core-ui";
import { useRef, useState } from "react";
import { MdMoreHoriz } from "react-icons/md";

import { COPY } from "@/copy";

interface CollateralActionsMenuProps {
  onWithdraw: () => void;
  onReorder: () => void;
  /** Reorder needs at least two vaults; the row is disabled otherwise. */
  canReorder: boolean;
}

export function CollateralActionsMenu({
  onWithdraw,
  onReorder,
  canReorder,
}: CollateralActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  const runAction = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={COPY.collateral.menu.triggerLabel}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-secondary-strokeDark text-accent-primary"
      >
        <MdMoreHoriz size={24} />
      </button>
      <Popover
        open={open}
        anchorEl={anchorRef.current}
        placement="bottom-end"
        offset={[0, 8]}
        onClickOutside={() => setOpen(false)}
        className="w-[180px] rounded-lg border border-secondary-strokeLight bg-neutral-200 p-2 shadow-[0px_8px_8px_rgba(0,0,0,0.12)]"
      >
        <ul role="menu" className="flex flex-col">
          <li
            role="menuitem"
            onClick={() => runAction(onWithdraw)}
            className="cursor-pointer rounded px-3 py-2 text-sm text-accent-primary hover:bg-secondary-highlight"
          >
            {COPY.collateral.menu.withdraw}
          </li>
          <li
            role="menuitem"
            aria-disabled={!canReorder}
            onClick={() => canReorder && runAction(onReorder)}
            className={
              canReorder
                ? "cursor-pointer rounded px-3 py-2 text-sm text-accent-primary hover:bg-secondary-highlight"
                : "cursor-not-allowed rounded px-3 py-2 text-sm text-accent-secondary opacity-50"
            }
          >
            {COPY.collateral.menu.reorder}
          </li>
        </ul>
      </Popover>
    </>
  );
}
