import type { Meta, StoryObj } from "@storybook/react";
import { useMemo, useState } from "react";
import { ValidatorSelector, ValidatorRow } from "./ValidatorSelector";
import type { ColumnProps } from "@/components/Table/types";
import { FinalityProviderLogo } from "@/elements/FinalityProviderLogo";
import type { FinalityProviderItemProps } from "@/elements/FinalityProviderItem/FinalityProviderItem";

const sampleValidators: ValidatorRow[] = Array.from({ length: 15 }, (_, i) => {
    const index = i + 1;
    return {
        id: index,
        icon: (
            <FinalityProviderLogo
                rank={index}
                moniker={`V${index}`}
                size="sm"
            />
        ),
        name: `Validator ${index}`,
        apr: `${25 + (index % 6)}.${(index * 7) % 100}`.padEnd(6, "0") + "%", // simple varied APR
        votingPower: `${(Math.random() * 1).toFixed(6)} sBTC`,
        commission: `${2 + (index % 5)}%`,
    } as ValidatorRow;
});

const columns: ColumnProps<ValidatorRow>[] = [
    {
        key: "name",
        header: "Validator",
        sorter: (a, b) => a.name.localeCompare(b.name),
        render: (_value, row) => (
            <div className="flex items-center gap-2">
                {row.icon}
                <span>{row.name}</span>
            </div>
        ),
    },
    { key: "apr", header: "Expected APR" },
    {
        key: "votingPower",
        header: "Voting Power",
        sorter: (a, b) => {
            const parse = (str: string) => parseFloat(str.split(" ")[0]);
            return parse(a.votingPower) - parse(b.votingPower);
        },
    },
    {
        key: "commission",
        header: "Commission",
        sorter: (a, b) => parseFloat(a.commission) - parseFloat(b.commission),
    },
];

const meta: Meta<typeof ValidatorSelector> = {
    component: ValidatorSelector,
    tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        open: true,
        validators: sampleValidators,
        columns,
        title: "Select Validator",
        description: "Finality Providers play a key role in securing Proof-of-Stake networks by validating and finalising transactions. Select one to delegate your stake.",
        onClose: () => { },
        onSelect: (validator: ValidatorRow) => alert(`Selected ${validator.name}`),
    },
};

export const GridLayout: Story = {
    args: {
        open: true,
        validators: sampleValidators,
        columns, // unused in grid but provided for API parity
        title: "Select Validator",
        description: "Grid layout renders validators as cards using TableElement.",
        defaultLayout: "grid",
        isRowSelectable: () => true,
        onClose: () => { },
        onSelect: (validator: ValidatorRow) => alert(`Selected ${validator.name}`),
        gridItemMapper: (row: ValidatorRow): { providerItemProps: FinalityProviderItemProps; attributes: Record<string, React.ReactNode>; } => ({
            providerItemProps: {
                bsnId: String(row.id),
                bsnName: row.name,
                provider: {
                    logo_url: undefined,
                    rank: Number(row.id),
                    description: { moniker: row.name },
                },
            },
            attributes: {
                "Expected APR": row.apr,
                "Voting Power": row.votingPower,
                Commission: row.commission,
            },
        }),
    },
};

export const WithFilter: Story = {
    args: {
        open: true,
        validators: sampleValidators,
        columns,
        title: "Select Validator",
        description: "Filter enabled via built-in Select.",
        defaultLayout: "list",
        onClose: () => { },
        onSelect: (validator: ValidatorRow) => alert(`Selected ${validator.name}`),
        filters: {
            options: [
                { value: "all", label: "All" },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
            ],
            renderSelectedOption: (option: { label: string }) => `Showing ${option.label}`,
            className: "h-10",
        },
    },
    render: (args) => {
        const [status, setStatus] = useState<string | number>("all");
        const filteredValidators = useMemo<ValidatorRow[]>(() => {
            if (status === "all") return args.validators;
            const isActive = (id: string | number) => Number(id) % 2 === 0;
            return args.validators.filter((v: ValidatorRow) => (status === "active" ? isActive(v.id) : !isActive(v.id)));
        }, [args.validators, status]);

        return (
            <ValidatorSelector
                {...args}
                validators={filteredValidators}
                filters={{ ...(args.filters ?? {}), value: status, onSelect: (value) => setStatus(value) }}
                onSelect={args.onSelect!}
                onClose={args.onClose!}
                columns={args.columns!}
                open={args.open!}
            />
        );
    },
};

export const WithConfirmFooter: Story = {
    args: {
        open: true,
        validators: sampleValidators,
        columns,
        title: "Select Validator",
        description: "Back/Add footer is shown and selection is confirmed on Add.",
        defaultLayout: "list",
        confirmSelection: true,
        onBack: () => alert("Back clicked"),
        onAdd: (validator: ValidatorRow) => alert(`Added ${validator.name}`),
        onClose: () => { },
        filters: {
            options: [
                { value: "all", label: "All" },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
            ],
            renderSelectedOption: (option: { label: string }) => `Showing ${option.label}`,
            className: "h-10",
        },
    },
    render: (args) => {
        const [status, setStatus] = useState<string | number>("all");
        const filteredValidators = useMemo<ValidatorRow[]>(() => {
            if (status === "all") return args.validators;
            const isActive = (id: string | number) => Number(id) % 2 === 0;
            return args.validators.filter((v: ValidatorRow) => (status === "active" ? isActive(v.id) : !isActive(v.id)));
        }, [args.validators, status]);

        return (
            <ValidatorSelector
                {...args}
                validators={filteredValidators}
                filters={{ ...(args.filters ?? {}), value: status, onSelect: (value) => setStatus(value) }}
                onSelect={args.onSelect!}
                onClose={args.onClose!}
                columns={args.columns!}
                open={args.open!}
            />
        );
    },
};

export const GridWithFilterAndConfirm: Story = {
    args: {
        open: true,
        validators: sampleValidators,
        columns,
        title: "Select Validator",
        description: "Grid layout with filter and confirm footer.",
        defaultLayout: "grid",
        isRowSelectable: () => true,
        confirmSelection: true,
        onBack: () => alert("Back clicked"),
        onAdd: (validator: ValidatorRow) => alert(`Added ${validator.name}`),
        onClose: () => { },
        filters: {
            options: [
                { value: "all", label: "All" },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
            ],
            renderSelectedOption: (option: { label: string }) => `Showing ${option.label}`,
            className: "h-10",
        },
        gridItemMapper: (row: ValidatorRow): { providerItemProps: FinalityProviderItemProps; attributes: Record<string, React.ReactNode>; } => ({
            providerItemProps: {
                bsnId: String(row.id),
                bsnName: row.name,
                provider: {
                    logo_url: undefined,
                    rank: Number(row.id),
                    description: { moniker: row.name },
                },
            },
            attributes: {
                "Expected APR": row.apr,
                "Voting Power": row.votingPower,
                Commission: row.commission,
            },
        }),
    },
    render: (args) => {
        const [status, setStatus] = useState<string | number>("all");
        const filteredValidators = useMemo<ValidatorRow[]>(() => {
            if (status === "all") return args.validators;
            const isActive = (id: string | number) => Number(id) % 2 === 0;
            return args.validators.filter((v: ValidatorRow) => (status === "active" ? isActive(v.id) : !isActive(v.id)));
        }, [args.validators, status]);

        return (
            <ValidatorSelector
                {...args}
                validators={filteredValidators}
                filters={{ ...(args.filters ?? {}), value: status, onSelect: (value) => setStatus(value) }}
                onSelect={args.onSelect!}
                onClose={args.onClose!}
                columns={args.columns!}
                open={args.open!}
            />
        );
    },
};

export const ConfirmFooterNoBack: Story = {
    args: {
        open: true,
        validators: sampleValidators,
        columns,
        title: "Select Validator",
        description: "Confirm footer without Back button.",
        defaultLayout: "list",
        confirmSelection: true,
        onAdd: (validator: ValidatorRow) => alert(`Added ${validator.name}`),
        onClose: () => { },
        filters: {
            options: [
                { value: "all", label: "All" },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
            ],
            renderSelectedOption: (option: { label: string }) => `Showing ${option.label}`,
            className: "h-10",
        },
    },
    render: (args) => {
        const [status, setStatus] = useState<string | number>("all");
        const filteredValidators = useMemo<ValidatorRow[]>(() => {
            if (status === "all") return args.validators;
            const isActive = (id: string | number) => Number(id) % 2 === 0;
            return args.validators.filter((v: ValidatorRow) => (status === "active" ? isActive(v.id) : !isActive(v.id)));
        }, [args.validators, status]);

        return (
            <ValidatorSelector
                {...args}
                validators={filteredValidators}
                filters={{ ...(args.filters ?? {}), value: status, onSelect: (value) => setStatus(value) }}
                onSelect={args.onSelect!}
                onClose={args.onClose!}
                columns={args.columns!}
                open={args.open!}
            />
        );
    },
};