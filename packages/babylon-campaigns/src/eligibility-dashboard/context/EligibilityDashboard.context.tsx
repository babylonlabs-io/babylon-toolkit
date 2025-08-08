import React, { createContext, useContext, useMemo, useState } from "react";

export interface EligibilityState {
  isEligible: boolean;
  setEligible: React.Dispatch<React.SetStateAction<boolean>>;
}

const EligibilityContext = createContext<EligibilityState | undefined>(
  undefined
);

export const EligibilityProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isEligible, setEligible] = useState<boolean>(false);

  const value = useMemo<EligibilityState>(
    () => ({ isEligible, setEligible }),
    [isEligible]
  );

  return (
    <EligibilityContext.Provider value={value}>
      {children}
    </EligibilityContext.Provider>
  );
};

export const useEligibilityContext = (): EligibilityState => {
  const ctx = useContext(EligibilityContext);
  if (!ctx) {
    throw new Error("useEligibilityContext must be used within EligibilityProvider");
  }
  return ctx;
};


