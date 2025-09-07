import type { ReactNode } from "react";
import type { ColumnProps } from "@/components/Table/types";
import type { Option } from "@/components/Form/Select";
import type { FinalityProviderItemProps } from "@/elements/FinalityProviderItem/FinalityProviderItem";
import { Dialog } from "@/components/Dialog";

export interface ValidatorRow {
    id: string | number;
    icon?: ReactNode;
    name: string;
    apr: string;
    votingPower: string;
    commission: string;
}

export interface ValidatorSelectorFilters {
    slot?: ReactNode;
    options?: Option[];
    value?: string | number;
    disabled?: boolean;
    placeholder?: string;
    onSelect?: (value: string | number) => void;
    renderSelectedOption?: (option: Option) => ReactNode;
    className?: string;
}

type DialogComponentProps = Parameters<typeof Dialog>[0];

export interface ResponsiveDialogProps extends DialogComponentProps {
    children?: ReactNode;
}

export interface ValidatorSelectorProps {
    open: boolean;
    validators: ValidatorRow[];
    /** Column configuration for the table */
    columns: ColumnProps<ValidatorRow>[];
    onClose: () => void;
    /** Called when the user confirms selection. Provides selected validator row. */
    onSelect: (validator: ValidatorRow) => void;
    /** Optional title for the dialog – defaults to "Select Validator" */
    title?: string;
    /** Optional description text to display above the search input */
    description?: string;
    /** If true, show footer with Back/Add and only confirm selection on Add */
    confirmSelection?: boolean;
    /** Optional back handler to show Back button in footer */
    onBack?: () => void;
    /** Called when Add is pressed with the selected validator */
    onAdd?: (validator: ValidatorRow) => void;
    /** Layout style for displaying validators */
    layout?: "grid" | "list";
    /** Default layout when component manages internal state */
    defaultLayout?: "grid" | "list";
    /** Called when layout changes (for controlled usage) */
    onLayoutChange?: (layout: "grid" | "list") => void;
    /** Determine if a row/card is selectable */
    isRowSelectable?: (row: ValidatorRow) => boolean;
    /**
     * Maps a validator row to TableElement props when using grid layout.
     * Required if layout is "grid".
     */
    gridItemMapper?: (row: ValidatorRow, index: number) => {
        providerItemProps: FinalityProviderItemProps;
        attributes: Record<string, React.ReactNode>;
    };
    /** Grouped filters configuration */
    filters?: ValidatorSelectorFilters;
}

export interface HeaderControlsProps {
    searchTerm: string;
    onClearSearch: () => void;
    onSearchChange: (value: string) => void;
    filters?: ValidatorSelectorFilters;
    gridItemMapper?: ValidatorSelectorProps["gridItemMapper"];
    currentLayout: "grid" | "list";
    onToggleLayout: () => void;
}

export interface ListViewProps {
    rows: ValidatorRow[];
    currentLayout: "grid" | "list";
    gridItemMapper?: ValidatorSelectorProps["gridItemMapper"];
    columns: ColumnProps<ValidatorRow>[];
    selectedId: string | number | null;
    onSelectRowId: (id: string | number | null) => void;
    confirmSelection: boolean;
    onSelect: (row: ValidatorRow) => void;
    onClose: () => void;
    isRowSelectable?: (row: ValidatorRow) => boolean;
}

export interface ConfirmFooterProps {
    confirmSelection: boolean;
    onBack?: () => void;
    selectedRow: ValidatorRow | null;
    onAdd?: (validator: ValidatorRow) => void;
    onClose: () => void;
    clearSelection: () => void;
}

export interface GridViewProps {
    rows: ValidatorRow[];
    currentLayout: "grid" | "list";
    gridItemMapper?: ValidatorSelectorProps["gridItemMapper"];
    isRowSelectable?: (row: ValidatorRow) => boolean;
    selectedId: string | number | null;
    onSelectRowId: (id: string | number | null) => void;
    confirmSelection: boolean;
    onSelect: (row: ValidatorRow) => void;
    onClose: () => void;
}


