import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

import { envInitError } from "@/config/env";
import { wagmiInitError } from "@/config/wagmi";
import { useError } from "@/context/error";
import {
  checkGeofencing,
  checkGraphQLEndpoint,
  createEnvConfigError,
  createWagmiInitError,
} from "@/services/health";

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
      if (envInitError) {
        handleError({
          error: createEnvConfigError(envInitError),
          displayOptions: { blocking: true },
        });
        setIsLoading(false);
        return;
      }

      if (wagmiInitError) {
        handleError({
          error: createWagmiInitError(),
          displayOptions: { blocking: true },
        });
        setIsLoading(false);
        return;
      }

      const geoResult = await checkGeofencing();
      if (geoResult.isGeoBlocked && geoResult.error) {
        setIsGeoBlocked(true);
        handleError({
          error: geoResult.error,
          displayOptions: { blocking: true },
        });
        setIsLoading(false);
        return;
      }

      const graphqlResult = await checkGraphQLEndpoint();
      if (!graphqlResult.healthy && graphqlResult.error) {
        handleError({
          error: graphqlResult.error,
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
