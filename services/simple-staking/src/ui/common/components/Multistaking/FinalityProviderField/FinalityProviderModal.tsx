import {
  Avatar,
  Text,
  ValidatorSelector,
  type ColumnProps,
} from "@babylonlabs-io/core-ui";
import { useMemo, useRef } from "react";

import { useFinalityProviderBsnState } from "@/ui/common/state/FinalityProviderBsnState";
import { FinalityProviderStateLabels } from "@/ui/common/types/finalityProviders";
import { getNetworkConfigBTC } from "@/ui/common/config/network/btc";
import { satoshiToBtc } from "@/ui/common/utils/btc";
import { maxDecimals } from "@/ui/common/utils/maxDecimals";
import { formatCommissionPercentage } from "@/ui/common/utils/formatCommissionPercentage";
import { Hash } from "@/ui/common/components/Hash/Hash";

interface Props {
  open: boolean;
  defaultFinalityProvider?: string;
  selectedBsnId?: string;
  onClose: () => void;
  onAdd: (selectedBsnId: string, selectedProviderKey: string) => void;
  onBack?: () => void;
}

export const FinalityProviderModal = ({
  open,
  selectedBsnId,
  onClose,
  onAdd,
  onBack,
}: Props) => {
  const {
    modalTitle,
    finalityProviders,
    filterOptions,
    filter,
    handleFilter,
    isRowSelectable,
  } = useFinalityProviderBsnState();

  const { coinSymbol } = getNetworkConfigBTC();

  const fpById = useMemo(() => {
    const map = new Map<string, (typeof finalityProviders)[number]>();
    for (const fp of finalityProviders) map.set(fp.btcPk, fp);
    return map;
  }, [finalityProviders]);

  const rows = useMemo(
    () =>
      finalityProviders.map((fp) => ({
        id: fp.btcPk,
        name: fp.description?.moniker || "No name provided",
        apr: "",
        votingPower: "",
        commission: formatCommissionPercentage(Number(fp.commission) || 0),
      })),
    [finalityProviders],
  );

  const columns: ColumnProps<any>[] = [
    {
      key: "provider",
      header: "Finality Provider",
      headerClassName: "max-w-[240px]",
      cellClassName: "text-primary-dark max-w-[240px]",
      render: (_: unknown, row: { id: string; name: string }) => (
        <div className="flex min-w-0 items-center gap-2">
          <Avatar variant="circular" size="small" url="">
            <Text
              as="span"
              className="inline-flex h-full w-full items-center justify-center rounded-full bg-secondary-main text-[1rem] uppercase text-accent-contrast"
            >
              {row.name.charAt(0)}
            </Text>
          </Avatar>
          <span className="truncate">{row.name}</span>
        </div>
      ),
      sorter: (a, b) => a.name.localeCompare(b.name),
    },
    {
      key: "btcPk",
      header: "BTC PK",
      headerClassName: "max-w-[220px]",
      cellClassName: "max-w-[220px]",
      render: (_: unknown, row: { id: string }) => (
        <div className="truncate">
          <Hash value={String(row.id)} address small noFade />
        </div>
      ),
    },
    {
      key: "totalDelegation",
      header: "Total Delegation",
      headerClassName: "max-w-[160px]",
      render: (_: unknown, row: { id: string }) => {
        const fp = fpById.get(String(row.id));
        const total = maxDecimals(satoshiToBtc(fp?.activeTVLSat || 0), 8);
        return (
          <span className="inline-block max-w-[160px] truncate text-right">
            {total} {coinSymbol}
          </span>
        );
      },
      cellClassName: "text-right pr-4 max-w-[160px]",
      sorter: (a: { id: string }, b: { id: string }) => {
        const fa = fpById.get(String(a.id));
        const fb = fpById.get(String(b.id));
        const va = fa?.activeTVLSat ?? 0;
        const vb = fb?.activeTVLSat ?? 0;
        return va - vb;
      },
    },
    {
      key: "commission",
      header: "Commission",
      headerClassName: "max-w-[140px]",
      cellClassName: "text-right pr-4 max-w-[140px]",
      render: (_: unknown, row: { commission: string }) => (
        <span className="inline-block max-w-[140px] truncate text-right">
          {row.commission}
        </span>
      ),
      sorter: (a: { commission: string }, b: { commission: string }) =>
        parseFloat(a.commission) - parseFloat(b.commission),
    },
  ];

  const closingFromAddRef = useRef(false);

  const handleClose = () => {
    if (closingFromAddRef.current) {
      closingFromAddRef.current = false;
      return;
    }
    onClose();
  };

  const handleAdd = (row: any) => {
    if (selectedBsnId !== undefined) {
      closingFromAddRef.current = true;
      onAdd(selectedBsnId, String(row.id));
    }
  };

  const mapGridItem = (row: any) => {
    const fp = fpById.get(String(row.id));
    if (!fp) {
      return {
        providerItemProps: {
          bsnId: "",
          bsnName: "",
          address: String(row.id),
          provider: { rank: 0, description: { moniker: row.name } },
        },
        attributes: {},
      };
    }
    const totalDelegation = maxDecimals(satoshiToBtc(fp.activeTVLSat || 0), 8);
    const commission = formatCommissionPercentage(Number(fp.commission) || 0);
    const status = FinalityProviderStateLabels[fp.state] || "Unknown";
    return {
      providerItemProps: {
        bsnId: fp.bsnId || "",
        bsnName: fp.chain || "",
        address: fp.btcPk,
        provider: {
          logo_url: fp.logo_url,
          rank: fp.rank,
          description: fp.description,
        },
      },
      attributes: {
        Status: status,
        "Total Delegation": (
          <>
            {totalDelegation} {coinSymbol}
          </>
        ),
        Commission: commission,
      },
    };
  };

  const handleIsRowSelectable = (row: any) => {
    const fp = fpById.get(String(row.id));
    return fp ? isRowSelectable(fp as any) : false;
  };

  return (
    <ValidatorSelector
      open={open}
      validators={rows as any}
      columns={columns as ColumnProps<any>[]}
      onClose={handleClose}
      onSelect={() => {}}
      title={modalTitle}
      description="Finality Providers play a key role in securing Proof-of-Stake networks by validating and finalising transactions. Select one to delegate your stake."
      confirmSelection
      onBack={onBack}
      onAdd={handleAdd}
      defaultLayout="grid"
      gridItemMapper={mapGridItem}
      isRowSelectable={handleIsRowSelectable}
      filters={{
        options: filterOptions,
        value: filter.providerStatus,
        onSelect: (value) => handleFilter("providerStatus", String(value)),
      }}
    />
  );
};
