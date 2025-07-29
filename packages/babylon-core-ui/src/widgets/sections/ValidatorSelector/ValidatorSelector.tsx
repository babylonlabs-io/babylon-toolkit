import { Dialog, MobileDialog, DialogBody, DialogHeader } from "@/components/Dialog";
import { Table } from "@/components/Table";
import { Input } from "@/components/Form/Input";
import { Text } from "@/components/Text";
import type { ColumnProps } from "@/components/Table/types";
import { WINDOW_BREAKPOINT, MAX_WINDOW_HEIGHT } from "../../../utils/constants";
import { useIsMobile } from "@/hooks/useIsMobile";
import { ReactNode, PropsWithChildren, useState, useMemo } from "react";
import { twMerge } from "tailwind-merge";
import { MdCancel } from "react-icons/md";
import { RiSearchLine } from "react-icons/ri";

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
}

type DialogComponentProps = Parameters<typeof Dialog>[0];

interface ResponsiveDialogProps extends DialogComponentProps {
    children?: ReactNode;
}

function ResponsiveDialog({ className, ...restProps }: ResponsiveDialogProps) {
    const isMobileView = useIsMobile(WINDOW_BREAKPOINT);
    const DialogComponent = isMobileView ? MobileDialog : Dialog;

    return <DialogComponent {...restProps} className={twMerge("w-[41.25rem] max-w-full", className)} />;
}

export const ValidatorSelector = ({
    open,
    validators,
    columns,
    onClose,
    onSelect,
    title = "",
    description,
}: PropsWithChildren<ValidatorSelectorProps>) => {
    const [searchTerm, setSearchTerm] = useState("");

    const onClearSearch = () => {
        setSearchTerm("");
    };

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

    const filteredValidators = useMemo(() => {
        if (!searchTerm.trim()) return validators;

        return validators.filter((validator) =>
            validator.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [validators, searchTerm]);

    return (
        <ResponsiveDialog open={open} onClose={onClose}>
            <DialogHeader title={title} onClose={onClose} className="text-accent-primary" />
            <DialogBody
                style={{ maxHeight: MAX_WINDOW_HEIGHT }}
                className="no-scrollbar mt-4 flex flex-col gap-6 overflow-y-auto text-accent-primary"
            >
                {description && (
                    <div>
                        <Text variant="body2" className="text-accent-secondary">
                            {description}
                        </Text>
                    </div>
                )}
                <div>
                    <Input
                        placeholder="Search"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        prefix={searchPrefix}
                        className="w-full"
                    />
                </div>
                <Table<ValidatorRow>
                    data={filteredValidators}
                    columns={columns}
                    className="w-full"
                    wrapperClassName="w-full"
                    onRowSelect={(row) => {
                        if (row) {
                            onSelect(row);
                            onClose();
                        }
                    }}
                />
            </DialogBody>
        </ResponsiveDialog>
    );
}; 