import { Avatar } from "../../components/Avatar";
import { Text } from "../../components/Text";
import { FinalityProviderLogo } from "../FinalityProviderLogo/FinalityProviderLogo";

interface ProviderDescription {
  moniker?: string;
}

interface Provider {
  logo_url?: string;
  rank: number;
  description?: ProviderDescription;
}

export interface FinalityProviderItemProps {
  bsnId: string;
  bsnName: string;
  bsnLogoUrl?: string;
  address?: string;
  provider: Provider;
  onRemove?: (id?: string) => void;
}

export function FinalityProviderItem({ bsnId, bsnName, bsnLogoUrl, address, provider, onRemove }: FinalityProviderItemProps) {
  if (!provider) return null;

  const renderBsnLogo = () => {
    if (!bsnLogoUrl) return null;

    return <Avatar url={bsnLogoUrl} alt={bsnName} variant="rounded" size="tiny" className="mr-1" />;
  };

  const shortenAddress = (value: string): string => {
    const visibleChars = 6;
    if (!value || value.length <= visibleChars * 2) return value;
    return `${value.slice(0, visibleChars)}...${value.slice(-visibleChars)}`;
  };

  const renderChainOrAddress = () => {
    if (address) {
      return (
        <div className="text-xs text-accent-secondary">{shortenAddress(address)}</div>
      );
    }

    return (
      <div className="flex items-center text-xs text-accent-secondary">
        {renderBsnLogo()}
        {bsnName}
      </div>
    );
  };

  return (
    <div className="flex flex-row items-center justify-between">
      <div className="flex h-10 flex-row gap-2">
        <FinalityProviderLogo
          logoUrl={provider.logo_url}
          rank={provider.rank}
          moniker={provider.description?.moniker}
          size="lg"
        />
        <div className="flex flex-col justify-center text-accent-primary">
          {renderChainOrAddress()}
          <Text as="div" className="text-base font-medium text-accent-primary">
            {provider.description?.moniker}
          </Text>
        </div>
      </div>
      {onRemove ?
        <button
          onClick={() => onRemove(bsnId)}
          className="cursor-pointer rounded bg-accent-secondary/20 px-2 py-0.5 text-xs tracking-[0.4px] text-accent-primary"
        >
          Remove
        </button> : null}
    </div>
  );
}
