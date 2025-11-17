import {
  FinalityProviderSubsection,
  IconButton,
  useField,
  ValidatorSelector,
  ValidatorRow,
  FinalityProviderLogo,
} from "@babylonlabs-io/core-ui";
import { useEffect } from "react";
import { AiOutlinePlus } from "react-icons/ai";

import { useValidatorState } from "@/ui/baby/state/ValidatorState";
import { getNetworkConfigBBN } from "@/ui/common/config/network/bbn";
import { ubbnToBaby } from "@/ui/common/utils/bbn";
import { formatCommissionPercentage } from "@/ui/common/utils/formatCommissionPercentage";
import { maxDecimals } from "@/ui/common/utils/maxDecimals";

const { coinSymbol } = getNetworkConfigBBN();

export function ValidatorField() {
  const { value, onChange, onBlur } = useField<string[]>({
    name: "validatorAddresses",
    defaultValue: [],
  });
  const {
    open,
    filter,
    validators,
    selectedValidators,
    openModal,
    closeModal,
    handleFilter,
    toggleShowSlashed,
    selectValidator,
  } = useValidatorState();

  const validatorRows: ValidatorRow[] = validators.map((v) => ({
    id: v.id,
    name: v.name,
    apr: "",
    votingPower: `${maxDecimals(v.votingPower * 100, 2)}%`,
    commission: formatCommissionPercentage(v.commission),
    totalStaked: `${maxDecimals(ubbnToBaby(v.tokens), 2)} ${coinSymbol}`,
  }));

  const columns = [
    {
      key: "name",
      header: "Validator",
      headerClassName: "max-w-[240px]",
      cellClassName: "max-w-[240px]",
      sorter: (a: ValidatorRow, b: ValidatorRow) =>
        a.name.localeCompare(b.name),
      render: (_: unknown, row: ValidatorRow) => {
        const original = validators.find((v) => v.id === row.id);
        const rank = original ? validators.indexOf(original) + 1 : 0;
        return (
          <div className="flex min-w-0 items-center gap-2">
            <FinalityProviderLogo logoUrl={""} rank={rank} moniker={row.name} />
            <span className="truncate">{row.name}</span>
          </div>
        );
      },
    },
    {
      key: "votingPower",
      header: "Voting Power",
      headerClassName: "max-w-[160px]",
      cellClassName: "max-w-[160px]",
      sorter: (a: ValidatorRow, b: ValidatorRow) =>
        Number.parseFloat(a.votingPower) - Number.parseFloat(b.votingPower),
    },
    {
      key: "commission",
      header: "Commission",
      headerClassName: "max-w-[140px]",
      cellClassName: "max-w-[140px]",
      sorter: (a: ValidatorRow, b: ValidatorRow) =>
        Number.parseFloat(a.commission) - Number.parseFloat(b.commission),
    },
    {
      key: "totalStaked",
      header: "Total Staked",
      headerClassName: "max-w-[180px]",
      cellClassName: "max-w-[180px]",
      sorter: (a: ValidatorRow, b: ValidatorRow) => {
        // Remove non-numeric characters from the totalStaked values
        const aValue = a.totalStaked
          ? Number.parseFloat(a.totalStaked.replace(/[^\d.-]/g, ""))
          : 0;
        const bValue = b.totalStaked
          ? Number.parseFloat(b.totalStaked.replace(/[^\d.-]/g, ""))
          : 0;
        return aValue - bValue;
      },
    },
    {
      key: "action",
      header: "",
      render: () => (
        <IconButton size="medium">
          <AiOutlinePlus size={18} className="text-accent-primary" />
        </IconButton>
      ),
    },
  ];

  const handleSelectValidator = (validator: ValidatorRow) => {
    const set = new Set(value);
    const original = validators.find((v) => v.id === validator.id);
    if (!original) return;
    set.add(original.address);
    onChange(Array.from(set));
    onBlur();
  };

  const handleRemoveValidatorById = (id?: string) => {
    if (!id) return;
    const set = new Set(value);
    set.delete(id);
    onChange(Array.from(set));
    onBlur();
  };

  const handleClose = () => {
    closeModal();
    onBlur();
  };

  useEffect(() => {
    selectValidator(value);
  }, [value, selectValidator]);

  const mapGridItem = (row: ValidatorRow) => {
    const original = validators.find((v) => v.id === row.id);
    const name = row.name;
    const rank = original ? validators.indexOf(original) + 1 : 0;
    const votingPower = original
      ? `${maxDecimals(original.votingPower * 100, 2)}%`
      : "-";
    const commission = original
      ? formatCommissionPercentage(original.commission)
      : "-";
    const totalStaked = original
      ? `${maxDecimals(ubbnToBaby(original.tokens), 2)} ${coinSymbol}`
      : "-";
    return {
      providerItemProps: {
        bsnId: "bbn",
        bsnName: "Babylon Genesis",
        address: String(row.id),
        provider: {
          rank,
          logo_url: "",
          description: { moniker: name },
        },
        showChain: false,
      },
      attributes: {
        "Voting Power": votingPower,
        Commission: commission,
        "Total Staked": totalStaked,
      },
    };
  };

  const handleSelect = (row: ValidatorRow) => {
    handleSelectValidator(row);
    handleClose();
  };

  const handleFilterSelect = (value: string | number) => {
    handleFilter("status", String(value));
    toggleShowSlashed(String(value) === "slashed");
  };

  const renderSelectedOption = (option: { label: string }) =>
    `Showing ${option.label}`;

  return (
    <>
      <FinalityProviderSubsection
        actionText="Select Validator"
        max={1}
        items={selectedValidators.map((v, index) => ({
          bsnId: v.id,
          bsnName: v.name,
          provider: { rank: index + 1, description: { moniker: v.name } },
        }))}
        onAdd={openModal}
        onRemove={handleRemoveValidatorById}
        showChain={false}
      />
      <ValidatorSelector
        open={open}
        validators={validatorRows}
        columns={columns}
        onClose={handleClose}
        onSelect={handleSelect}
        title="Select Validator"
        description="Validators are responsible for verifying transactions, proposing and confirming new blocks, and helping maintain the security and consensus of Babylon Genesis."
        defaultLayout="list"
        gridItemMapper={mapGridItem}
        filters={{
          options: [
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
            { value: "jailed", label: "Jailed" },
            { value: "slashed", label: "Slashed" },
          ],
          value: filter.status || "active",
          onSelect: handleFilterSelect,
          renderSelectedOption,
          className: "h-10",
        }}
      />
    </>
  );
}
