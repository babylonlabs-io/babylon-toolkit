import { createContext, PropsWithChildren, useContext, useMemo } from "react";

import { usePersistState } from "@/hooks/usePersistState";

interface InscriptionContext {
  lockInscriptions: boolean;
  showAgain: boolean;
  toggleLockInscriptions?: (value: boolean) => void;
  toggleShowAgain?: (value: boolean) => void;
}

const Context = createContext<InscriptionContext>({ lockInscriptions: true, showAgain: true });

export function InscriptionProvider({ children, context }: PropsWithChildren<{ context: any }>) {
  const [showAgain, toggleShowAgain] = usePersistState("bwc-inscription-modal-show-again", context.localStorage, true);
  const [lockInscriptions, toggleLockInscriptions] = usePersistState(
    "bwc-inscription-modal-lock",
    context.localStorage,
    true,
  );

  const inscriptionContext = useMemo(
    () => ({
      showAgain,
      lockInscriptions,
      toggleLockInscriptions,
      toggleShowAgain,
    }),
    [showAgain, lockInscriptions, toggleLockInscriptions, toggleShowAgain],
  );

  return <Context.Provider value={inscriptionContext}>{children}</Context.Provider>;
}

export const useInscriptionProvider = () => useContext(Context);
