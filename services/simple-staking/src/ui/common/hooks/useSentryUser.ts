import { getIsolationScope, setUser } from "@babylonlabs-io/observability";
import { useCallback } from "react";

import { redactTelemetry } from "../utils/telemetry";

export const useSentryUser = () => {
  const updateUser = useCallback((updates: Record<string, any>) => {
    const currentScope = getIsolationScope();
    const currentUser = currentScope.getUser();

    // Redact sensitive address fields before setting in Sentry
    const sanitizedUpdates: Record<string, any> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (
        (key === "btcAddress" || key === "babylonAddress") &&
        typeof value === "string"
      ) {
        // Redact the address for privacy
        sanitizedUpdates[key] = redactTelemetry(value);
      } else {
        sanitizedUpdates[key] = value;
      }
    }

    setUser({
      ...currentUser,
      ...sanitizedUpdates,
    });
  }, []);

  return { updateUser };
};
