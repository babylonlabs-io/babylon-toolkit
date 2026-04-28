import { ENV } from "../../config/env";

export interface LogoResponse {
  [identity: string]: string;
}

interface SidecarLogoEnvelope {
  data?: {
    images?: LogoResponse;
  };
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

    const body: SidecarLogoEnvelope = await response.json();
    return body.data?.images ?? {};
  } catch {
    return {};
  }
}
