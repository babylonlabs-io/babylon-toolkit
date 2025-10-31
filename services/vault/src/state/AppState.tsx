import { useInscriptionProvider } from "@babylonlabs-io/wallet-connector";
import { useTheme } from "next-themes";
import { useCallback, useMemo, type PropsWithChildren } from "react";

import { createStateUtils } from "../utils/createStateUtils";

export interface AppState {
  theme?: string;
  setTheme: (theme: "dark" | "light") => void;
  ordinalsExcluded: boolean;
  includeOrdinals: () => void;
  excludeOrdinals: () => void;
}

const { StateProvider, useState: useApplicationState } =
  createStateUtils<AppState>({
    theme: undefined,
    setTheme: () => {},
    ordinalsExcluded: true,
    includeOrdinals: () => {},
    excludeOrdinals: () => {},
  });

export function AppState({ children }: PropsWithChildren) {
  const { theme, setTheme } = useTheme();
  const { lockInscriptions: ordinalsExcluded, toggleLockInscriptions } =
    useInscriptionProvider();

  // Handlers
  const includeOrdinals = useCallback(
    () => toggleLockInscriptions?.(false),
    [toggleLockInscriptions],
  );
  const excludeOrdinals = useCallback(
    () => toggleLockInscriptions?.(true),
    [toggleLockInscriptions],
  );

  // Context
  const context = useMemo(
    () => ({
      theme,
      setTheme,
      ordinalsExcluded,
      includeOrdinals,
      excludeOrdinals,
    }),
    [theme, setTheme, ordinalsExcluded, includeOrdinals, excludeOrdinals],
  );

  return <StateProvider value={context}>{children}</StateProvider>;
}

export const useAppState = useApplicationState;
