import { type PropsWithChildren, createContext, useEffect, useMemo, useRef, useState } from "react";

import { WALLET_MODAL_OPEN_EVENT } from "@/constants/walletEvents";
import { WALLET_CONFIRMATION_RECEIPT_KEY } from "@/core/confirmationReceipt";
import type { HashMap, IChain, IWallet } from "@/core/types";

export type Screen<T extends string = string> = {
  type: T;
  params?: Record<string, any>;
};

export type Screens = Screen<"LOADER"> | Screen<"CHAINS"> | Screen<"WALLETS"> | Screen<"ERROR">;

export interface State {
  confirmed: boolean;
  visible: boolean;
  screen: Screens;
  selectedWallets: Record<string, IWallet | undefined>;
  chains: Record<string, IChain>;
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
  validChainIds: Set<string>,
): Record<string, IWallet | undefined> {
  return Object.keys(selectedWallets).reduce(
    (acc, key) => {
      if (validChainIds.has(key)) {
        acc[key] = selectedWallets[key];
      }
      return acc;
    },
    {} as Record<string, IWallet | undefined>,
  );
}

function hasNewRequiredChain(previous: readonly string[], next: readonly string[]): boolean {
  const previousIds = new Set(previous);
  return next.some((chainId) => !previousIds.has(chainId));
}

export function StateProvider({ children, chains, requiredChainIds, storage }: PropsWithChildren<StateProviderProps>) {
  const [state, setState] = useState<State>(() => ({
    ...defaultState,
    chains: chains.reduce((acc, chain) => ({ ...acc, [chain.id]: chain }), {}),
    requiredChainIds: [...requiredChainIds],
  }));
  const stateRef = useRef(state);
  stateRef.current = state;
  const previousRequiredChainIdsRef = useRef([...requiredChainIds]);

  useEffect(() => {
    if (hasNewRequiredChain(previousRequiredChainIdsRef.current, requiredChainIds)) {
      storage?.delete(WALLET_CONFIRMATION_RECEIPT_KEY);
    }
    previousRequiredChainIdsRef.current = [...requiredChainIds];

    setState((state) => {
      const newChains = chains.reduce((acc, chain) => ({ ...acc, [chain.id]: chain }), {});
      const validChainIds = new Set(chains.map((chain) => chain.id));
      const filteredWallets = filterWalletsByValidChains(state.selectedWallets, validChainIds);
      const requirementsExpanded = hasNewRequiredChain(state.requiredChainIds, requiredChainIds);

      return {
        ...state,
        // A confirmation only covers the requirement set that was presented to
        // the user. Adding/replacing a required chain must require an explicit
        // confirmation again; narrowing or reordering the set remains valid.
        confirmed: requirementsExpanded ? false : state.confirmed,
        chains: newChains,
        selectedWallets: filteredWallets,
        requiredChainIds: [...requiredChainIds],
      };
    });
  }, [chains, requiredChainIds, storage]);

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
          // Optional capability loss must not tear down a confirmed required
          // session. A required-chain loss does invalidate that confirmation,
          // so reconnecting cannot silently restore the session or bypass the
          // confirmation lifecycle.
          confirmed: state.requiredChainIds.includes(chain) ? false : state.confirmed,
          selectedWallets: { ...state.selectedWallets, [chain]: undefined },
        }));
      },

      confirm: () => {
        setState((state) => ({ ...state, confirmed: true }));
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
