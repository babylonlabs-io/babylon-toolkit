import React, { useId } from 'react';
import { useCopy, UseCopyOptions } from '../../hooks/useCopy';
import { twMerge } from 'tailwind-merge';

export interface CopyProps {
  children: React.ReactNode;
  value: string;
  showIcon?: boolean;
  className?: string;
  onCopy?: (value: string) => void;
  // External control props
  isCopied?: boolean;
  copiedText?: string;
  // useCopy hook options
  timeout?: number;
}

export const Copy: React.FC<CopyProps> = ({
  children,
  value,
  className,
  onCopy,
  isCopied: externalIsCopied,
  copiedText: externalCopiedText,
  timeout = 2000,
}) => {
  const uniqueId = useId();

  const hookOptions: UseCopyOptions = {
    copiedText: externalCopiedText,
    timeout,
  };

  const {
    isCopied: hookIsCopied,
    copiedText: hookCopiedText,
    copyToClipboard,
  } = useCopy(hookOptions);

  const isExternallyControlled = externalIsCopied !== undefined;
  const isCopied = isExternallyControlled
    ? externalIsCopied
    : hookIsCopied(uniqueId);
  const copiedText = isExternallyControlled
    ? externalCopiedText || 'Copied ✓'
    : hookCopiedText(uniqueId);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();

    if (isExternallyControlled && onCopy) {
      onCopy(value);
    } else {
      copyToClipboard(uniqueId, value);
    }
  };

  return (
    <div
      className={twMerge(
        'inline-flex items-center cursor-pointer hover:opacity-100 transition-opacity duration-200',
        className,
      )}
      onClick={handleClick}
    >
      <div className='relative'>
        {/* Original children */}
        <div
          className={twMerge(
            'transition-opacity duration-300 ease-in-out',
            isCopied && 'opacity-0',
          )}
        >
          {children}
        </div>

        {/* Copied text overlay */}
        {isCopied && (
          <div
            className={twMerge(
              'absolute inset-0 flex items-center transition-opacity duration-300 ease-in-out text-green-600',
              'opacity-100',
            )}
          >
            {copiedText}
          </div>
        )}
      </div>
    </div>
  );
};
