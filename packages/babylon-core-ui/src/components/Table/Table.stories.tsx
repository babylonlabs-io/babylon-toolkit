import type { Meta, StoryObj } from "@storybook/react";
import { useState, useCallback } from "react";

import { ColumnProps, Table } from ".";
import { Avatar } from "../Avatar";
import { Select } from "../Form";
import { Button } from "../Button";

const meta: Meta<typeof Table> = {
  component: Table,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

interface FinalityProvider {
  id: string;
  name: string;
  icon: string;
  status: string;
  btcPk: string;
  totalDelegation: number;
  commission: number;
}

const data: FinalityProvider[] = [
  {
    id: "1",
    name: "Lombard",
    icon: "/images/fps/lombard.jpeg",
    status: "Active",
    btcPk: "1234...4321",
    totalDelegation: 10,
    commission: 1,
  },
  {
    id: "2",
    name: "Solv Protocol",
    icon: "/images/fps/solv.jpeg",
    status: "Inactive",
    btcPk: "1234...4321",
    totalDelegation: 20,
    commission: 3,
  },
  {
    id: "3",
    name: "PumpBTC",
    icon: "/images/fps/pumpbtc.jpeg",
    status: "Active",
    btcPk: "1234...4321",
    totalDelegation: 30,
    commission: 5,
  },
  {
    id: "4",
    name: "Solv Protocol",
    icon: "/images/fps/solv.jpeg",
    status: "Active",
    btcPk: "1234...4321",
    totalDelegation: 20,
    commission: 3,
  },
  {
    id: "5",
    name: "PumpBTC",
    icon: "/images/fps/pumpbtc.jpeg",
    status: "Active",
    btcPk: "1234...4321",
    totalDelegation: 30,
    commission: 5,
  },
];

const columns: ColumnProps<FinalityProvider>[] = [
  {
    key: "name",
    header: "Finality Provider",
    render: (value, row) => {
      void value;
      void row;
      return (
        <div className="flex items-center gap-2">
          <Avatar size="small" url={row.icon} alt={row.name} />
          <span>{row.name}</span>
        </div>
      );
    },
    sorter: (a, b) => a.name.localeCompare(b.name),
  },
  {
    key: "status",
    header: "Status",
  },
  {
    key: "btcPk",
    header: "BTC PK",
  },
  {
    key: "totalDelegation",
    header: "Total Delegation",
    render: (value, row) => {
      void value;
      void row;
      return `${row.totalDelegation} sBTC`;
    },
    sorter: (a, b) => a.totalDelegation - b.totalDelegation,
  },
  {
    key: "commission",
    header: "Commission",
    render: (value, row) => {
      void value;
      void row;
      return `${row.commission}%`;
    },
    sorter: (a, b) => a.commission - b.commission,
  },
];

const columnsWithActions: ColumnProps<FinalityProvider>[] = [
  {
    key: "name",
    header: "Finality Provider",
    frozen: "left",
         render: (value, row) => {
      void value;
      void row;
      return (
       <div className="flex items-center gap-2">
         <Avatar size="small" url={row.icon} alt={row.name} />
         <span>{row.name}</span>
       </div>
     );
    },
    sorter: (a, b) => a.name.localeCompare(b.name),
  },
  {
    key: "status",
    header: "Status",
  },
  {
    key: "btcPk",
    header: "BTC PK",
  },
  {
    key: "totalDelegation",
    header: "Total Delegation",
         render: (value, row) => {
      void value;
      void row;
      return `${row.totalDelegation} sBTC`;
    },
    sorter: (a, b) => a.totalDelegation - b.totalDelegation,
  },
  {
    key: "commission",
    header: "Commission",
    render: (value, row) => {
      void value;
      void row;
      return `${row.commission}%`;
    },
    sorter: (a, b) => a.commission - b.commission,
  },
  {
    key: "actions",
    header: "Actions",
    frozen: "right",
    render: (value, row) => {
      void value;
      void row;
      return (
        <div className="flex gap-2">
          <Button size="small" variant="contained">
            Delegate
          </Button>
          <Button size="small" variant="outlined">
            Unbond
          </Button>
        </div>
      );
    },
  },
];

export const Default: Story = {
  render: () => {
    const [tableData, setTableData] = useState(data);
    const [loading, setLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [selectedProvider, setSelectedProvider] = useState<FinalityProvider | null>(null);

    const handleLoadMore = useCallback(async () => {
      setLoading(true);
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const nextItems = data.slice(tableData.length, tableData.length + 3);
      setTableData((prev) => [...prev, ...nextItems]);
      setHasMore(tableData.length + nextItems.length < data.length);
      setLoading(false);
    }, [tableData]);

    const handleRowSelect = useCallback((row: FinalityProvider | null) => {
      setSelectedProvider(row);
    }, []);

    const isRowSelectable = useCallback((row: FinalityProvider) => {
      return row.status === "Active";
    }, []);

    return (
      <div className="space-y-4">
        <div>
          <Table
            data={tableData}
            hasMore={hasMore}
            loading={loading}
            onLoadMore={handleLoadMore}
            columns={columns}
            onRowSelect={handleRowSelect}
            isRowSelectable={isRowSelectable}
            defaultSelectedRow="1"
          />
        </div>
        {selectedProvider && (
          <div className="rounded bg-primary-contrast p-4">
            Selected Provider: {selectedProvider.name} (Commission: {selectedProvider.commission}%)
          </div>
        )}
      </div>
    );
  },
};

export const FrozenColumns: Story = {
  render: () => {
    const [selectedProvider, setSelectedProvider] = useState<FinalityProvider | null>(null);

    const handleRowSelect = useCallback((row: FinalityProvider | null) => {
      setSelectedProvider(row);
    }, []);

    return (
      <div className="space-y-4">
        <div>
          <Table
            data={data}
            columns={columnsWithActions}
            onRowSelect={handleRowSelect}
            defaultSelectedRow="1"
          />
        </div>
        {selectedProvider && (
          <div className="rounded bg-primary-contrast p-4">
            Selected Provider: {selectedProvider.name} (Commission: {selectedProvider.commission}%)
          </div>
        )}
      </div>
    );
  },
};

export const ControlledSelection: Story = {
  render: () => {
    const [selectedId, setSelectedId] = useState<string | number | null>("2");
    const [selectedProvider, setSelectedProvider] = useState<FinalityProvider | null>(null);

    const handleRowSelect = useCallback((row: FinalityProvider | null) => {
      setSelectedId(row?.id ?? null);
      setSelectedProvider(row);
    }, []);

    const selectOptions = [
      { value: "", label: "None" },
      ...data.map((provider) => ({
        value: provider.id,
        label: provider.name,
      })),
    ];

    const handleSelect = useCallback((value: string | number) => {
      const selectedRow = value ? (data.find((row) => row.id === value) ?? null) : null;
      setSelectedId(value);
      setSelectedProvider(selectedRow);
    }, []);

    return (
      <div className="space-y-4">
        <Select
          value={selectedId ?? ""}
          options={selectOptions}
          onSelect={(value) => handleSelect(value as string)}
          placeholder="Select a provider"
        />

        <div className="h-[150px]">
          <Table
            data={data}
            columns={columns}
            selectedRow={selectedId}
            onSelectedRowChange={setSelectedId}
            onRowSelect={handleRowSelect}
          />
        </div>

        {selectedProvider && (
          <div className="rounded bg-primary-contrast p-4">
            Selected Provider: {selectedProvider.name} (Commission: {selectedProvider.commission}%)
          </div>
        )}
      </div>
    );
  },
};

export const HeaderVisibility: Story = {
  render: () => {
    const noHeaderColumns = columns.map((col) => ({ ...col, header: "" }));

    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <div>With header</div>
          <Table data={data} columns={columns} />
        </div>

        <div className="space-y-2">
          <div>Without header (hidden)</div>
          <Table data={data} columns={noHeaderColumns} />
        </div>
      </div>
    );
  },
};
