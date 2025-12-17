import { useEffect, useRef } from "react";

import { CONTRACTS } from "@/config/contracts";
import { envInitError } from "@/config/env";
import { wagmiInitError } from "@/config/wagmi";
import { useError } from "@/context/error";
import {
  createEnvConfigError,
  createWagmiInitError,
  runHealthChecks,
} from "@/services/health";

export function useHealthCheck() {
  const { handleError } = useError();
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (hasRunRef.current) return;
    hasRunRef.current = true;

    async function check() {
      if (envInitError) {
        handleError({
          error: createEnvConfigError(envInitError),
          displayOptions: { blocking: true },
        });
        return;
      }

      if (wagmiInitError) {
        handleError({
          error: createWagmiInitError(),
          displayOptions: { blocking: true },
        });
        return;
      }

      const result = await runHealthChecks(CONTRACTS.MORPHO_CONTROLLER);

      if (!result.healthy && result.error) {
        handleError({
          error: result.error,
          displayOptions: { blocking: true },
        });
      }
    }

    check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
