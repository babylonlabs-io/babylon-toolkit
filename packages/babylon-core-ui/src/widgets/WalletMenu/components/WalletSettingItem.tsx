import React from 'react';
import { Text } from '../../../components/Text';
import { WalletToggle } from './WalletToggle';
import { twJoin } from 'tailwind-merge';

export interface WalletSettingItemProps {
  icon: React.ReactNode;
  title: string;
  status: string;
  value: boolean;
  onChange: (value: boolean) => void;
  className?: string;
}

export const WalletSettingItem: React.FC<WalletSettingItemProps> = ({
  icon,
  title,
  status,
  value,
  onChange,
  className,
}) => {
  return (
    <div className={twJoin(
      "flex items-center justify-between w-full bg-secondary-highlight dark:bg-secondary-strokeLight rounded-[4px] p-3 md:bg-transparent md:dark:bg-transparent md:p-0 md:mb-0",
      className
    )}>
      <div className="flex items-center gap-4">
        {icon}
        <div className="flex flex-col">
          <Text
            variant="body2"
            className="text-accent-primary font-medium"
          >
            {title}
          </Text>
          <Text className="text-accent-secondary !text-xs">
            {status}
          </Text>
        </div>
      </div>
      <WalletToggle
        value={value}
        onChange={onChange}
      />
    </div>
  );
};
