/**
 * Desktop table view for Position Overview
 */

import { Table } from "@babylonlabs-io/core-ui";

import type { Position } from "../../../types/position";

import { positionColumns } from "./columns";

interface PositionOverviewTableProps {
  positions: Position[];
  onPositionClick: (position: Position) => void;
}

export function PositionOverviewTable({
  positions,
  onPositionClick,
}: PositionOverviewTableProps) {
  return (
    <div className="max-h-[500px] overflow-x-auto overflow-y-auto bg-primary-contrast">
      <Table
        data={positions}
        columns={positionColumns}
        fluid
        onRowClick={onPositionClick}
      />
    </div>
  );
}
