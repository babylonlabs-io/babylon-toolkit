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
  selectable = false,
  renderCheckbox,
  checkboxPosition = "left",
}: {
  row: T;
  columns: ColumnProps<T>[];
  isSelected: boolean;
  isSelectable: boolean;
  onSelect: (row: T) => void;
  onRowClick?: (row: T) => void;
  isLeftScrolled?: boolean;
  isRightScrolled?: boolean;
  selectable?: boolean;
  renderCheckbox?: (checked: boolean, row: T) => React.ReactNode;
  checkboxPosition?: "left" | "right";
}) {
  const handleClick = () => {
    if (onRowClick) {
      onRowClick(row);
    } else if (onSelect && !selectable) {
      onSelect(row);
    }
  };

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSelectable && onSelect) {
      onSelect(row);
    }
  };

  const checkboxCell = selectable ? (
    <td className="bbn-table-cell-checkbox">
      <div className="flex items-center justify-center" onClick={handleCheckboxClick}>
        {renderCheckbox ? (
          renderCheckbox(isSelected, row)
        ) : (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => {}}
            disabled={!isSelectable}
            aria-label={`Select row ${row.id}`}
          />
        )}
      </div>
    </td>
  ) : null;

  return (
    <tr
      className={twJoin(
        isSelected && "selected",
        (!!onSelect || !!onRowClick) && isSelectable && "cursor-pointer",
        !isSelectable && "opacity-50",
      )}
      onClick={handleClick}
    >
      {checkboxPosition === "left" && checkboxCell}
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
      {checkboxPosition === "right" && checkboxCell}
    </tr>
  );
}
