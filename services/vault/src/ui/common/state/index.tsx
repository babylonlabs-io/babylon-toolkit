import { VaultDepositState, VaultRedeemState } from "@routes/vault";
import { useTheme } from "next-themes";
import { useMemo, type PropsWithChildren } from "react";

import { createStateUtils } from "../utils/createStateUtils";

// Minimal AppState interface for vault functionality
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

  const context = useMemo(
    () => ({
      theme,
      setTheme: (newTheme: "dark" | "light") => setTheme(newTheme),
    }),
    [theme, setTheme],
  );

  return (
    <StateProvider value={context}>
      <VaultDepositState>
        <VaultRedeemState>{children}</VaultRedeemState>
      </VaultDepositState>
    </StateProvider>
  );
}

export { useApplicationState };
