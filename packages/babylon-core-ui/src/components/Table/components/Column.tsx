import { type PropsWithChildren, type HTMLAttributes, useContext } from "react";
import { twJoin } from "tailwind-merge";
import { RiArrowUpSFill, RiArrowDownSFill } from "react-icons/ri";

import { TableContext } from "../../../context/Table.context";
import { Text } from "@/components/Text";

interface ColumnProps<T = unknown> {
  name?: string;
  sorter?: (a: T, b: T) => number;
  className?: string;
  frozen?: 'left' | 'right';
  showFrozenShadow?: boolean;
}

export function Column<T>({
  name,
  className,
  children,
  sorter,
  frozen,
  showFrozenShadow,
  ...restProps
}: PropsWithChildren<ColumnProps<T> & HTMLAttributes<HTMLTableCellElement>>) {
  const { columns, sortStates, onColumnSort } = useContext(TableContext);
  const sortState = sortStates[name ?? ""];
  const sortDirection = sortState?.direction;

  const frozenClasses = frozen ? `bbn-table-frozen bbn-table-frozen-${frozen}` : '';
  const shadowClass = frozen && showFrozenShadow ? 'bbn-frozen-shadow' : '';

  return (
    <Text
      variant="caption"
      as="th"
      className={twJoin(`bbn-cell-left`, sorter && "bbn-table-sortable", frozenClasses, shadowClass, className)}
      onClick={() => {
        if (sorter && name) {
          const column = columns.find((col) => col.key === name);
          onColumnSort?.(name, column?.sorter);
        }
      }}
      data-column={name}
      {...restProps}
    >
      <div className="flex items-center justify-between gap-1">
        <span>{children}</span>
        {sorter && (
          <span className="bbn-table-sort-icons">
            <RiArrowUpSFill
              className={twJoin(
                "bbn-sort-icon bbn-sort-icon-up",
                sortDirection === "asc" ? "bbn-sort-icon-active" : "bbn-sort-icon-inactive",
              )}
            />
            <RiArrowDownSFill
              className={twJoin(
                "bbn-sort-icon bbn-sort-icon-down",
                sortDirection === "desc" ? "bbn-sort-icon-active" : "bbn-sort-icon-inactive",
              )}
            />
          </span>
        )}
      </div>
    </Text>
  );
}
