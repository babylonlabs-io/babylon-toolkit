import { Avatar } from "../../components/Avatar";
import { Text } from "../../components/Text";
import { CloseIcon } from "../../components/Icons";
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
  showChain?: boolean;
}

export function FinalityProviderItem({ bsnId, bsnName, bsnLogoUrl, address, provider, onRemove, showChain = true }: FinalityProviderItemProps) {
  if (!provider) return null;

  const renderBsnLogo = () => {
    if (bsnLogoUrl) {
      return <Avatar url={bsnLogoUrl} alt={bsnName} variant="rounded" size="tiny" className="mr-1" />;
    }

    const placeholderLetter = bsnName?.charAt(0).toUpperCase() || "?";

    return (
      <Avatar variant="rounded" size="tiny" className="mr-1">
        <Text
          as="span"
          className="inline-flex h-full w-full items-center justify-center bg-secondary-main text-xs text-accent-contrast"
        >
          {placeholderLetter}
        </Text>
      </Avatar>
    );
  };

  const shortenAddress = (value: string): string => {
    const visibleChars = 6;
    if (!value || value.length <= visibleChars * 2) return value;
    return `${value.slice(0, visibleChars)}...${value.slice(-visibleChars)}`;
  };

  const renderChainOrAddress = () => {
    if (!showChain) return null;

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
        <div className="shrink-0">
          <FinalityProviderLogo
            logoUrl={provider.logo_url}
            rank={provider.rank}
            moniker={provider.description?.moniker}
            size="lg"
          />
        </div>
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
          className="ml-[10px] flex items-center justify-center cursor-pointer p-1"
        >
          <CloseIcon size={12} />
        </button> : null}
    </div>
  );
}
