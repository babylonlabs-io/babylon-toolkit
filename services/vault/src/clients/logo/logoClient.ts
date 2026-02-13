import { ENV } from "../../config/env";

export interface LogoResponse {
  [identity: string]: string;
}

export async function fetchLogos(identities: string[]): Promise<LogoResponse> {
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
