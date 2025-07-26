import { type PropsWithChildren, createContext, useEffect, useMemo, useState } from "react";

import type { IChain, IWallet } from "@/core/types";

export type Screen<T extends string = string> = {
  type: T;
  params?: Record<string, any>;
};

export type Screens =
  | Screen<"LOADER">
  | Screen<"TERMS_OF_SERVICE">
  | Screen<"CHAINS">
  | Screen<"WALLETS">
  | Screen<"INSCRIPTIONS">
  | Screen<"ERROR">;

export interface State {
  confirmed: boolean;
  visible: boolean;
  screen: Screens;
  selectedWallets: Record<string, IWallet | undefined>;
  chains: Record<string, IChain>;
}

export interface Actions {
  open?: () => void;
  close?: () => void;
  displayLoader?: (message?: string) => void;
  displayChains?: () => void;
  displayWallets?: (chain: string) => void;
  displayInscriptions?: () => void;
  displayTermsOfService?: () => void;
  displayError?: (params: {
    icon?: JSX.Element;
    title: string;
    description: string;
    cancelButton?: string;
    submitButton?: string;
    onCancel?: () => void;
    onSubmit?: () => void;
  }) => void;
  selectWallet?: (chain: string, wallet: IWallet) => void;
  removeWallet?: (chain: string) => void;
  confirm?: () => void;
  reset?: () => void;
}

const defaultState: State = {
  confirmed: false,
  visible: false,
  screen: { type: "TERMS_OF_SERVICE" },
  chains: {},
  selectedWallets: {},
};

export const StateContext = createContext<State & Actions>(defaultState);

interface StateProviderProps {
  chains: IChain[];
}

export function StateProvider({ children, chains }: PropsWithChildren<StateProviderProps>) {
  const [state, setState] = useState<State>(defaultState);

  useEffect(() => {
    setState((state) => ({ ...state, chains: chains.reduce((acc, chain) => ({ ...acc, [chain.id]: chain }), {}) }));
  }, [chains]);

  const actions: Actions = useMemo(
    () => ({
      open: () => {
        setState((state) => ({ ...state, visible: true }));
      },

      close: () => {
        setState((state) => ({ ...state, visible: false }));
      },

      reset: () => {
        setState(({ chains }) => ({ ...defaultState, chains }));
      },

      displayLoader: (message = "") => {
        setState((state) => ({ ...state, screen: { type: "LOADER", params: { message } } }));
      },

      displayTermsOfService: () => {
        setState((state) => ({ ...state, screen: { type: "TERMS_OF_SERVICE" } }));
      },

      displayChains: () => {
        setState((state) => ({ ...state, screen: { type: "CHAINS" } }));
      },

      displayWallets: (chain: string) => {
        setState((state) => ({ ...state, screen: { type: "WALLETS", params: { chain } } }));
      },

      displayInscriptions: () => {
        setState((state) => ({ ...state, screen: { type: "INSCRIPTIONS" } }));
      },

      displayError: (params) => {
        setState((state) => ({ ...state, screen: { type: "ERROR", params } }));
      },

      selectWallet: (chain: string, wallet: IWallet) => {
        setState((state) => ({
          ...state,
          selectedWallets: { ...state.selectedWallets, [chain]: wallet },
        }));
      },

      removeWallet: (chain: string) => {
        setState((state) => ({
          ...state,
          selectedWallets: { ...state.selectedWallets, [chain]: undefined },
        }));
      },

      confirm: () => {
        setState((state) => ({ ...state, confirmed: true }));
      },
    }),
    [],
  );

  const context = useMemo(
    () => ({
      ...state,
      ...actions,
    }),
    [state, actions],
  );

  return <StateContext.Provider value={context}>{children}</StateContext.Provider>;
}
