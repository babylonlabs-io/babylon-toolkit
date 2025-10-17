import { createContext, useContext } from "react";

// TODO: This utility will be moved to a shared location (e.g., @babylonlabs-io/core-ui)
// in a future refactor to avoid duplication across packages.
export function createStateUtils<S>(defaultState: S) {
  const stateContext = createContext(defaultState);

  return {
    StateProvider: stateContext.Provider,
    useState: () => {
      return useContext(stateContext);
    },
  };
}

