/**
 * Helpers for the page routes that watch or answer the app's own JSON-RPC calls (aaveWriteRpc.ts,
 * positionCapacityRpc.ts). A route sees only what the page sends: MetaMask reads and broadcasts through
 * its own node from its extension's service worker, so its traffic never reaches a page route.
 */
import type { APIResponse, Request, Route } from "@playwright/test";

import { isRecord } from "./writeRpcAnswers";

/** Response headers that describe the RPC's original body bytes, not a re-encoded one. */
const REENCODED_BODY_HEADERS = new Set([
  "content-length",
  "content-encoding",
  "transfer-encoding",
]);

/** The single JSON-RPC call a request carries, or null for anything else (a batch, a GET, bad JSON). */
export function parseJsonRpcCall(
  request: Request,
): { method: string; params: readonly unknown[] } | null {
  if (request.method() !== "POST") return null;
  let body: unknown;
  try {
    body = request.postDataJSON();
  } catch {
    return null;
  }
  if (!isRecord(body) || typeof body.method !== "string") return null;
  return {
    method: body.method,
    params: Array.isArray(body.params) ? body.params : [],
  };
}

/** Answer `route` with the RPC's own `response`, its JSON-RPC `result` replaced by `result`. */
export function fulfillWithResult(
  route: Route,
  response: APIResponse,
  body: Record<string, unknown>,
  result: unknown,
): Promise<void> {
  // The body is re-encoded, so the original length and encoding no longer describe it.
  const headers = Object.fromEntries(
    Object.entries(response.headers()).filter(
      ([name]) => !REENCODED_BODY_HEADERS.has(name.toLowerCase()),
    ),
  );
  return route.fulfill({
    status: response.status(),
    headers,
    json: { ...body, result },
  });
}
