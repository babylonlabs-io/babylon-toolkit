import React from 'react';
import { Text } from '../../../../components/Text';
import { Hint } from '../../../../components/Hint';
import { WalletToggle } from './WalletToggle';
import { twJoin } from 'tailwind-merge';

export interface WalletMenuSettingItemProps {
  icon: React.ReactNode;
  title: React.ReactNode;
  status: string;
  value: boolean;
  onChange: (value: boolean) => void;
  className?: string;
  tooltip?: string;
  infoIcon?: React.ReactNode;
}

export const WalletMenuSettingItem: React.FC<WalletMenuSettingItemProps> = ({
  icon,
  title,
  status,
  value,
  onChange,
  className,
  tooltip,
  infoIcon,
}) => {


  return (
    <div className={twJoin(
      "flex items-center justify-between w-full p-3 md:p-0 md:mb-0",
      className
    )}>
      <div className="flex items-center gap-4">
        {icon}
        <div className="flex flex-col">
          {infoIcon && tooltip ? (
            <Text
              as="span"
              variant="body2"
              className="text-accent-primary font-medium"
            >
              {title}
              <Hint 
                tooltip={tooltip} 
                placement="bottom" 
                attachToChildren={true}
                offset={[20, 8]}
              >
                <span className="inline-block align-middle text-secondary-strokeDark cursor-pointer ml-1">
                  {infoIcon}
                </span>
              </Hint>
            </Text>
          ) : (
            <Hint
              tooltip={tooltip}
              attachToChildren={!!tooltip}
              placement="bottom"
            >
              <Text
                as="span"
                variant="body2"
                className="text-accent-primary font-medium"
              >
                {title}
              </Text>
            </Hint>
          )}
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
