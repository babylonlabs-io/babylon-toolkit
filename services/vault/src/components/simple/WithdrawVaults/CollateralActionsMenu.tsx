/**
 * CollateralActionsMenu Component
 * The "⋯" overflow menu on the Collateral summary card. Exposes the Withdraw
 * and Reorder actions in a popover anchored to a circular icon button.
 */

import { Popover } from "@babylonlabs-io/core-ui";
import { useRef, useState } from "react";
import { MdMoreHoriz } from "react-icons/md";

import { COPY } from "@/copy";

const MENU_ICON_SIZE = 24;
/** Popover gap from the trigger: [skidding, distance] in px. */
const POPOVER_OFFSET: [number, number] = [0, 8];

const TRIGGER_CLASS =
  "flex h-10 w-10 items-center justify-center rounded-full border border-secondary-strokeDark text-accent-primary";
const PANEL_CLASS =
  "w-[180px] rounded-lg border border-secondary-strokeLight bg-neutral-200 p-2 shadow-[0px_8px_8px_rgba(0,0,0,0.12)]";
const MENU_ITEM_CLASS =
  "w-full rounded px-3 py-2 text-left text-sm text-accent-primary hover:bg-secondary-highlight disabled:cursor-not-allowed disabled:text-accent-secondary disabled:opacity-50 disabled:hover:bg-transparent";

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
        className={TRIGGER_CLASS}
      >
        <MdMoreHoriz size={MENU_ICON_SIZE} />
      </button>
      <Popover
        open={open}
        anchorEl={anchorRef.current}
        placement="bottom-end"
        offset={POPOVER_OFFSET}
        onClickOutside={() => setOpen(false)}
        className={PANEL_CLASS}
      >
        <ul role="menu" className="flex flex-col">
          <li role="none">
            <button
              type="button"
              role="menuitem"
              onClick={() => runAction(onWithdraw)}
              className={MENU_ITEM_CLASS}
            >
              {COPY.collateral.menu.withdraw}
            </button>
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              disabled={!canReorder}
              onClick={() => runAction(onReorder)}
              className={MENU_ITEM_CLASS}
            >
              {COPY.collateral.menu.reorder}
            </button>
          </li>
        </ul>
      </Popover>
    </>
  );
}
