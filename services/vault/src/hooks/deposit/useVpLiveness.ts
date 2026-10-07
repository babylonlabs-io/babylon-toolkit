import { useCallback, useEffect, useRef, useState } from "react";

import { logger } from "@/infrastructure";
import { TELEMETRY_EVENT, shortId } from "@/infrastructure/telemetryEvents";
import { probeVpLiveness, type VpLivenessOutcome } from "@/services/vpLiveness";

/** `idle` means no probe ran: disabled, or the deposit has no provider address. */
export type VpLivenessStatus = "idle" | "probing" | VpLivenessOutcome;

export interface VpLivenessState {
  status: VpLivenessStatus;
  retry: () => void;
}

/**
 * Probes the deposit's vault provider once each time `enabled` turns on or
 * `retry` is called. The modal that mounts this remounts per vault, so the
 * one-event-per-mount telemetry guard is also one per vault.
 */
export function useVpLiveness(
  providerAddress: string | undefined,
  vaultId: string,
  enabled: boolean,
): VpLivenessState {
  const [status, setStatus] = useState<VpLivenessStatus>("idle");
  const [attempt, setAttempt] = useState(0);
  const reportedRef = useRef(false);

  useEffect(() => {
    if (!enabled || !providerAddress) {
      setStatus("idle");
      return;
    }
    const controller = new AbortController();
    const report = (outcome: VpLivenessOutcome) => {
      if (outcome === "reachable" || reportedRef.current) return;
      reportedRef.current = true;
      logger.event(TELEMETRY_EVENT.ACTIVATION_PROVIDER_UNCONFIRMED, {
        level: "warning",
        category: "activation",
        tags: { vaultId: shortId(vaultId), outcome },
      });
    };
    setStatus("probing");
    probeVpLiveness(providerAddress, vaultId, controller.signal)
      .then((outcome) => {
        if (controller.signal.aborted) return;
        setStatus(outcome);
        report(outcome);
      })
      .catch((error: unknown) => {
        // The probe rejects on abort, or when no proxy URL can be built: a
        // configuration defect the env gate normally stops at startup.
        if (controller.signal.aborted) return;
        logger.error(error, {
          data: { context: "[useVpLiveness] probe rejected" },
        });
        setStatus("proxy-unreachable");
        report("proxy-unreachable");
      });
    return () => controller.abort();
  }, [enabled, providerAddress, vaultId, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { status, retry };
}
