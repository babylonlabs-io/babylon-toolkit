import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

import { useError } from "@/context/error";
import { checkGeofencing } from "@/services/health";

import type { GeoFencingContextType } from "./types";

const GeoFencingContext = createContext<GeoFencingContextType>({
  isGeoBlocked: false,
  isLoading: true,
});

export function GeoFencingProvider({ children }: PropsWithChildren) {
  const { handleError } = useError();
  const hasRunRef = useRef(false);
  const [isGeoBlocked, setIsGeoBlocked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (hasRunRef.current) return;
    hasRunRef.current = true;

    async function check() {
      const result = await checkGeofencing();

      if (result.isGeoBlocked && result.error) {
        setIsGeoBlocked(true);
        handleError({
          error: result.error,
          displayOptions: { blocking: true },
        });
      }

      setIsLoading(false);
    }

    check();
  }, [handleError]);

  const value = useMemo(
    () => ({ isGeoBlocked, isLoading }),
    [isGeoBlocked, isLoading],
  );

  return (
    <GeoFencingContext.Provider value={value}>
      {children}
    </GeoFencingContext.Provider>
  );
}

export const useGeoFencing = () => useContext(GeoFencingContext);
