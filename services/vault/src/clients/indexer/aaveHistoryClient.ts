import { ENV } from "../../config/env";
import { withRequestTimeout } from "../../utils/async";

/** Timeout for the borrow-rate history request — prevents indefinite hangs from a stalled indexer. */
const HISTORY_REQUEST_TIMEOUT_MS = 30_000;

/** The server picks the bucket size per range (vs a fixed resolution). */
const HISTORY_RESOLUTION = "auto";

const MS_PER_SECOND = 1_000;

export type HistoryRange = "1d" | "1w" | "1m" | "6m" | "1y" | "all";

export interface BorrowRateHistoryPoint {
  /** Sample time, unix ms (the endpoint's `t` is unix seconds). */
  timeMs: number;
  /** Borrow APR percent at that time. */
  ratePercent: number;
}

/**
 * REST root of the vault indexer. The history API is served by the same Hono app
 * as GraphQL (`/api` vs `/` + `/graphql`), so the base derives from the GraphQL
 * endpoint rather than adding a second env var that could point elsewhere.
 */
export function indexerRestBaseUrl(): string {
  return ENV.GRAPHQL_ENDPOINT.replace(/\/graphql\/?$/, "");
}

function assertFiniteNumber(
  value: unknown,
  field: string,
  index: number,
  endpoint: string,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(
      `Borrow rate history point ${index} from ${endpoint} has a non-finite "${field}": ${JSON.stringify(value)}`,
    );
  }
  return value;
}

/**
 * Validate the external payload before use — this is a required financial
 * series, so a malformed shape must throw (never a silent empty chart). An
 * empty `points` array is the one valid-empty case (a young reserve).
 */
function parseHistoryPayload(
  payload: unknown,
  endpoint: string,
): BorrowRateHistoryPoint[] {
  if (payload === null || typeof payload !== "object") {
    throw new Error(
      `Borrow rate history response from ${endpoint} is not an object`,
    );
  }

  const { points } = payload as { points?: unknown };
  if (!Array.isArray(points)) {
    throw new Error(
      `Borrow rate history response from ${endpoint} is missing a "points" array`,
    );
  }

  return points.map((point, index) => {
    if (point === null || typeof point !== "object") {
      throw new Error(
        `Borrow rate history point ${index} from ${endpoint} is not an object`,
      );
    }
    const { t, borrowRatePercent } = point as {
      t?: unknown;
      borrowRatePercent?: unknown;
    };
    const seconds = assertFiniteNumber(t, "t", index, endpoint);
    const ratePercent = assertFiniteNumber(
      borrowRatePercent,
      "borrowRatePercent",
      index,
      endpoint,
    );
    return { timeMs: seconds * MS_PER_SECOND, ratePercent };
  });
}

export async function fetchBorrowRateHistory({
  reserveId,
  range,
  signal,
}: {
  reserveId: bigint;
  range: HistoryRange;
  signal?: AbortSignal;
}): Promise<BorrowRateHistoryPoint[]> {
  const endpoint = `${indexerRestBaseUrl()}/api/aave/reserves/${reserveId.toString()}/history?range=${range}&resolution=${HISTORY_RESOLUTION}`;

  // The status check and body read both need to happen inside the timeout
  // window — a stalled body on an otherwise-200 response is exactly the hang
  // the timeout exists to bound — but the non-ok and JSON-parse throws are
  // raised *outside* withRequestTimeout's callback (via this result), so
  // neither is reclassified as a generic network failure.
  const result = await withRequestTimeout<
    { ok: true; body: string } | { ok: false; status: number }
  >(
    {
      timeoutMs: HISTORY_REQUEST_TIMEOUT_MS,
      signal,
      requestLabel: "Borrow rate history request",
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
      `Borrow rate history request to ${endpoint} failed with status ${result.status}`,
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(result.body);
  } catch {
    throw new Error(
      `Borrow rate history response from ${endpoint} is not valid JSON`,
    );
  }

  return parseHistoryPayload(payload, endpoint);
}
