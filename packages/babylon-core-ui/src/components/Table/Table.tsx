import { useRef, useMemo, useCallback, forwardRef, useImperativeHandle } from "react";
import { twJoin } from "tailwind-merge";
import { useTableScroll } from "@/hooks/useTableScroll";
import { useFrozenColumns } from "@/hooks/useFrozenColumns";
import { TableContext, TableContextType } from "../../context/Table.context";
import { Column } from "./components/Column";
import type { TableData, TableProps } from "./types";
import "./Table.css";
import { useControlledState } from "@/hooks/useControlledState";
import { useTableSort } from "@/hooks/useTableSort";
import { Row } from "./components/Row";

function TableBase<T extends TableData>(
  {
    data,
    columns,
    className,
    wrapperClassName,
    hasMore = false,
    loading = false,
    onLoadMore,
    onRowSelect,
    isRowSelectable,

    selectedRow: selectedRowProp,
    defaultSelectedRow,
    onSelectedRowChange,

    ...restProps
  }: TableProps<T>,
  ref: React.Ref<HTMLDivElement>,
) {
  const tableRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => tableRef.current!, []);

  const { sortStates, handleColumnSort, sortedData } = useTableSort(data, columns);
  const { isScrolledTop } = useTableScroll(tableRef, { onLoadMore, hasMore, loading });
  const { isLeftScrolled, isRightScrolled } = useFrozenColumns(tableRef);

  const [selectedRow, setSelectedRow] = useControlledState<string | number | null>({
    value: selectedRowProp,
    defaultValue: defaultSelectedRow ?? null,
    onStateChange: onSelectedRowChange,
  });

  const handleRowSelect = useCallback(
    (row: T) => {
      if (!onRowSelect || (isRowSelectable && !isRowSelectable(row))) return;
      const newValue = selectedRow === row.id ? null : row.id;
      setSelectedRow(newValue);
      onRowSelect(newValue === null ? null : row);
    },
    [onRowSelect, isRowSelectable, selectedRow, setSelectedRow],
  );

  const contextValue = useMemo(
    () => ({
      data: sortedData,
      columns,
      sortStates,
      onColumnSort: handleColumnSort,
      onRowSelect: handleRowSelect,
    }),
    [sortedData, columns, sortStates, handleColumnSort, handleRowSelect],
  );

  return (
    <TableContext.Provider value={contextValue as TableContextType<unknown>}>
      <div ref={tableRef} className={twJoin("bbn-table-wrapper", wrapperClassName)}>
        <table className={twJoin("bbn-table", className)} {...restProps}>
          <thead className={twJoin("bbn-table-header", isScrolledTop && "scrolled-top")}>
            <tr>
              {columns.map((column) => (
                <Column 
                  key={column.key} 
                  className={column.headerClassName} 
                  name={column.key} 
                  sorter={column.sorter}
                  frozen={column.frozen}
                  showFrozenShadow={
                    (column.frozen === 'left' && isLeftScrolled) || 
                    (column.frozen === 'right' && isRightScrolled)
                  }
                >
                  {column.header}
                </Column>
              ))}
            </tr>
          </thead>
          <tbody className="bbn-table-body">
            {sortedData.map((row) => (
              <Row
                key={row.id}
                row={row}
                columns={columns}
                isSelected={selectedRow === row.id}
                isSelectable={isRowSelectable ? isRowSelectable(row) : true}
                onSelect={handleRowSelect}
                isLeftScrolled={isLeftScrolled}
                isRightScrolled={isRightScrolled}
              />
            ))}
          </tbody>
        </table>
      </div>
    </TableContext.Provider>
  );
}

export const Table = forwardRef(TableBase) as <T extends TableData>(
  props: TableProps<T> & { ref?: React.Ref<HTMLDivElement> },
) => React.ReactElement;
