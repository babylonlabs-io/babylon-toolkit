import {
  CheckIcon,
  CopyIcon,
  IconButton,
  ProviderAvatar,
  useCopy,
  ValidatorSelector,
  type ColumnProps,
  type ValidatorRow,
} from "@babylonlabs-io/core-ui";
import { useEffect, useMemo, useState } from "react";
import { AiOutlinePlus } from "react-icons/ai";

import { getNetworkConfigBTC } from "@/config";
import { truncateAddress } from "@/utils/addressUtils";

const btcConfig = getNetworkConfigBTC();

export interface Provider {
  id: string;
  name: string;
  status?: string;
}

interface SelectVaultProviderModalProps {
  open: boolean;
  providers: Provider[];
  onClose: () => void;
  onSelect: (providerId: string) => void;
}

export function SelectVaultProviderModal({
  open,
  providers,
  onClose,
  onSelect,
}: SelectVaultProviderModalProps) {
  const [filterValue, setFilterValue] = useState("active");
  const { isCopied, copyToClipboard } = useCopy();

  // Reset filter when modal opens
  useEffect(() => {
    if (open) {
      setFilterValue("active");
    }
  }, [open]);

  const rows: ValidatorRow[] = useMemo(() => {
    const filteredProviders =
      filterValue === "active"
        ? providers.filter(
            (p) => (p.status || "active").toLowerCase() === "active",
          )
        : providers;

    return filteredProviders.map((p) => ({
      id: p.id,
      name: p.name,
      apr: "",
      votingPower: "",
      commission: "",
    }));
  }, [providers, filterValue]);

  const columns: ColumnProps<ValidatorRow>[] = useMemo(
    () => [
      {
        key: "provider",
        header: "Vault Provider",
        headerClassName: "max-w-[240px]",
        cellClassName: "text-primary-dark max-w-[240px]",
        render: (_, row) => (
          <div className="flex min-w-0 items-center gap-2">
            <ProviderAvatar name={row.name} size="small" className="h-8 w-8" />
            <span className="truncate">{row.name}</span>
          </div>
        ),
        sorter: (a, b) => a.name.localeCompare(b.name),
      },
      {
        key: "address",
        header: "Address",
        headerClassName: "max-w-[180px]",
        cellClassName: "max-w-[180px]",
        render: (_, row) => {
          const addressId = String(row.id);
          return (
            <button
              type="button"
              className="flex cursor-pointer items-center gap-1 truncate text-accent-secondary transition-colors hover:text-accent-primary"
              onClick={(e) => {
                e.stopPropagation();
                copyToClipboard(addressId, addressId);
              }}
              aria-label={`Copy address ${truncateAddress(addressId)}`}
            >
              <span>{truncateAddress(addressId)}</span>
              {isCopied(addressId) ? (
                <CheckIcon size={14} variant="success" />
              ) : (
                <CopyIcon size={14} />
              )}
            </button>
          );
        },
      },
      {
        key: "status",
        header: "Status",
        headerClassName: "max-w-[100px]",
        cellClassName: "max-w-[100px]",
        render: (_, row) => {
          const provider = providers.find((p) => p.id === row.id);
          const status = provider?.status;
          if (!status) {
            return <span className="text-accent-secondary">—</span>;
          }
          const isActive = status.toLowerCase() === "active";
          const formattedStatus =
            status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
          return (
            <span
              className={
                isActive ? "text-accent-primary" : "text-accent-secondary"
              }
            >
              {formattedStatus}
            </span>
          );
        },
      },
      {
        key: "action",
        header: "",
        render: () => (
          <IconButton size="medium" aria-label="Select provider">
            <AiOutlinePlus size={18} className="text-accent-primary" />
          </IconButton>
        ),
      },
    ],
    [providers, copyToClipboard, isCopied],
  );

  const handleSelect = (row: ValidatorRow) => {
    onSelect(String(row.id));
    onClose();
  };

  const filterOptions = [
    { value: "active", label: "Showing Active" },
    { value: "all", label: "Showing All" },
  ];

  const handleFilterChange = (value: string | number) => {
    setFilterValue(String(value));
  };

  return (
    <ValidatorSelector
      open={open}
      validators={rows}
      columns={columns}
      onClose={onClose}
      onSelect={handleSelect}
      title="Select a Vault Provider"
      description={`Vault Providers secure your ${btcConfig.coinSymbol} and make borrowing and redemption possible. Select one to manage your vault during deposits, withdrawals, and liquidations.`}
      defaultLayout="list"
      filters={{
        options: filterOptions,
        value: filterValue,
        placeholder: "Status",
        onSelect: handleFilterChange,
      }}
    />
  );
}
