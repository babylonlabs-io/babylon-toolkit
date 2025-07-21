import { useCallback, useEffect, useState } from 'react';

export interface UseCopyReturn {
  isCopied: (id: string) => boolean;
  copiedText: (id: string) => string;
  copyToClipboard: (id: string, value: string) => void;
}

export interface UseCopyOptions {
  copiedText?: string;
  timeout?: number;
}

export function useCopy(options: UseCopyOptions = {}): UseCopyReturn {
  const { copiedText = 'Copied ✓', timeout = 2000 } = options;

  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({});
  const [copiedTexts, setCopiedTexts] = useState<Record<string, string>>({});

  const handleCopy = useCallback(
    (id: string, value: string) => {
      if (!id || !value) return;
      
      // Copy to clipboard using the native API
      navigator.clipboard.writeText(value).catch(err => {
        console.error('Failed to copy to clipboard:', err);
      });
      
      setCopiedStates((prev) => ({ ...prev, [id]: true }));
      setCopiedTexts((prev) => ({ ...prev, [id]: copiedText }));
    },
    [copiedText],
  );

  const reset = useCallback((id: string) => {
    if (!id) return;
    setCopiedStates((prev) => ({ ...prev, [id]: false }));
    setCopiedTexts((prev) => ({ ...prev, [id]: '' }));
  }, []);

  const isCopied = useCallback(
    (id: string) => {
      if (!id) return false;
      return copiedStates[id] || false;
    },
    [copiedStates],
  );

  const getText = useCallback(
    (id: string) => {
      if (!id) return '';
      return copiedTexts[id] || '';
    },
    [copiedTexts],
  );

  useEffect(() => {
    const timers: Record<string, NodeJS.Timeout> = {};

    Object.entries(copiedStates).forEach(([id, copied]) => {
      if (copied) {
        timers[id] = setTimeout(() => {
          reset(id);
        }, timeout);
      }
    });

    return () => {
      Object.values(timers).forEach((timer) => clearTimeout(timer));
    };
  }, [copiedStates, timeout, reset]);

  return {
    isCopied,
    copiedText: getText,
    copyToClipboard: handleCopy,
  };
}
