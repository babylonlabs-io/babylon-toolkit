import { useEffect, useRef, useState } from "react";

import { envInitError } from "@/config/env";
import { wagmiInitError } from "@/config/wagmi";
import { useError } from "@/context/error";
import {
  createEnvConfigError,
  createWagmiInitError,
  runHealthChecks,
} from "@/services/health";

interface UseHealthCheckResult {
  isGeoBlocked: boolean;
  isLoading: boolean;
}

/**
 * Runs health checks on mount (geofencing, GraphQL availability).
 * Displays blocking error modals if checks fail.
 */
export function useHealthCheck(): UseHealthCheckResult {
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

      const result = await runHealthChecks();

      if (result.isGeoBlocked && result.error) {
        setIsGeoBlocked(true);
        handleError({
          error: result.error,
          displayOptions: { blocking: true, noCancel: true },
        });
      } else if (!result.healthy && result.error) {
        handleError({
          error: result.error,
          displayOptions: { blocking: true },
        });
      }

      setIsLoading(false);
    }

    check();
  }, [handleError]);

  return { isGeoBlocked, isLoading };
}
