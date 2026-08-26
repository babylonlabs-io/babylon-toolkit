import { useMemo } from "react";

import { FinalityProviderItem } from "../FinalityProviderItem/FinalityProviderItem";

interface ProviderDescription {
  moniker?: string;
}

interface Provider {
  logo_url?: string;
  rank: number;
  description?: ProviderDescription;
}

export interface ProviderItem {
  bsnId: string;
  bsnName: string;
  bsnLogoUrl?: string;
  provider: Provider;
}

interface ProvidersListProps {
  items: ProviderItem[];
  onRemove: (id?: string) => void;
  /** Whether to display the chain (BSN) info for each provider. Defaults to true. */
  showChain?: boolean;
}

export function ProvidersList({ items, onRemove, showChain = true }: ProvidersListProps) {
  const values = useMemo(() => items, [items]);

  if (values.length === 0) return null;

  return (
    <div className="flex flex-col gap-8">
      {values.map(({ bsnId, bsnName, bsnLogoUrl, provider }) => (
        <FinalityProviderItem
          key={`${bsnId}-${provider.rank}`}
          bsnId={bsnId}
          bsnName={bsnName}
          bsnLogoUrl={bsnLogoUrl}
          provider={provider}
          onRemove={onRemove}
          showChain={showChain}
        />
      ))}
    </div>
  );
}
