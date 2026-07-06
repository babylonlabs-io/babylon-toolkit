import { createContext, PropsWithChildren, useContext, useMemo } from "react";

import { usePersistState } from "@/hooks/usePersistState";

interface InscriptionContext {
  lockInscriptions: boolean;
  toggleLockInscriptions?: (value: boolean) => void;
}

const Context = createContext<InscriptionContext>({ lockInscriptions: true });

export function InscriptionProvider({ children, context }: PropsWithChildren<{ context: any }>) {
  const [lockInscriptions, toggleLockInscriptions] = usePersistState(
    "bwc-inscription-modal-lock",
    context.localStorage,
    true,
  );

  const inscriptionContext = useMemo(
    () => ({
      lockInscriptions,
      toggleLockInscriptions,
    }),
    [lockInscriptions, toggleLockInscriptions],
  );

  return <Context.Provider value={inscriptionContext}>{children}</Context.Provider>;
}

export const useInscriptionProvider = () => useContext(Context);
