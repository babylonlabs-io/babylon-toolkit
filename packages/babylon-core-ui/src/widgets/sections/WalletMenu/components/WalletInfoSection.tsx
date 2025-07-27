import React from 'react';
import { Text } from '../../../../components/Text';
import { DisplayHash } from '../../../../components/DisplayHash';
import { CopyIcon } from '../../../../components/Icons';
import { twJoin } from 'tailwind-merge';

export interface WalletInfoSectionProps {
  title: string;
  value: string;
  isCopied: boolean;
  onCopy: () => void;
  className?: string;
  icon?: React.ReactNode;
}

export const WalletInfoSection: React.FC<WalletInfoSectionProps> = ({
  title,
  value,
  isCopied,
  onCopy,
  className,
  icon,
}) => {
  return (
    <div className={twJoin(
      "flex items-center justify-between w-full bg-secondary-highlight dark:bg-secondary-strokeLight rounded-[4px] p-3 md:bg-transparent md:dark:bg-transparent md:p-0 md:mb-0",
      className
    )}>
      <div className="flex flex-col w-full">
        <div className="flex items-center gap-4 mb-3">
          {icon && (
            <div className="flex-shrink-0">
              {icon}
            </div>
          )}
          <div className="flex w-full">
            <div className="flex flex-col w-full">
              <Text
                variant="body2"
                className="text-accent-primary font-medium text-xs"
              >
                {title}
              </Text>
              <div className="flex items-center justify-between w-full">
                <div className="flex-1 min-w-0">
                  {isCopied ? (
                    <Text className="text-accent-secondary !text-xs truncate whitespace-nowrap">
                      Copied ✓
                    </Text>
                  ) : (
                    <DisplayHash
                      className="text-accent-secondary !text-xs"
                      value={value}
                      symbols={6}
                    />
                  )}
                </div>
              </div>

            </div>
            <button
              onClick={onCopy}
              className="flex-shrink-0 ml-3 p-1 rounded hover:bg-surface-tertiary transition-colors h-6 w-6 flex items-center justify-center hover:opacity-80 self-center"
            >
              <CopyIcon size={16} />
            </button>
          </div>
        </div>
      </div>

    </div>
  );
};
