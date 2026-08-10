import { createContext, PropsWithChildren, useContext, useMemo } from "react";

import type { Account, ChainId, IWallet } from "@/core/types";

export interface WalletLifecycleConnection {
  chain: ChainId;
  wallet: IWallet;
  account: Account;
}

export interface TermsOfServiceParams {
  /** Primary account, retained for compatibility with the original BTC-only callback. */
  address: string;
  /** Primary public key, retained for compatibility with the original BTC-only callback. */
  public_key: string;
  chain: ChainId;
  connections: WalletLifecycleConnection[];
}

export interface LifeCycleHooksProps {
  verifyBTCAddress?: (address: string) => Promise<boolean>;
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
