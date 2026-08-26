import { createContext } from "react";
import type { ColumnProps } from "../components/Table/types";

export interface TableContextType<T = unknown> {
  data: T[];
  columns: ColumnProps<T>[];
  sortStates: {
    [key: string]: {
      direction: "asc" | "desc" | null;
      priority: number;
    };
  };
  onColumnSort?: (columnKey: string, sorter?: (a: T, b: T) => number) => void;
  onRowSelect?: (row: T) => void;
  onRowClick?: (row: T) => void;
  // Multi-select
  selectable?: boolean;
  selectedRows?: Array<string | number>;
  onSelectAll?: () => void;
  renderCheckbox?: (checked: boolean, row: T) => React.ReactNode;
  isRowSelectable?: (row: T) => boolean;
  checkboxPosition?: "left" | "right";
  showSelectAll?: boolean;
}

export const TableContext = createContext<TableContextType<unknown>>({
  data: [],
  columns: [],
  sortStates: {},
  onColumnSort: undefined,
  onRowSelect: undefined,
  onRowClick: undefined,
  selectable: false,
  selectedRows: [],
  onSelectAll: undefined,
  renderCheckbox: undefined,
  isRowSelectable: undefined,
  checkboxPosition: "left",
  showSelectAll: true,
});
