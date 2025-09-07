import { Dialog, MobileDialog, DialogBody, DialogHeader, DialogFooter } from "@/components/Dialog";
import { Table } from "@/components/Table";
import { Input } from "@/components/Form/Input";
import { Text } from "@/components/Text";
import { WINDOW_BREAKPOINT } from "../../../utils/constants";
import { useIsMobile } from "@/hooks/useIsMobile";
import { PropsWithChildren, useState, useMemo, memo } from "react";
import { twMerge } from "tailwind-merge";
import { MdCancel } from "react-icons/md";
import { RiSearchLine } from "react-icons/ri";
import { TableElement } from "@/widgets/sections/TableElement";
import { Button, IconButton } from "@/components/Button";
import { MdTableRows } from "react-icons/md";
import { IoGridSharp } from "react-icons/io5";
import { useControlledState } from "@/hooks/useControlledState";
import { Select } from "@/components/Form";
import type { ValidatorSelectorProps, HeaderControlsProps, GridViewProps, ListViewProps, ConfirmFooterProps, ResponsiveDialogProps, ValidatorRow } from "./ValidatorSelector.types";

export type { ValidatorRow } from "./ValidatorSelector.types";

function ResponsiveDialog({ className, ...restProps }: ResponsiveDialogProps) {
    const isMobileView = useIsMobile(WINDOW_BREAKPOINT);
    const DialogComponent = isMobileView ? MobileDialog : Dialog;

    return (
        <DialogComponent
            {...restProps}
            {...(!isMobileView ? { dialogClassName: "h-[90vh] min-h-[400px] max-h-[720px] flex flex-col" } : {})}
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
    filters,
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

    const headerControls = (
        <HeaderControls
            searchTerm={searchTerm}
            onClearSearch={onClearSearch}
            onSearchChange={setSearchTerm}
            filters={filters}
            gridItemMapper={gridItemMapper}
            currentLayout={currentLayout ?? "list"}
            onToggleLayout={() => setCurrentLayout(currentLayout === "grid" ? "list" : "grid")}
        />
    );

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
            {headerControls}
            <DialogBody className="mt-4 flex flex-col" style={{ overflowY: "hidden" }}>
                <GridView
                    rows={filteredValidators}
                    currentLayout={currentLayout ?? "list"}
                    gridItemMapper={gridItemMapper}
                    isRowSelectable={isRowSelectable}
                    selectedId={selectedId}
                    onSelectRowId={setSelectedId}
                    confirmSelection={confirmSelection}
                    onSelect={onSelect}
                    onClose={onClose}
                />
                <ListView
                    rows={filteredValidators}
                    currentLayout={currentLayout ?? "list"}
                    gridItemMapper={gridItemMapper}
                    columns={columns}
                    selectedId={selectedId}
                    onSelectRowId={setSelectedId}
                    confirmSelection={confirmSelection}
                    onSelect={onSelect}
                    onClose={onClose}
                    isRowSelectable={isRowSelectable}
                />
            </DialogBody>
            <ConfirmFooter
                confirmSelection={confirmSelection}
                onBack={onBack}
                selectedRow={selectedRow}
                onAdd={onAdd}
                onClose={onClose}
                clearSelection={() => setSelectedId(null)}
            />
        </ResponsiveDialog>
    );
};

const HeaderControls = memo(({
    searchTerm,
    onClearSearch,
    onSearchChange,
    filters,
    gridItemMapper,
    currentLayout,
    onToggleLayout,
}: HeaderControlsProps) => {
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
                    onChange={(e) => onSearchChange(e.target.value)}
                    prefix={searchPrefix}
                    className="w-full"
                />
            </div>
            {filters?.slot ? (
                <div className="w-full md:w-[200px]">{filters.slot}</div>
            ) : filters?.options && filters.options.length > 0 ? (
                <div className="w-full md:w-[200px]">
                    <Select
                        options={filters.options}
                        onSelect={(value) => filters?.onSelect?.(value)}
                        placeholder={filters.placeholder ?? "Select Status"}
                        value={searchTerm ? "" : filters.value}
                        disabled={Boolean(searchTerm) || filters.disabled}
                        renderSelectedOption={filters.renderSelectedOption}
                        className={twMerge("h-10", filters.className)}
                    />
                </div>
            ) : null}
            {gridItemMapper ? (
                <div className="flex items-center gap-2 text-secondary-strokeDark/50">
                    <IconButton onClick={onToggleLayout}>
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
});


const GridView = memo(({ rows, currentLayout, gridItemMapper, isRowSelectable, selectedId, onSelectRowId, confirmSelection, onSelect, onClose }: GridViewProps) => {
    if (!(currentLayout === "grid" && gridItemMapper)) return null;

    return (
        <div className="grid grid-cols-2 gap-4 w-full flex-1 min-h-0 overflow-auto">
            {rows.map((row, index) => {
                const mapped = gridItemMapper(row, index);
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
                                onSelectRowId(row.id);
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
});

const ListView = memo(({ rows, currentLayout, gridItemMapper, columns, selectedId, onSelectRowId, confirmSelection, onSelect, onClose, isRowSelectable }: ListViewProps) => {
    if (currentLayout === "grid" && gridItemMapper) return null;

    return (
        <Table<ValidatorRow>
            data={rows}
            columns={columns}
            className="w-full"
            wrapperClassName="w-full flex-1 min-h-0 overflow-auto"
            fluid
            selectedRow={selectedId ?? undefined}
            onSelectedRowChange={(rowId) => onSelectRowId(rowId)}
            onRowSelect={(row) => {
                if (!row) {
                    onSelectRowId(null);
                    return;
                }
                if (confirmSelection) {
                    onSelectRowId(row.id);
                } else {
                    onSelect(row);
                    onClose();
                }
            }}
            isRowSelectable={isRowSelectable}
        />
    );
});


const ConfirmFooter = memo(({ confirmSelection, onBack, selectedRow, onAdd, onClose, clearSelection }: ConfirmFooterProps) => {
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
                        clearSelection();
                        onClose();
                    }
                }}
                disabled={!selectedRow}
            >
                Add
            </Button>
        </DialogFooter>
    );
});