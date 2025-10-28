import { useTheme } from "next-themes";
import { useMemo, type PropsWithChildren } from "react";

import { createStateUtils } from "../utils/createStateUtils";

import { VaultDepositState } from "./VaultDepositState";
import { VaultRedeemState } from "./VaultRedeemState";

export interface AppState {
  theme?: string;
  setTheme: (theme: "dark" | "light") => void;
}

const { StateProvider, useState: useApplicationState } =
  createStateUtils<AppState>({
    theme: undefined,
    setTheme: () => {},
  });

export function AppState({ children }: PropsWithChildren) {
  const { theme, setTheme } = useTheme();

  // Context
  const context = useMemo(
    () => ({
      theme,
      setTheme,
    }),
    [theme, setTheme],
  );

  // Wrap children with vault-specific state providers
  const stateTree = useMemo(
    () => (
      <VaultDepositState>
        <VaultRedeemState>{children}</VaultRedeemState>
      </VaultDepositState>
    ),
    [children],
  );

  return <StateProvider value={context}>{stateTree}</StateProvider>;
}

export const useAppState = useApplicationState;
