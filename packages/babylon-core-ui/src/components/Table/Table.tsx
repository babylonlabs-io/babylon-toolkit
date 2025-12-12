import { useRef, useMemo, useCallback, forwardRef, useImperativeHandle } from "react";
import { twJoin } from "tailwind-merge";
import { useTableScroll } from "@/hooks/useTableScroll";
import { useFrozenColumns } from "@/hooks/useFrozenColumns";
import { TableContext, TableContextType } from "../../context/Table.context";
import { Column } from "./components/Column";
import type { TableData, TableProps, TableStyleConfig, _TableStyles } from "./types";
import { TABLE_STYLE_PRESETS } from "./types";
import "./Table.css";
import { useControlledState } from "@/hooks/useControlledState";
import { useTableSort } from "@/hooks/useTableSort";
import { Row } from "./components/Row";

/**
 * Default style values
 */
const DEFAULT_STYLES: _TableStyles = {
  // Layout
  fullWidth: false,
  rowGap: false,
  rowGapSize: undefined,
  // Header
  background: true,
  backgroundColor: undefined,
  // Rows
  alternateColors: true,
  hoverEffect: true,
  rounded: false,
  border: false,
  borderRadius: undefined,
  borderColor: undefined,
  rowBackgroundColor: undefined,
  hoverColor: undefined,
  clickable: false,
};

/**
 * Flat style constructor with defaults applied
 */
function resolveStyleConfig(styleConfig?: string | TableStyleConfig): _TableStyles {
  if (!styleConfig) {
    return { ...DEFAULT_STYLES };
  }

  const config =
    typeof styleConfig === "string" ? (TABLE_STYLE_PRESETS[styleConfig] ?? {}) : styleConfig;

  return {
    ...DEFAULT_STYLES,
    ...config.layout,
    ...config.header,
    ...config.rows,
  };
}

function TableBase<T extends TableData>(
  {
    data,
    columns,
    className,
    wrapperClassName,
    fluid = false,
    hasMore = false,
    loading = false,
    onLoadMore,
    onRowSelect,
    onRowClick,
    isRowSelectable,
    styleConfig,

    selectedRow: selectedRowProp,
    defaultSelectedRow,
    onSelectedRowChange,

    // Multi-select props
    selectable = false,
    selectedRows: selectedRowsProp,
    onSelectedRowsChange,
    renderCheckbox,
    checkboxPosition = "left",
    showSelectAll = true,

    ...restProps
  }: TableProps<T>,
  ref: React.Ref<HTMLDivElement>,
) {
  const styles = useMemo(() => resolveStyleConfig(styleConfig), [styleConfig]);

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

  const [selectedRows, setSelectedRows] = useControlledState<Array<string | number>>({
    value: selectedRowsProp,
    defaultValue: [],
    onStateChange: onSelectedRowsChange,
  });

  const safeSelectedRows = selectedRows ?? [];

  const handleRowSelect = useCallback(
    (row: T) => {
      if (!onRowSelect || (isRowSelectable && !isRowSelectable(row))) return;
      const newValue = selectedRow === row.id ? null : row.id;
      setSelectedRow(newValue);
      onRowSelect(newValue === null ? null : row);
    },
    [onRowSelect, isRowSelectable, selectedRow, setSelectedRow],
  );

  const handleMultiRowSelect = useCallback(
    (row: T) => {
      if (isRowSelectable && !isRowSelectable(row)) return;
      const isSelected = safeSelectedRows.includes(row.id);
      const newSelectedRows = isSelected
        ? safeSelectedRows.filter((id) => id !== row.id)
        : [...safeSelectedRows, row.id];
      setSelectedRows(newSelectedRows);
    },
    [safeSelectedRows, setSelectedRows, isRowSelectable],
  );

  const handleSelectAll = useCallback(() => {
    if (safeSelectedRows.length === sortedData.length) {
      // Deselect all
      setSelectedRows([]);
    } else {
      // Select all selectable rows
      const allSelectableIds = sortedData
        .filter((row) => !isRowSelectable || isRowSelectable(row))
        .map((row) => row.id);
      setSelectedRows(allSelectableIds);
    }
  }, [sortedData, safeSelectedRows.length, setSelectedRows, isRowSelectable]);

  const contextValue = useMemo(
    () => ({
      data: sortedData,
      columns,
      sortStates,
      onColumnSort: handleColumnSort,
      onRowSelect: selectable ? handleMultiRowSelect : handleRowSelect,
      onRowClick,
      // Multi-select
      selectable,
      selectedRows: safeSelectedRows,
      onSelectAll: handleSelectAll,
      renderCheckbox,
      isRowSelectable,
      checkboxPosition,
      showSelectAll,
    }),
    [
      sortedData,
      columns,
      sortStates,
      handleColumnSort,
      handleRowSelect,
      handleMultiRowSelect,
      onRowClick,
      selectable,
      safeSelectedRows,
      handleSelectAll,
      renderCheckbox,
      isRowSelectable,
      checkboxPosition,
      showSelectAll,
    ],
  );

  const isHeadVisible = useMemo(() => {
    return columns.some((column) => column.header && column.header !== '');
  }, [columns]);

  const allSelectableRowsSelected = useMemo(() => {
    const selectableRows = sortedData.filter((row) => !isRowSelectable || isRowSelectable(row));
    return selectableRows.length > 0 && selectableRows.every((row) => safeSelectedRows.includes(row.id));
  }, [sortedData, safeSelectedRows, isRowSelectable]);

  // Build custom CSS variables for style overrides
  const customStyleVars = useMemo(() => {
    const vars: Record<string, string> = {};
    if (styles.rowGapSize) vars['--bbn-table-row-gap'] = styles.rowGapSize;
    if (styles.backgroundColor) vars['--bbn-table-header-bg'] = styles.backgroundColor;
    if (styles.borderRadius) vars['--bbn-table-row-radius'] = styles.borderRadius;
    if (styles.borderColor) vars['--bbn-table-row-border-color'] = styles.borderColor;
    if (styles.rowBackgroundColor) vars['--bbn-table-row-bg'] = styles.rowBackgroundColor;
    if (styles.hoverColor) vars['--bbn-table-row-hover-bg'] = styles.hoverColor;
    return Object.keys(vars).length > 0 ? vars : undefined;
  }, [styles]);

  return (
    <TableContext.Provider value={contextValue as TableContextType<unknown>}>
      <div ref={tableRef} className={twJoin("bbn-table-wrapper", fluid && "bbn-table-wrapper-fluid", wrapperClassName)}>
        <table
          className={twJoin(
            "bbn-table",
            fluid && "bbn-table-fluid",
            styles.rounded && "bbn-table-rounded",
            styles.fullWidth && "bbn-table-fullrow",
            styles.rowGap && "bbn-table-row-gap",
            className,
          )}
          style={customStyleVars as React.CSSProperties}
          {...restProps}
        >
          <thead className={twJoin("bbn-table-header", !styles.background && "bbn-table-header-transparent", isScrolledTop && "scrolled-top", !isHeadVisible && "hidden")}>
            <tr>
              {selectable && checkboxPosition === "left" && (
                <th className="bbn-table-cell-checkbox">
                  {showSelectAll && (
                    <div className="flex items-center justify-center">
                      {renderCheckbox ? (
                        <div onClick={handleSelectAll}>
                          {renderCheckbox(allSelectableRowsSelected, {} as T)}
                        </div>
                      ) : (
                        <input
                          type="checkbox"
                          checked={allSelectableRowsSelected}
                          onChange={handleSelectAll}
                          aria-label="Select all rows"
                        />
                      )}
                    </div>
                  )}
                </th>
              )}
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
              {selectable && checkboxPosition === "right" && (
                <th className="bbn-table-cell-checkbox">
                  {showSelectAll && (
                    <div className="flex items-center justify-center">
                      {renderCheckbox ? (
                        <div onClick={handleSelectAll}>
                          {renderCheckbox(allSelectableRowsSelected, {} as T)}
                        </div>
                      ) : (
                        <input
                          type="checkbox"
                          checked={allSelectableRowsSelected}
                          onChange={handleSelectAll}
                          aria-label="Select all rows"
                        />
                      )}
                    </div>
                  )}
                </th>
              )}
            </tr>
          </thead>
          <tbody
            className={twJoin(
              "bbn-table-body",
              styles.fullWidth && "bbn-table-body-full",
              !styles.alternateColors && "bbn-table-body-no-alternate",
              !styles.hoverEffect && "bbn-table-body-no-hover",
              styles.border ? "bbn-table-body-row-border" : !styles.alternateColors && "bbn-table-body-no-border",
              styles.clickable && "bbn-table-body-clickable",
            )}
          >
            {sortedData.map((row) => (
              <Row
                key={row.id}
                row={row}
                columns={columns}
                isSelected={selectable ? safeSelectedRows.includes(row.id) : selectedRow === row.id}
                isSelectable={isRowSelectable ? isRowSelectable(row) : true}
                onSelect={selectable ? handleMultiRowSelect : handleRowSelect}
                onRowClick={onRowClick}
                isLeftScrolled={isLeftScrolled}
                isRightScrolled={isRightScrolled}
                selectable={selectable}
                renderCheckbox={renderCheckbox}
                checkboxPosition={checkboxPosition}
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
