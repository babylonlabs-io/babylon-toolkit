/**
 * Mobile card view for Position Overview
 */

import { Avatar, VaultDetailCard } from "@babylonlabs-io/core-ui";

import type { Position } from "../../types/position";

interface PositionOverviewCardsProps {
  positions: Position[];
  onPositionClick: (position: Position) => void;
}

export function PositionOverviewCards({
  positions,
  onPositionClick,
}: PositionOverviewCardsProps) {
  return (
    <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto">
      {positions.map((position) => (
        <div
          key={position.id}
          onClick={() => onPositionClick(position)}
          className="cursor-pointer"
        >
          <VaultDetailCard
            id={position.id}
            title={{
              icons: ["/images/btc.png", "/images/usdc.png"],
              text: position.market,
            }}
            details={[
              {
                label: "Loan",
                value: (
                  <div className="flex items-center gap-2">
                    <Avatar
                      url="/images/usdc.png"
                      alt="USDC"
                      size="small"
                      variant="circular"
                    />
                    <span className="text-sm text-accent-primary">
                      {position.borrowedAmount}
                    </span>
                  </div>
                ),
              },
              { label: "LTV", value: position.lltv },
              { label: "Liquidation LTV", value: position.liquidationLtv },
              { label: "Borrow Rate", value: position.borrowRate },
              { label: "Health", value: position.health },
            ]}
          />
        </div>
      ))}
    </div>
  );
}
