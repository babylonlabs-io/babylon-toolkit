import { useEffect, useRef, useState } from "react";

import { envInitError } from "@/config/env";
import { wagmiInitError } from "@/config/wagmi";
import { useError } from "@/context/error";
import {
  checkGraphQLEndpoint,
  createEnvConfigError,
  createWagmiInitError,
} from "@/services/health";

interface UseHealthCheckResult {
  isLoading: boolean;
}

/**
 * Runs health checks on mount (env config, wagmi init, GraphQL availability).
 * Displays blocking error modals if checks fail.
 */
export function useHealthCheck(): UseHealthCheckResult {
  const { handleError } = useError();
  const hasRunRef = useRef(false);
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

      const result = await checkGraphQLEndpoint();

      if (!result.healthy && result.error) {
        handleError({
          error: result.error,
          displayOptions: { blocking: true },
        });
      }

      setIsLoading(false);
    }

    check();
  }, [handleError]);

  return { isLoading };
}
