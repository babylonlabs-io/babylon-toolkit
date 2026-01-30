import type { ReactNode } from "react";

export type ColumnProps<T = unknown> = {
  key: string;
  header: string;
  headerClassName?: string;
  cellClassName?: string;
  render?: (value: unknown, row: T) => ReactNode;
  sorter?: (a: T, b: T) => number;
  frozen?: 'left' | 'right';
};

export type TableData = { id: string | number };

/**
 * Table style configuration for customizing visual appearance.
 */
export interface TableStyleConfig {
  /**
   * Layout options
   */
  layout?: {
    /**
     * Make the table take full width of its container
     * @default false
     */
    fullWidth?: boolean;

    /**
     * Add vertical gaps between rows
     * @default false
     */
    rowGap?: boolean;

    /**
     * Custom gap size between rows (requires rowGap: true)
     * @example "0.5rem", "8px", "1rem"
     * @default "0.5rem"
     */
    rowGapSize?: string;
  };

  /**
   * Header options
   */
  header?: {
    /**
     * Show header background
     * @default true
     */
    background?: boolean;

    /**
     * Custom header background color (CSS value or variable)
     * @example "var(--color-surface)", "#f5f5f5", "transparent"
     */
    backgroundColor?: string;
  };

  /**
   * Row visual options
   */
  rows?: {
    /**
     * Show alternating row background colors (zebra striping)
     * @default true
     */
    alternateColors?: boolean;

    /**
     * Show hover effect on rows
     * @default true
     */
    hoverEffect?: boolean;

    /**
     * Apply rounded corners to each row
     * @default false
     */
    rounded?: boolean;

    /**
     * Custom border radius for rows (requires rounded: true)
     * @example "0.5rem", "8px", "1rem"
     * @default "0.5rem" (rounded-lg)
     */
    borderRadius?: string;

    /**
     * Show border around each row
     * @default false
     */
    border?: boolean;

    /**
     * Custom border color (CSS value or variable)
     * @example "var(--color-border)", "#e0e0e0", "rgba(0,0,0,0.1)"
     */
    borderColor?: string;

    /**
     * Custom row background color (CSS value or variable)
     * Used when alternateColors is false
     * @example "var(--color-surface-raised)", "#ffffff"
     */
    backgroundColor?: string;

    /**
     * Custom hover background color (CSS value or variable)
     * @example "var(--color-surface-hover)", "#f0f0f0"
     */
    hoverColor?: string;

    /**
     * Show pointer cursor on rows (for clickable rows)
     * @default false
     */
    clickable?: boolean;
  };
}

/**
 * @internal
 * Flat table styles
 */
export interface _TableStyles {
  fullWidth: boolean;
  rowGap: boolean;
  rowGapSize?: string;

  background: boolean;
  backgroundColor?: string;

  alternateColors: boolean;
  hoverEffect: boolean;
  rounded: boolean;
  border: boolean;
  borderRadius?: string;
  borderColor?: string;
  rowBackgroundColor?: string;
  hoverColor?: string;
  clickable: boolean;
}

/**
 * Preset style configurations for common table layouts
 */
export const TABLE_STYLE_PRESETS: Record<string, TableStyleConfig> = {
  /**
   * Default table style - alternating colors, hover effects, standard header
   */
  default: {},

  /**
   * Card style - transparent header, card-like rows with gaps
   * Ideal for dashboard cards and modern interfaces
   */
  card: {
    layout: {
      fullWidth: true,
      rowGap: true,
    },
    header: {
      background: false,
    },
    rows: {
      alternateColors: false,
      hoverEffect: false,
      rounded: true,
      border: false,
    },
  },
};

export type TableStylePreset = keyof typeof TABLE_STYLE_PRESETS;

export type TableProps<T extends TableData> = ControlledTableProps & {
  data: T[];
  columns: ColumnProps<T>[];
  className?: string;
  wrapperClassName?: string;
  fluid?: boolean;
  hasMore?: boolean;
  loading?: boolean;
  onLoadMore?: () => void;
  onRowSelect?: (row: T | null) => void;
  onRowClick?: (row: T) => void;
  isRowSelectable?: (row: T) => boolean;
  /** Function to determine if a row should be visually disabled (greyed out) */
  isRowDisabled?: (row: T) => boolean;

  /**
   * Base style preset for the table ('default', 'card').
   * Use with `styleConfig` to override specific preset options.
   * @example stylePreset="card"
   */
  stylePreset?: TableStylePreset;

  /**
   * Custom style configuration for the table.
   * When used with `stylePreset`, these options override the preset values.
   * @example styleConfig={{ rows: { hoverEffect: true } }}
   */
  styleConfig?: TableStyleConfig;

  // Multi-select support
  selectable?: boolean;
  selectedRows?: Array<string | number>;
  onSelectedRowsChange?: (rowIds: Array<string | number>) => void;
  renderCheckbox?: (checked: boolean, row: T) => ReactNode;
  checkboxPosition?: "left" | "right";
  showSelectAll?: boolean;
};

export interface ControlledTableProps {
  selectedRow?: string | number | null;
  defaultSelectedRow?: string | number | null;
  onSelectedRowChange?: (rowId: string | number | null) => void;
}
