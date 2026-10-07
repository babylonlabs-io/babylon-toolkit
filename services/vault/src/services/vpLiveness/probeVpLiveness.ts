import { VpResponseValidationError } from "@babylonlabs-io/ts-sdk/tbv/core/clients";

import { ENV } from "@/config/env";
import { createVpClient } from "@/utils/rpc";

export type VpLivenessOutcome =
  | "reachable"
  | "vp-unconfirmed"
  | "proxy-unreachable";

/** Per-attempt budget for the one status call; the SDK default is 60 s. */
const VP_LIVENESS_PROBE_TIMEOUT_MS = 10_000;
/** The SDK stops its timer at response headers, so a stalled body needs this. */
const VP_LIVENESS_PROBE_DEADLINE_MS = 15_000;
/** The proxy's own liveness endpoint answers at once or not at all. */
const PROXY_HEALTH_TIMEOUT_MS = 5_000;

class ProbeDeadlineError extends Error {
  constructor() {
    super("Probe deadline exceeded");
    this.name = "ProbeDeadlineError";
  }
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("Aborted", "AbortError");
}

/**
 * Asks the deposit's vault provider one cheap, unauthenticated question. Only a
 * result proves it is alive: the proxy writes JSON-RPC errors of its own, and
 * the SDK labels them like the daemon's. Silence is reported as unconfirmed, or
 * as the service being down when the proxy's /health does not answer either.
 * Rejects only when `signal` aborts or no proxy URL can be built.
 */
export async function probeVpLiveness(
  providerAddress: string,
  vaultId: string,
  signal?: AbortSignal,
): Promise<VpLivenessOutcome> {
  if (signal?.aborted) throw abortReason(signal);

  // Throws for a missing VP_PROXY_URL or a malformed address; the env gate and
  // the modal's incomplete-details block each stop those before this runs.
  const client = createVpClient(providerAddress, {
    timeout: VP_LIVENESS_PROBE_TIMEOUT_MS,
    retries: 0,
  });

  const deadline = new AbortController();
  const deadlineId = setTimeout(
    () => deadline.abort(),
    VP_LIVENESS_PROBE_DEADLINE_MS,
  );
  const forwardAbort = () => deadline.abort();
  signal?.addEventListener("abort", forwardAbort);
  try {
    await Promise.race([
      client.getPeginStatusByVaultId({ vault_id: vaultId }, deadline.signal),
      rejectOnAbort(deadline.signal),
    ]);
    return "reachable";
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error instanceof VpResponseValidationError) return "reachable";
    return (await isProxyHealthy(signal))
      ? "vp-unconfirmed"
      : "proxy-unreachable";
  } finally {
    clearTimeout(deadlineId);
    signal?.removeEventListener("abort", forwardAbort);
  }
}

function rejectOnAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    if (signal.aborted) reject(new ProbeDeadlineError());
    signal.addEventListener("abort", () => reject(new ProbeDeadlineError()), {
      once: true,
    });
  });
}

async function isProxyHealthy(signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) throw abortReason(signal);
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    PROXY_HEALTH_TIMEOUT_MS,
  );
  const forwardAbort = () => controller.abort();
  signal?.addEventListener("abort", forwardAbort);
  try {
    const response = await fetch(`${ENV.VP_PROXY_URL}/health`, {
      signal: controller.signal,
    });
    return response.ok;
  } catch (error) {
    if (signal?.aborted) throw error;
    return false;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", forwardAbort);
  }
}
