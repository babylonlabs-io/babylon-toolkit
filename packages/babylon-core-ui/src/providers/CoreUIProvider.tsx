import { createContext, useContext, ReactNode } from 'react';

interface CoreUIContextValue {
  portalContainer: HTMLElement | null;
}

const CoreUIContext = createContext<CoreUIContextValue>({
  portalContainer: null,
});

export const useCoreUI = () => useContext(CoreUIContext);

interface CoreUIProviderProps {
  children: ReactNode;
  portalContainer?: HTMLElement | null;
}

export function CoreUIProvider({ 
  children, 
  portalContainer = null 
}: CoreUIProviderProps) {
  return (
    <CoreUIContext.Provider value={{ portalContainer }}>
      {children}
    </CoreUIContext.Provider>
  );
}

