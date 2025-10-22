import { createContext, useContext } from "react";

// Utility for creating type-safe React context providers
// Matches the pattern used in babylon-toolkit-vault-example
export function createStateUtils<S>(defaultState: S) {
  const stateContext = createContext(defaultState);

  return {
    StateProvider: stateContext.Provider,
    useState: () => {
      return useContext(stateContext);
    },
  };
}



