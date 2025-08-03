import { twJoin } from "tailwind-merge";
import { Cell } from "./Cell";
import { ColumnProps } from "../types";

export function Row<T extends { id: string | number }>({
  row,
  columns,
  isSelected,
  isSelectable,
  onSelect,
  isLeftScrolled,
  isRightScrolled,
}: {
  row: T;
  columns: ColumnProps<T>[];
  isSelected: boolean;
  isSelectable: boolean;
  onSelect: (row: T) => void;
  isLeftScrolled?: boolean;
  isRightScrolled?: boolean;
}) {
  return (
    <tr
      className={twJoin(
        isSelected && "selected",
        !!onSelect && isSelectable && "cursor-pointer",
        !isSelectable && "opacity-50",
      )}
      onClick={() => onSelect(row)}
    >
      {columns.map((column) => (
        <Cell
          key={column.key}
          value={row[column.key as keyof T]}
          columnName={column.key}
          className={column.cellClassName}
          frozen={column.frozen}
          showFrozenShadow={
            (column.frozen === 'left' && isLeftScrolled) || 
            (column.frozen === 'right' && isRightScrolled)
          }
          render={column.render ? (value) => column.render!(value, row) : undefined}
        />
      ))}
    </tr>
  );
}
