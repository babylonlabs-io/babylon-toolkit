import { ENV } from "@/config/env";

interface AddressScreeningResponse {
  data: {
    address?: {
      risk: string;
    };
  };
}

const ALLOWED_RISK_LEVELS = ["low", "medium"];
const FETCH_TIMEOUT_MS = 10_000;

export class AddressScreeningNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AddressScreeningNetworkError";
  }
}

/**
 * Screens a BTC or ETH address against the tbv utils-api (Chainalysis proxy).
 *
 * Returns `true` if the address is allowed (risk level "low" or "medium"),
 * `false` if the API returns a "high" or missing risk assessment.
 *
 * Throws `AddressScreeningNetworkError` on network / non-OK HTTP responses —
 * the caller decides whether to hard-block or soft-allow on failure.
 */
export async function verifyAddress(address: string): Promise<boolean> {
  if (!ENV.UTILS_API_URL) {
    // Screening not configured — allow by default.
    return true;
  }

  const url = `${ENV.UTILS_API_URL}/address/screening?address=${encodeURIComponent(address)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown network error";
    throw new AddressScreeningNetworkError(
      `Address screening request failed: ${message}`,
    );
  }

  if (!response.ok) {
    throw new AddressScreeningNetworkError(
      `Address screening returned ${response.status}`,
    );
  }

  const body = (await response.json()) as AddressScreeningResponse;
  const risk = body.data?.address?.risk;
  return risk ? ALLOWED_RISK_LEVELS.includes(risk.toLowerCase()) : false;
}
