import { useCallback, useEffect, useRef, useState } from 'react';

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
  const { copiedText: copiedLabel = 'Copied ✓', timeout = 2000 } = options;

  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({});
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({});

  const reset = useCallback((id: string) => {
    if (!id) return;
    setCopiedStates((prev) => ({ ...prev, [id]: false }));
  }, []);

  const handleCopy = useCallback(
    (id: string, value: string) => {
      if (!id || !value) return;

      void navigator.clipboard.writeText(value).catch(() => {});

      setCopiedStates((prev) => ({ ...prev, [id]: true }));

      const existing = timersRef.current[id];
      if (existing) clearTimeout(existing);

      if (timeout > 0) {
        timersRef.current[id] = setTimeout(() => {
          timersRef.current[id] = undefined;
          reset(id);
        }, timeout);
      }
    },
    [timeout, reset],
  );

  

  const isCopied = useCallback(
    (id: string) => {
      if (!id) return false;
      return copiedStates[id] || false;
    },
    [copiedStates],
  );

  const getText = useCallback(
    (id: string) => (id && copiedStates[id] ? copiedLabel : ''),
    [copiedStates, copiedLabel],
  );

  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach((t) => t && clearTimeout(t));
      timersRef.current = {};
    };
  }, []);

  return {
    isCopied,
    copiedText: getText,
    copyToClipboard: handleCopy,
  };
}
