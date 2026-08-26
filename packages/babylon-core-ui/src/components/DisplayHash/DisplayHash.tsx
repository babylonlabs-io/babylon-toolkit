import React from 'react';
import { Text } from '../Text';
import { trim } from '../../utils/trim';
import { twJoin } from 'tailwind-merge';

interface DisplayHashProps {
  value: string;
  symbols?: number;
  size?: React.ComponentProps<typeof Text>['variant'];
  className?: string;
}

export const DisplayHash: React.FC<DisplayHashProps> = ({
  value,
  symbols = 8,
  size = 'body2',
  className,
}) => {
  if (!value) {
    return null;
  }

  return (
    <Text variant={size} className={twJoin('text-accent-primary', className)}>
      <span>{trim(value, symbols) ?? value}</span>
    </Text>
  );
};
