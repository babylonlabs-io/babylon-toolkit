import type { Meta, StoryObj } from "@storybook/react";
import { ValidatorSelector, ValidatorRow } from "./ValidatorSelector";
import type { ColumnProps } from "@/components/Table/types";
import { FinalityProviderLogo } from "@/elements/FinalityProviderLogo";

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

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        open: true,
        validators: sampleValidators,
        columns,
        title: "Select Validator",
        description: "Validators are responsible for verifying transactions, proposing and confirming new blocks, and helping maintain the security and consensus of Babylon Genesis.",
        onClose: () => { },
        onSelect: (validator: ValidatorRow) => alert(`Selected ${validator.name}`),
    },
}; 