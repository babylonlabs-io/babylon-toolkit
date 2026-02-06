import { ENV } from "@/config";

interface LogoResponse {
  [identity: string]: string;
}

/**
 * Fetches provider logos from the sidecar API.
 *
 * @param identities - Array of provider identities (BTC public keys)
 * @returns A map of identity to logo URL. Identities without logos are not included.
 *
 * @example
 * const logos = await fetchProviderLogos(["048733E2C6061B87", "abc123..."]);
 * // Returns: { "048733E2C6061B87": "https://s3-url/logo.png" }
 */
export async function fetchProviderLogos(
  identities: string[],
): Promise<LogoResponse> {
  if (!ENV.SIDECAR_API_URL || identities.length === 0) {
    return {};
  }

  try {
    const response = await fetch(`${ENV.SIDECAR_API_URL}/logo`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ identities }),
    });

    if (!response.ok) {
      return {};
    }

    const data: LogoResponse = await response.json();
    return data;
  } catch {
    return {};
  }
}
