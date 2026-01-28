import { ENV } from "@/config/env";

import { ApiError } from "./types";

export interface HealthCheckResponse {
  data: string;
}

function getHealthCheckUrl(): string {
  const url = new URL(ENV.GRAPHQL_ENDPOINT);
  return `${url.origin}/health`;
}

export const fetchHealthCheck = async (): Promise<HealthCheckResponse> => {
  const url = getHealthCheckUrl();

  try {
    const response = await fetch(url);

    if (!response.ok) {
      const responseText = await response
        .text()
        .catch(() => "Health check failed");

      throw new ApiError("Health check failed", response.status, responseText);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof TypeError) {
      throw new ApiError(
        "Network error occurred",
        0,
        error.message || "Health check failed",
      );
    }

    throw new ApiError(
      error instanceof Error ? error.message : "Health check failed",
      0,
      undefined,
    );
  }
};
