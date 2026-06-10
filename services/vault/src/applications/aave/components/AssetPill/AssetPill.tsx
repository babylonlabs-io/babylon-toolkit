import { Popover } from "@babylonlabs-io/core-ui";
import { useRef, useState } from "react";
import { IoChevronDown } from "react-icons/io5";
import { useNavigate } from "react-router";

import { getTokenByAddress } from "@/services/token/tokenService";

import { useAaveConfig } from "../../context";
import { AssetListItem } from "../AssetSelectionModal/AssetListItem";

interface AssetPillProps {
  symbol: string;
  icon: string;
}

export function AssetPill({ symbol, icon }: AssetPillProps) {
  const navigate = useNavigate();
  const { borrowableReserves } = useAaveConfig();
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = (assetSymbol: string) => {
    setIsOpen(false);
    navigate(`/app/aave/reserve/${assetSymbol.toLowerCase()}`);
  };

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-1 rounded-full border border-secondary-strokeLight bg-neutral-200 p-2 transition-[filter] hover:brightness-95"
      >
        <img src={icon} alt={symbol} className="h-8 w-8 rounded-full" />
        <span className="whitespace-nowrap text-xl text-accent-primary">
          {symbol}
        </span>
        <IoChevronDown className="h-6 w-6 text-accent-secondary" />
      </button>

      <Popover
        open={isOpen}
        anchorEl={anchorRef.current}
        placement="bottom-start"
        offset={[0, 8]}
        onClickOutside={() => setIsOpen(false)}
        className="w-72 space-y-2 rounded-lg border border-secondary-strokeLight bg-surface p-2 shadow-lg"
      >
        {borrowableReserves.map((reserve) => (
          <AssetListItem
            key={reserve.reserveId.toString()}
            symbol={reserve.token.symbol}
            name={reserve.token.name}
            icon={getTokenByAddress(reserve.token.address)?.icon}
            onClick={() => handleSelect(reserve.token.symbol)}
          />
        ))}
      </Popover>
    </>
  );
}
