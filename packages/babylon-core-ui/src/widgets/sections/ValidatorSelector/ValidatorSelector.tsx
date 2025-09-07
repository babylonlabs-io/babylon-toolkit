import { Dialog, MobileDialog, DialogBody, DialogHeader, DialogFooter } from "@/components/Dialog";
import { Table } from "@/components/Table";
import { Input } from "@/components/Form/Input";
import { Text } from "@/components/Text";
import type { ColumnProps } from "@/components/Table/types";
import { WINDOW_BREAKPOINT } from "../../../utils/constants";
import { useIsMobile } from "@/hooks/useIsMobile";
import { ReactNode, PropsWithChildren, useState, useMemo } from "react";
import { twMerge } from "tailwind-merge";
import { MdCancel } from "react-icons/md";
import { RiSearchLine } from "react-icons/ri";
import { TableElement } from "@/widgets/sections/TableElement";
import { FinalityProviderItemProps } from "@/elements/FinalityProviderItem/FinalityProviderItem";
import { Button, IconButton } from "@/components/Button";
import { MdTableRows } from "react-icons/md";
import { IoGridSharp } from "react-icons/io5";
import { useControlledState } from "@/hooks/useControlledState";
import { Select } from "@/components/Form";
import type { Option } from "@/components/Form/Select";

// Types for table rows representing validators
export interface ValidatorRow {
    id: string | number;
    icon?: ReactNode;
    name: string;
    apr: string;
    votingPower: string;
    commission: string;
}

interface ValidatorSelectorProps {
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
    /** Optional filter component slot to render next to the search input */
    filterSlot?: ReactNode;
    /** Built-in filter: options list (if provided, a Select will render when no filterSlot) */
    filterOptions?: Option[];
    /** Built-in filter: current value */
    filterValue?: string | number;
    /** Built-in filter: disabled state (in addition to searchTerm presence) */
    filterDisabled?: boolean;
    /** Built-in filter: placeholder text */
    filterPlaceholder?: string;
    /** Built-in filter: handle selection */
    onFilterSelect?: (value: string | number) => void;
    /** Built-in filter: custom selected option renderer */
    renderSelectedFilterOption?: (option: Option) => ReactNode;
    /** Built-in filter: custom className */
    filterClassName?: string;
}

type DialogComponentProps = Parameters<typeof Dialog>[0];

interface ResponsiveDialogProps extends DialogComponentProps {
    children?: ReactNode;
}

function ResponsiveDialog({ className, ...restProps }: ResponsiveDialogProps) {
    const isMobileView = useIsMobile(WINDOW_BREAKPOINT);
    const DialogComponent = isMobileView ? MobileDialog : Dialog;

    return (
        <DialogComponent
            {...restProps}
            {...(!isMobileView ? { dialogClassName: "max-h-[720px] flex flex-col" } : {})}
            className={twMerge("w-[41.25rem] max-w-full", className)}
        />
    );
}

export const ValidatorSelector = ({
    open,
    validators,
    columns,
    onClose,
    onSelect,
    title = "",
    description,
    confirmSelection = false,
    onBack,
    onAdd,
    layout,
    defaultLayout = "list",
    onLayoutChange,
    isRowSelectable,
    gridItemMapper,
    filterSlot,
    filterOptions,
    filterValue,
    filterDisabled,
    filterPlaceholder = "Select Status",
    onFilterSelect,
    renderSelectedFilterOption,
    filterClassName,
}: PropsWithChildren<ValidatorSelectorProps>) => {
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedId, setSelectedId] = useState<string | number | null>(null);
    const [currentLayout, setCurrentLayout] = useControlledState<"grid" | "list">({
        value: layout,
        defaultValue: defaultLayout,
        onStateChange: onLayoutChange,
    });

    const onClearSearch = () => {
        setSearchTerm("");
    };

    function HeaderControls() {
        const searchPrefix = searchTerm ? (
            <button
                onClick={onClearSearch}
                className="opacity-60 hover:opacity-100 transition-opacity"
            >
                <MdCancel size={18} className="text-secondary-strokeDark" />
            </button>
        ) : (
            <span className="text-secondary-strokeDark">
                <RiSearchLine size={20} />
            </span>
        );

        return (
            <div className="mt-4 flex flex-col md:flex-row gap-4">
                <div className="flex-1">
                    <Input
                        placeholder="Search"
                        wrapperClassName="h-full"
                        id='validator-selector-search'
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        prefix={searchPrefix}
                        className="w-full"
                    />
                </div>
                {filterSlot ? (
                    <div className="w-full md:w-[200px]">{filterSlot}</div>
                ) : filterOptions && filterOptions.length > 0 ? (
                    <div className="w-full md:w-[200px]">
                        <Select
                            options={filterOptions}
                            onSelect={(value) => onFilterSelect?.(value)}
                            placeholder={filterPlaceholder}
                            value={searchTerm ? "" : filterValue}
                            disabled={Boolean(searchTerm) || filterDisabled}
                            renderSelectedOption={renderSelectedFilterOption}
                            className={twMerge("h-10", filterClassName)}
                        />
                    </div>
                ) : null}
                {gridItemMapper ? (
                    <div className="flex items-center gap-2 text-secondary-strokeDark/50">
                        <IconButton
                            onClick={() => setCurrentLayout(currentLayout === "grid" ? "list" : "grid")}
                        >
                            <div className="text-accent-primary">
                                {currentLayout === "grid" ? (
                                    <MdTableRows size={24} />
                                ) : (
                                    <IoGridSharp size={20} />
                                )}
                            </div>
                        </IconButton>
                    </div>
                ) : null}
            </div>
        );
    }

    function GridView({ rows }: { rows: ValidatorRow[] }) {
        if (!(currentLayout === "grid" && gridItemMapper)) return null;

        return (
            <div className="grid grid-cols-2 gap-4 w-full flex-1 min-h-0 overflow-auto">
                {rows.map((row, index) => {
                    const mapped = gridItemMapper!(row, index);
                    const selectable = isRowSelectable ? isRowSelectable(row) : true;
                    return (
                        <TableElement
                            key={row.id}
                            providerItemProps={mapped.providerItemProps}
                            attributes={mapped.attributes}
                            isSelected={selectedId === row.id}
                            isSelectable={selectable}
                            onSelect={() => {
                                if (!selectable) return;
                                if (confirmSelection) {
                                    setSelectedId(row.id);
                                } else {
                                    onSelect(row);
                                    onClose();
                                }
                            }}
                        />
                    );
                })}
            </div>
        );
    }

    function ListView({ rows }: { rows: ValidatorRow[] }) {
        if (currentLayout === "grid" && gridItemMapper) return null;

        return (
            <Table<ValidatorRow>
                data={rows}
                columns={columns}
                className="w-full"
                wrapperClassName="w-full flex-1 min-h-0 overflow-auto"
                fluid
                selectedRow={selectedId ?? undefined}
                onSelectedRowChange={(rowId) => setSelectedId(rowId)}
                onRowSelect={(row) => {
                    if (!row) {
                        setSelectedId(null);
                        return;
                    }
                    if (confirmSelection) {
                        setSelectedId(row.id);
                    } else {
                        onSelect(row);
                        onClose();
                    }
                }}
                isRowSelectable={isRowSelectable}
            />
        );
    }

    function ConfirmFooter() {
        if (!confirmSelection) return null;

        return (
            <DialogFooter className="flex mt-4 justify-between">
                {onBack ? (
                    <Button variant="outlined" onClick={onBack}>
                        Back
                    </Button>
                ) : (
                    <div />
                )}
                <Button
                    variant="contained"
                    onClick={() => {
                        if (selectedRow && onAdd) {
                            onAdd(selectedRow);
                            setSelectedId(null);
                            onClose();
                        }
                    }}
                    disabled={!selectedRow}
                >
                    Add
                </Button>
            </DialogFooter>
        );
    }

    const filteredValidators = useMemo(() => {
        if (!searchTerm.trim()) return validators;

        return validators.filter((validator) =>
            validator.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [validators, searchTerm]);

    const selectedRow = useMemo(
        () => filteredValidators.find((v) => v.id === selectedId) || null,
        [filteredValidators, selectedId]
    );

    return (
        <ResponsiveDialog open={open} onClose={onClose} className="w-[52rem]">
            <DialogHeader title={title} onClose={onClose} className="text-accent-primary" />
            {description && (
                <div className="mt-4">
                    <Text className="text-accent-secondary">
                        {description}
                    </Text>
                </div>
            )}
            {HeaderControls()}
            <DialogBody className="mt-4 flex flex-col" style={{ overflowY: "hidden" }}>
                {GridView({ rows: filteredValidators })}
                {ListView({ rows: filteredValidators })}
            </DialogBody>
            {ConfirmFooter()}
        </ResponsiveDialog>
    );
}; 