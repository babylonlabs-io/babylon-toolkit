import { ENV } from "../../config/env";
import { withRequestTimeout } from "../../utils/async";

/** Timeout for the IRM curve request — prevents indefinite hangs from a stalled indexer. */
const IRM_REQUEST_TIMEOUT_MS = 30_000;

export interface IrmCurvePoint {
  /** Utilization in percent, 0–100. */
  utilizationPercent: number;
  /** Borrow APR percent at that utilization, from the on-chain strategy. */
  aprPercent: number;
}

export interface IrmCurve {
  /** Sorted by utilization. */
  curve: IrmCurvePoint[];
  /** Kink (optimal usage) utilization percent. */
  kinkUtilizationPercent: number;
  /** The y-axis ceiling, percent. */
  maxAprPercent: number;
}

/**
 * REST root of the vault indexer. The IRM API is served by the same Hono app
 * as GraphQL (`/api` vs `/` + `/graphql`), so the base derives from the GraphQL
 * endpoint rather than adding a second env var that could point elsewhere.
 */
export function indexerRestBaseUrl(): string {
  return ENV.GRAPHQL_ENDPOINT.replace(/\/graphql\/?$/, "");
}

function assertFiniteNumber(
  value: unknown,
  field: string,
  endpoint: string,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(
      `IRM curve response from ${endpoint} has a non-finite "${field}": ${JSON.stringify(value)}`,
    );
  }
  return value;
}

function assertFiniteNumberAt(
  value: unknown,
  field: string,
  index: number,
  endpoint: string,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(
      `IRM curve point ${index} from ${endpoint} has a non-finite "${field}": ${JSON.stringify(value)}`,
    );
  }
  return value;
}

/**
 * Validate the external payload before use. The indexer's contract is that a
 * 200 always carries a COMPLETE curve — every degraded state (unknown
 * reserve, upstream RPC failure, zero liquidity) is a non-200 — so an empty
 * `points` array here is a contract violation, not a valid empty state, and
 * must throw rather than render a partial/degenerate chart.
 */
function parseIrmPayload(payload: unknown, endpoint: string): IrmCurve {
  if (payload === null || typeof payload !== "object") {
    throw new Error(`IRM curve response from ${endpoint} is not an object`);
  }

  const { kinkUtilizationPercent, maxAprPercent, points } = payload as {
    kinkUtilizationPercent?: unknown;
    maxAprPercent?: unknown;
    points?: unknown;
  };

  const kink = assertFiniteNumber(
    kinkUtilizationPercent,
    "kinkUtilizationPercent",
    endpoint,
  );
  const maxApr = assertFiniteNumber(maxAprPercent, "maxAprPercent", endpoint);

  if (!Array.isArray(points)) {
    throw new Error(
      `IRM curve response from ${endpoint} is missing a "points" array`,
    );
  }
  if (points.length === 0) {
    throw new Error(
      `IRM curve response from ${endpoint} has an empty "points" array`,
    );
  }

  const curve = points.map((point, index) => {
    if (point === null || typeof point !== "object") {
      throw new Error(
        `IRM curve point ${index} from ${endpoint} is not an object`,
      );
    }
    // `aprRay` is deliberately not read or required. The endpoint sends it as
    // the unrounded source figure, but nothing here consumes it, so demanding
    // it would let the indexer blank every chart by trimming a field no client
    // uses.
    const { utilizationPercent, aprPercent } = point as {
      utilizationPercent?: unknown;
      aprPercent?: unknown;
    };
    return {
      utilizationPercent: assertFiniteNumberAt(
        utilizationPercent,
        "utilizationPercent",
        index,
        endpoint,
      ),
      aprPercent: assertFiniteNumberAt(
        aprPercent,
        "aprPercent",
        index,
        endpoint,
      ),
    };
  });

  curve.forEach((point, index) => {
    if (point.utilizationPercent < 0 || point.utilizationPercent > 100) {
      throw new Error(
        `IRM curve point ${index} from ${endpoint} has an out-of-range "utilizationPercent": ${point.utilizationPercent}`,
      );
    }
    if (
      index > 0 &&
      point.utilizationPercent <= curve[index - 1].utilizationPercent
    ) {
      throw new Error(
        `IRM curve response from ${endpoint} is not strictly ascending at point ${index}`,
      );
    }
  });

  if (curve[0].utilizationPercent !== 0) {
    throw new Error(
      `IRM curve response from ${endpoint} does not start at 0% utilization`,
    );
  }
  if (curve[curve.length - 1].utilizationPercent !== 100) {
    throw new Error(
      `IRM curve response from ${endpoint} does not end at 100% utilization`,
    );
  }

  if (kink < 0 || kink > 100) {
    throw new Error(
      `IRM curve response from ${endpoint} has an out-of-range "kinkUtilizationPercent": ${kink}`,
    );
  }
  if (!curve.some((point) => point.utilizationPercent === kink)) {
    throw new Error(
      `IRM curve response from ${endpoint} has a "kinkUtilizationPercent" (${kink}) that is not an exact sample`,
    );
  }

  if (maxApr < 0) {
    throw new Error(
      `IRM curve response from ${endpoint} has a negative "maxAprPercent": ${maxApr}`,
    );
  }
  curve.forEach((point, index) => {
    if (point.aprPercent < 0 || point.aprPercent > maxApr) {
      throw new Error(
        `IRM curve point ${index} from ${endpoint} has an "aprPercent" (${point.aprPercent}) outside [0, maxAprPercent=${maxApr}]`,
      );
    }
  });

  return { curve, kinkUtilizationPercent: kink, maxAprPercent: maxApr };
}

export async function fetchIrmCurve({
  reserveId,
  signal,
}: {
  reserveId: bigint;
  signal?: AbortSignal;
}): Promise<IrmCurve> {
  const endpoint = `${indexerRestBaseUrl()}/api/aave/reserves/${reserveId.toString()}/irm`;

  // The status check and body read both need to happen inside the timeout
  // window — a stalled body on an otherwise-200 response is exactly the hang
  // the timeout exists to bound — but the non-ok and JSON-parse throws are
  // raised *outside* withRequestTimeout's callback (via this result), so
  // neither is reclassified as a generic network failure.
  const result = await withRequestTimeout<
    { ok: true; body: string } | { ok: false; status: number }
  >(
    {
      timeoutMs: IRM_REQUEST_TIMEOUT_MS,
      signal,
      requestLabel: "IRM curve request",
      url: endpoint,
      includeUrlInTimeoutMessage: true,
    },
    async (composedSignal) => {
      const response = await fetch(endpoint, { signal: composedSignal });
      if (!response.ok) {
        return { ok: false, status: response.status };
      }
      return { ok: true, body: await response.text() };
    },
  );

  if (!result.ok) {
    throw new Error(
      `IRM curve request to ${endpoint} failed with status ${result.status}`,
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(result.body);
  } catch {
    throw new Error(`IRM curve response from ${endpoint} is not valid JSON`);
  }

  return parseIrmPayload(payload, endpoint);
}
