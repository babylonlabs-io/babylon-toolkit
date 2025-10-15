import { twJoin } from "tailwind-merge";
import { Cell } from "./Cell";
import { ColumnProps } from "../types";

export function Row<T extends { id: string | number }>({
  row,
  columns,
  isSelected,
  isSelectable,
  onSelect,
  onRowClick,
  isLeftScrolled,
  isRightScrolled,
}: {
  row: T;
  columns: ColumnProps<T>[];
  isSelected: boolean;
  isSelectable: boolean;
  onSelect: (row: T) => void;
  onRowClick?: (row: T) => void;
  isLeftScrolled?: boolean;
  isRightScrolled?: boolean;
}) {
  const handleClick = () => {
    if (onRowClick) {
      onRowClick(row);
    } else if (onSelect) {
      onSelect(row);
    }
  };

  return (
    <tr
      className={twJoin(
        isSelected && "selected",
        (!!onSelect || !!onRowClick) && isSelectable && "cursor-pointer",
        !isSelectable && "opacity-50",
      )}
      onClick={handleClick}
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
