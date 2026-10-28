import { useEffect, useState } from "react";

/**
 * A wallet-connection error scoped to the connected wallet: it clears
 * when the wallet or its address changes. An error written after the
 * change (for example by a probe that started before it) is not cleared.
 */
export function useWalletScopedError(walletKey: string) {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setError(null);
  }, [walletKey]);
  return [error, setError] as const;
}
