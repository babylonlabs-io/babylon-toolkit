import { type PropsWithChildren, createContext, useEffect, useMemo, useRef, useState } from "react";

import { WALLET_MODAL_OPEN_EVENT } from "@/constants/walletEvents";
import { WALLET_CONFIRMATION_RECEIPT_KEY } from "@/core/confirmationReceipt";
import type { HashMap, IChain, IWallet } from "@/core/types";

export type Screen<T extends string = string> = {
  type: T;
  params?: Record<string, any>;
};

export type Screens =
  | Screen<"LOADER">
  | Screen<"CHAINS">
  | Screen<"WALLETS">
  | Screen<"ERROR">;

export interface State {
  confirmed: boolean;
  visible: boolean;
  screen: Screens;
  selectedWallets: Record<string, IWallet | undefined>;
  /** Every chain the dialog displays. */
  chains: Record<string, IChain>;
  /**
   * The subset of `chains` a host requires before the session counts as
   * connected. Chains outside this set are offered but never block confirm.
   */
  requiredChainIds: string[];
}

export interface Actions {
  open?: () => void;
  close?: () => void;
  displayLoader?: (message?: string, description?: string) => void;
  displayChains?: () => void;
  displayWallets?: (chain: string) => void;
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
  /** Withdraws the confirmation without disconnecting anything. */
  unconfirm?: () => void;
  reset?: () => void;
}

const defaultState: State = {
  confirmed: false,
  visible: false,
  screen: { type: "CHAINS" },
  chains: {},
  selectedWallets: {},
  requiredChainIds: [],
};

export const StateContext = createContext<State & Actions>(defaultState);

interface StateProviderProps {
  chains: IChain[];
  requiredChainIds: readonly string[];
  storage?: HashMap;
}

// Filters selected wallets to only include those that belong to currently valid chains.
// This ensures wallet state stays in sync when the available chains configuration changes.
function filterWalletsByValidChains(
  selectedWallets: Record<string, IWallet | undefined>,
  validChainIds: Set<string>
): Record<string, IWallet | undefined> {
  return Object.keys(selectedWallets).reduce((acc, key) => {
    if (validChainIds.has(key)) {
      acc[key] = selectedWallets[key];
    }
    return acc;
  }, {} as Record<string, IWallet | undefined>);
}

export function StateProvider({ children, chains, requiredChainIds, storage }: PropsWithChildren<StateProviderProps>) {
  const [state, setState] = useState<State>(() => ({
    ...defaultState,
    chains: chains.reduce((acc, chain) => ({ ...acc, [chain.id]: chain }), {}),
    requiredChainIds: [...requiredChainIds],
  }));
  const stateRef = useRef(state);
  stateRef.current = state;

  // A change to the requirement set is not itself a consent change. Hosts that
  // derive requirements per route narrow and widen this list as the user
  // navigates, and tearing the confirmation down here would sign them out on
  // routine navigation. Whether the stored approval still covers the new set is
  // decided in `useWalletConnectors`, which can see the live connections.
  useEffect(() => {
    setState((state) => {
      const newChains = chains.reduce((acc, chain) => ({ ...acc, [chain.id]: chain }), {});
      const validChainIds = new Set(chains.map((chain) => chain.id));
      const filteredWallets = filterWalletsByValidChains(state.selectedWallets, validChainIds);

      return {
        ...state,
        chains: newChains,
        selectedWallets: filteredWallets,
        requiredChainIds: [...requiredChainIds],
      };
    });
  }, [chains, requiredChainIds]);

  const actions: Actions = useMemo(
    () => ({
      open: () => {
        // Let late-injection re-detection (useWalletRedetection) re-check for
        // wallets that injected after the initial detection before the user
        // sees the wallet list — otherwise a slow extension shows as a
        // download link until the next reload.
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event(WALLET_MODAL_OPEN_EVENT));
        }
        setState((state) => ({ ...state, visible: true }));
      },

      close: () => {
        setState((state) => ({ ...state, visible: false }));
      },

      reset: () => {
        storage?.delete(WALLET_CONFIRMATION_RECEIPT_KEY);
        setState(({ chains, requiredChainIds }) => ({ ...defaultState, chains, requiredChainIds }));
      },

      displayLoader: (message = "", description = "") => {
        setState((state) => ({ ...state, screen: { type: "LOADER", params: { message, description } } }));
      },

      displayChains: () => {
        setState((state) => ({ ...state, screen: { type: "CHAINS" } }));
      },

      displayWallets: (chain: string) => {
        setState((state) => ({ ...state, screen: { type: "WALLETS", params: { chain } } }));
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
        if (stateRef.current.requiredChainIds.includes(chain)) {
          storage?.delete(WALLET_CONFIRMATION_RECEIPT_KEY);
        }
        setState((state) => ({
          ...state,
          // Losing an optional chain must not tear down a confirmed session.
          // Losing a required one does invalidate the confirmation, so
          // reconnecting cannot silently restore it.
          confirmed: state.requiredChainIds.includes(chain) ? false : state.confirmed,
          selectedWallets: { ...state.selectedWallets, [chain]: undefined },
        }));
      },

      confirm: () => {
        setState((state) => ({ ...state, confirmed: true }));
      },

      unconfirm: () => {
        setState((state) => (state.confirmed ? { ...state, confirmed: false } : state));
      },
    }),
    [storage],
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
