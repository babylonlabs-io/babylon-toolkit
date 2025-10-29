/**
 * Table column definitions for Position Overview
 */

import { Avatar, AvatarGroup, type ColumnProps } from "@babylonlabs-io/core-ui";

import type { Position } from "../../types/position";

export const positionColumns: ColumnProps<Position>[] = [
  {
    key: "borrowedAmount",
    header: "Loan",
    render: (_value: unknown, row: Position) => (
      <div className="flex items-center gap-2">
        <Avatar
          url="/images/usdc.png"
          alt="USDC"
          size="small"
          variant="circular"
        />
        <span className="text-sm text-accent-primary">{row.borrowedAmount}</span>
      </div>
    ),
  },
  {
    key: "market",
    header: "Market",
    render: (_value: unknown, row: Position) => (
      <div className="flex items-center gap-2">
        <AvatarGroup size="small">
          <Avatar
            url="/images/btc.png"
            alt="BTC"
            size="small"
            variant="circular"
          />
          <Avatar
            url="/images/usdc.png"
            alt="USDC"
            size="small"
            variant="circular"
          />
        </AvatarGroup>
        <span className="text-sm font-medium text-accent-primary">
          {row.market}
        </span>
      </div>
    ),
  },
  {
    key: "ltv",
    header: "LTV",
    render: (_value: unknown, row: Position) => (
      <span className="text-sm text-accent-primary">{row.lltv}</span>
    ),
  },
  {
    key: "liquidationLtv",
    header: "Liquidation LTV",
    render: (_value: unknown, row: Position) => (
      <span className="text-sm text-accent-primary">{row.liquidationLtv}</span>
    ),
  },
  {
    key: "borrowRate",
    header: "Borrow Rate",
    render: (_value: unknown, row: Position) => (
      <span className="text-sm text-accent-primary">{row.borrowRate}</span>
    ),
  },
  {
    key: "health",
    header: "Health",
    render: (_value: unknown, row: Position) => (
      <span className="text-sm text-accent-primary">{row.health}</span>
    ),
  },
];
