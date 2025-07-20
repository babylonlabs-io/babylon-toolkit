import React from "react";
import { Button } from "../../../components/Button";
import { FinalityProviderItem } from "../../../elements/FinalityProviderItem/FinalityProviderItem";

interface ProviderDescription {
    moniker?: string;
}

interface Provider {
    logo_url?: string;
    rank: number;
    description?: ProviderDescription;
}

export interface ProviderItemProps {
    bsnId: string;
    bsnName: string;
    bsnLogoUrl?: string;
    address?: string;
    provider: Provider;
    onRemove?: (id?: string) => void;
}

interface TableElementProps {
    providerItemProps: ProviderItemProps;
    attributes: Record<string, React.ReactNode>;
    isSelected?: boolean;
    isSelectable?: boolean;
    onSelect?: () => void;
}

export const TableElement = ({
    attributes,
    providerItemProps,
    isSelected = false,
    isSelectable = true,
    onSelect,
}: TableElementProps) => {
    return (
        <div className="bg-secondary-highlight h-[316px] overflow-hidden p-4 flex flex-col rounded justify-between">
            <FinalityProviderItem {...providerItemProps} />

            <div className="w-full h-px bg-secondary-strokeLight" />

            {Object.entries(attributes).map(([label, value]) => (
                <div
                    key={label}
                    className="text-sm flex flex-row justify-between first:mt-0 mt-1"
                >
                    <div className="text-accent-secondary">{label}</div>
                    <div className="text-accent-primary font-medium">{value}</div>
                </div>
            ))}

            {onSelect && (
                <Button
                    className="mt-4"
                    onClick={onSelect}
                    disabled={!isSelectable}
                    variant={isSelected ? "contained" : "outlined"}
                >
                    {isSelected ? "Selected" : "Select"}
                </Button>
            )}
        </div>
    );
}; 