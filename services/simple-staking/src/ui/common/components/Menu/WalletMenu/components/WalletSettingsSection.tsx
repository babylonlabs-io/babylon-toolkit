import { Text } from "@babylonlabs-io/core-ui";

import { Hash } from "@/ui/common/components/Hash/Hash";
import {
  BitcoinPublicKeyIcon,
  CopyIcon,
  LinkWalletIcon,
  UsingInscriptionIcon,
} from "@/ui/common/components/Icons";

import { NewToggle } from "./Toggle";

interface WalletSettingsProps {
  ordinalsExcluded: boolean;
  linkedDelegationsVisibility: boolean;
  onIncludeOrdinals: () => void;
  onExcludeOrdinals: () => void;
  onDisplayLinkedDelegations: (value: boolean) => void;
  publicKeyNoCoord: string;
}

export const WalletSettingsSection = ({
  ordinalsExcluded,
  linkedDelegationsVisibility,
  onIncludeOrdinals,
  onExcludeOrdinals,
  onDisplayLinkedDelegations,
  publicKeyNoCoord,
}: WalletSettingsProps) => {
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="flex w-full flex-col gap-8">
      {/* Using Inscriptions Toggle */}
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-3">
          <UsingInscriptionIcon />
          <div className="flex flex-col">
            <Text
              variant="body1"
              className="text-sm font-medium text-accent-primary"
            >
              Using Inscriptions
            </Text>
            <Text variant="body2" className="text-xs text-accent-secondary">
              {ordinalsExcluded ? "Off" : "On"}
            </Text>
          </div>
        </div>
        <NewToggle
          value={!ordinalsExcluded}
          onChange={(value) =>
            value ? onIncludeOrdinals() : onExcludeOrdinals()
          }
        />
      </div>

      {/* Linked Wallet Stakes Toggle */}
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-3">
          <LinkWalletIcon />
          <div className="flex flex-col">
            <Text
              variant="body1"
              className="text-sm font-medium text-accent-primary"
            >
              Linked Wallet Stakes
            </Text>
            <Text variant="body2" className="text-xs text-accent-secondary">
              {linkedDelegationsVisibility ? "On" : "Off"}
            </Text>
          </div>
        </div>
        <NewToggle
          value={linkedDelegationsVisibility}
          onChange={onDisplayLinkedDelegations}
        />
      </div>

      {/* Bitcoin Public Key */}
      <div className="flex w-full items-center justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <BitcoinPublicKeyIcon />
          <div className="flex min-w-0 flex-1 flex-col">
            <Text
              variant="body1"
              className="text-sm font-medium text-accent-primary"
            >
              Bitcoin Public Key
            </Text>
            <Hash
              className="text-xs text-accent-secondary"
              value={publicKeyNoCoord}
              address
              noFade
              symbols={12}
              noCopy
            />
          </div>
        </div>
        <button
          onClick={() => copyToClipboard(publicKeyNoCoord)}
          className="hover:bg-surface-tertiary ml-3 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded p-1 transition-colors hover:opacity-80"
        >
          <CopyIcon size={16} />
        </button>
      </div>
    </div>
  );
};
