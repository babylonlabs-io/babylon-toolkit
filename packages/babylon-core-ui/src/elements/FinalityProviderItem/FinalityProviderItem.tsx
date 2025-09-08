import { Avatar } from "../../components/Avatar";
import { Text } from "../../components/Text";
import { CloseIcon, CopyIcon } from "../../components/Icons";
import { FinalityProviderLogo } from "../FinalityProviderLogo/FinalityProviderLogo";
import { Copy } from "../../components/Copy";

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
  /**
   * Controls whether the chain-related information (e.g., address or BSN name/logo) is displayed.
   * Defaults to `true`.
   */
  showChain?: boolean;
}

export function FinalityProviderItem({ bsnId, bsnName, bsnLogoUrl, address, provider, onRemove, showChain = true }: FinalityProviderItemProps) {
  if (!provider) return null;

  const providerMoniker = provider.description?.moniker;
  const bsnPlaceholderLetter = bsnName?.charAt(0).toUpperCase() || "?";

  const shortenAddress = (value: string): string => {
    const visibleChars = 6;
    if (!value || value.length <= visibleChars * 2) return value;
    return `${value.slice(0, visibleChars)}...${value.slice(-visibleChars)}`;
  };

  const renderProviderMeta = () => (
    <div className="flex items-center text-xs text-accent-secondary">
      <FinalityProviderLogo
        logoUrl={provider.logo_url}
        rank={provider.rank}
        moniker={providerMoniker}
        size="sm"
        className="mr-1"
      />
      {providerMoniker}
    </div>
  );

  const renderPrimaryContent = () => {
    if (!showChain) {
      return (
        <Text as="div" className="text-base font-medium text-accent-primary">
          {providerMoniker}
        </Text>
      );
    }

    if (address) {
      return (
        <Text as="div" className="flex items-center gap-1 text-base font-medium text-accent-primary">
          {shortenAddress(address)}
          <Copy value={address} className="cursor-pointer" copiedText="✓">
            <CopyIcon size={12} />
          </Copy>
        </Text>
      );
    }

    return (
      <Text as="div" className="text-base font-medium text-accent-primary">
        {bsnName}
      </Text>
    );
  };

  const renderAvatar = () => {
    if (!showChain) {
      return (
        <FinalityProviderLogo
          logoUrl={provider.logo_url}
          rank={provider.rank}
          moniker={providerMoniker}
          size="lg"
        />
      );
    }

    if (bsnLogoUrl) {
      return <Avatar url={bsnLogoUrl} alt={bsnName} variant="rounded" size="large" />;
    }

    return (
      <Avatar variant="rounded" size="large">
        <Text
          as="span"
          className="inline-flex h-full w-full items-center justify-center bg-secondary-main text-xs text-accent-contrast"
        >
          {bsnPlaceholderLetter}
        </Text>
      </Avatar>
    );
  };

  return (
    <div className="flex flex-row items-center justify-between">
      <div className="flex h-10 flex-row gap-2">
        <div className="shrink-0">{renderAvatar()}</div>
        <div className="flex flex-col justify-center text-accent-primary">
          {showChain && renderProviderMeta()}
          {renderPrimaryContent()}
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
