import { createContext, PropsWithChildren, useContext, useMemo } from "react";

import type { Account, ChainId, IWallet } from "@/core/types";

export interface WalletLifecycleConnection {
  chain: ChainId;
  wallet: IWallet;
  account: Account;
}

export interface TermsOfServiceParams {
  /**
   * Address of the connected account for the first chain in `requiredChains`.
   * Read `connections` instead whenever the chain the address belongs to matters.
   */
  address: string;
  /**
   * Public key of that same account. Read `connections` instead whenever the
   * chain the key belongs to matters.
   */
  public_key: string;
  chain: ChainId;
  connections: WalletLifecycleConnection[];
}

export interface LifeCycleHooksProps {
  verifyBTCAddress?: (address: string) => Promise<boolean>;
  /** Fires once when the dialog is confirmed, not when a wallet connects, and is skipped when an already-confirmed session is confirmed again. */
  acceptTermsOfService?: (params: TermsOfServiceParams) => Promise<void>;
  onConnect?: (connection: WalletLifecycleConnection) => void | Promise<void>;
  onDisconnect?: (connection: WalletLifecycleConnection) => void | Promise<void>;
  onConfirm?: (connections: WalletLifecycleConnection[]) => void | Promise<void>;
}

const Context = createContext<LifeCycleHooksProps>({});

export function LifeCycleHooksProvider({ children, value }: PropsWithChildren<{ value?: LifeCycleHooksProps }>) {
  const context = useMemo(() => {
    return value ?? {};
  }, [value]);

  return <Context.Provider value={context}>{children}</Context.Provider>;
}

export const useLifeCycleHooks = () => useContext(Context);
