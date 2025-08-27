import React from 'react';
import { Avatar } from '../../../../components/Avatar';
import { Text } from '../../../../components/Text';
import { DisplayHash } from '../../../../components/DisplayHash';
import { CopyIcon } from '../../../../components/Icons';
import { twJoin } from 'tailwind-merge';

export interface WalletInfoCardProps {
  walletType: 'Bitcoin' | 'Babylon';
  walletName?: string;
  walletIcon?: string;
  address: string;
  isCopied: boolean;
  onCopy: () => void;
  className?: string;
}

export const WalletInfoCard: React.FC<WalletInfoCardProps> = ({
  walletType,
  walletName,
  walletIcon,
  address,
  isCopied,
  onCopy,
  className,
}) => {
  return (
    <div className={twJoin(
      "bg-[#F9F9F9] dark:bg-[#2F2F2F] rounded-[4px] p-3 flex-1 md:p-4",
      className
    )}>
      <div className="flex flex-col w-full">
        <div className="flex justify-start mb-2 md:mb-3">
          <Avatar
            alt={walletName || walletType}
            url={walletIcon || ''}
            size="large"
            className="w-8 h-8 md:w-10 md:h-10"
          />
        </div>

        <div className="flex justify-start mb-[1px]">
          <Text
            variant="body1"
            className="text-accent-secondary font-medium !text-xs"
          >
            {walletType} Wallet
          </Text>
        </div>

        <div className="flex items-center justify-between w-full">
          <div className="flex-1 min-w-0">
            {isCopied ? (
              <Text className="text-accent-primary !text-sm truncate whitespace-nowrap">
                Copied ✓
              </Text>
            ) : (
              <DisplayHash
                className="text-accent-primary !text-sm"
                value={address}
                symbols={6}
              />
            )}
          </div>
          <button
            onClick={onCopy}
            className="flex-shrink-0 ml-3 p-1 rounded hover:bg-[#d7e1e7] dark:hover:bg-[#252525] transition-colors h-6 w-6 flex items-center justify-center hover:opacity-80"
          >
            <CopyIcon size={14} className="md:w-4 md:h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
