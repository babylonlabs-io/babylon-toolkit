/**
 * Activating Vaults Context
 *
 * Holds, in memory only, the vault(s) the user just activated (the activation
 * ETH tx has confirmed) but which the Aave indexer has not yet ingested as
 * collateral. The dashboard merges these into the collateral list as
 * "Activating…" rows so the user sees their vault immediately, instead of an
 * empty section (or a missing row) during the ~15s indexer gap.
 *
 * Deliberately NOT persisted (no localStorage): it is best-effort immediate
 * feedback, mirroring ReorderOverrideContext. A page refresh mid-gap drops it
 * and the dashboard falls back to indexer data. Each entry is cleared once the
 * indexer reflects the vault (see useDashboardState) or, as a backstop, after
 * ACTIVATING_OVERRIDE_TIMEOUT_MS.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Hex } from "viem";

/**
 * How long an in-memory activating-vault entry is held before it is
 * auto-cleared, as a backstop in case the indexer never reflects the
 * activation (e.g. a concurrent position change). Until then the dashboard
 * shows the "Activating…" row; reconciliation normally clears it sooner, once
 * the indexer catches up. 90s ≈ 3 × the 30s position poll.
 */
const ACTIVATING_OVERRIDE_TIMEOUT_MS = 90 * 1000;

/** A just-activated vault awaiting indexer ingestion. */
export interface ActivatingVaultEntry {
  /** Derived vault ID: keccak256(abi.encode(peginTxHash, depositor)). */
  vaultId: Hex;
  /** Optimistic BTC amount, replaced by the indexer value on reconciliation. */
  amountBtc: number;
  /** Vault provider Ethereum address (for resolving name/icon in display). */
  providerAddress?: string;
}

interface ActivatingVaultsContextValue {
  /** Map of lowercased vaultId → activating entry awaiting the indexer. */
  activatingVaults: Map<string, ActivatingVaultEntry>;
  /** Record a just-activated vault and (re)arm its auto-clear backstop. */
  addActivatingVault: (entry: ActivatingVaultEntry) => void;
  /** Clear one entry (called when the indexer reconciles, or on the backstop). */
  clearActivatingVault: (vaultId: string) => void;
}

const ActivatingVaultsContext =
  createContext<ActivatingVaultsContextValue | null>(null);

export function ActivatingVaultsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [activatingVaults, setActivatingVaults] = useState<
    Map<string, ActivatingVaultEntry>
  >(new Map());
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const clearTimer = useCallback((key: string) => {
    const timer = timersRef.current.get(key);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(key);
    }
  }, []);

  const clearActivatingVault = useCallback(
    (vaultId: string) => {
      const key = vaultId.toLowerCase();
      clearTimer(key);
      setActivatingVaults((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    },
    [clearTimer],
  );

  const addActivatingVault = useCallback(
    (entry: ActivatingVaultEntry) => {
      const key = entry.vaultId.toLowerCase();
      clearTimer(key);
      setActivatingVaults((prev) => {
        const next = new Map(prev);
        next.set(key, entry);
        return next;
      });
      const timer = setTimeout(() => {
        timersRef.current.delete(key);
        setActivatingVaults((prev) => {
          if (!prev.has(key)) return prev;
          const next = new Map(prev);
          next.delete(key);
          return next;
        });
      }, ACTIVATING_OVERRIDE_TIMEOUT_MS);
      timersRef.current.set(key, timer);
    },
    [clearTimer],
  );

  // Clean up any pending timers if the provider unmounts mid-window.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const value = useMemo(
    () => ({ activatingVaults, addActivatingVault, clearActivatingVault }),
    [activatingVaults, addActivatingVault, clearActivatingVault],
  );

  return (
    <ActivatingVaultsContext.Provider value={value}>
      {children}
    </ActivatingVaultsContext.Provider>
  );
}

/**
 * Access the activating-vaults context. Must be used within an
 * ActivatingVaultsProvider.
 */
export function useActivatingVaults(): ActivatingVaultsContextValue {
  const ctx = useContext(ActivatingVaultsContext);
  if (!ctx) {
    throw new Error(
      "useActivatingVaults must be used within an ActivatingVaultsProvider",
    );
  }
  return ctx;
}
