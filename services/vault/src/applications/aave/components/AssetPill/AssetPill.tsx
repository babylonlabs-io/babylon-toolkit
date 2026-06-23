import { Popover } from "@babylonlabs-io/core-ui";
import { useEffect, useRef, useState } from "react";
import { IoChevronDown } from "react-icons/io5";

import { getTokenByAddress } from "@/services/token/tokenService";

import type { LoanTab } from "../../constants";
import { useReserveDetailModal } from "../../context";
import type { AaveReserveConfig } from "../../services/fetchConfig";
import { AssetListItem } from "../AssetSelectionModal/AssetListItem";

interface AssetPillProps {
  symbol: string;
  icon: string;
  /**
   * Reserves to offer in the switcher. Borrow passes the borrowable reserves;
   * repay passes the user's borrowed reserves (the assets that can be repaid).
   */
  reserves: AaveReserveConfig[];
  /** Current mode, preserved when switching asset (stays on borrow vs repay). */
  mode: LoanTab;
  /** Lock the switcher (e.g. while a borrow/repay tx is signing/submitting). */
  disabled?: boolean;
}

export function AssetPill({
  symbol,
  icon,
  reserves,
  mode,
  disabled = false,
}: AssetPillProps) {
  const { openReserveDetail } = useReserveDetailModal();
  const anchorRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  // Bring the currently-selected asset into view when the list opens — it may
  // sit below the fold once the scrollable list grows past its max height.
  useEffect(() => {
    if (!isOpen) return;
    const frame = requestAnimationFrame(() => {
      listRef.current
        ?.querySelector('[aria-current="true"]')
        ?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  const handleSelect = (assetSymbol: string) => {
    setIsOpen(false);
    // Keep the current mode so switching asset from repay stays on repay.
    openReserveDetail(assetSymbol, mode);
  };

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-1 rounded-full border border-secondary-strokeLight bg-neutral-200 p-2 transition-[filter] hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100"
      >
        <img src={icon} alt={symbol} className="h-8 w-8 rounded-full" />
        <span className="whitespace-nowrap text-xl text-accent-primary">
          {symbol}
        </span>
        <IoChevronDown
          className={`h-6 w-6 text-accent-secondary transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      <Popover
        open={isOpen}
        anchorEl={anchorRef.current}
        placement="bottom-start"
        offset={[0, 8]}
        onClickOutside={() => setIsOpen(false)}
        className="max-h-80 w-72 overflow-y-auto rounded-lg border border-secondary-strokeLight bg-surface p-2 shadow-lg"
      >
        <div ref={listRef} className="space-y-2">
          {reserves.map((reserve) => (
            <AssetListItem
              key={reserve.reserveId.toString()}
              symbol={reserve.token.symbol}
              name={reserve.token.name}
              icon={getTokenByAddress(reserve.token.address)?.icon}
              selected={reserve.token.symbol === symbol}
              onClick={() => handleSelect(reserve.token.symbol)}
            />
          ))}
        </div>
      </Popover>
    </>
  );
}
