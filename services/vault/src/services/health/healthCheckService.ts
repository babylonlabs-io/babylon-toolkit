import { ENV } from "@/config/env";
import type { AppError } from "@/context/error";
import { logger } from "@/infrastructure";
import { ApiError, isError451 } from "@/utils/errors/types";

export interface HealthCheckResult {
  healthy: boolean;
  isGeoBlocked?: boolean;
  error?: AppError;
}

function getHealthCheckUrl(): string {
  const url = new URL(ENV.GRAPHQL_ENDPOINT);
  return `${url.origin}/health`;
}

/**
 * Fetches the health endpoint to check for geo-blocking (451 status).
 * Only the HTTP status code matters - response body is not used.
 */
export async function fetchHealthCheck(): Promise<void> {
  const url = getHealthCheckUrl();

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new ApiError("Health check failed", response.status);
    }
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof TypeError) {
      throw new ApiError("Network error occurred", 0);
    }

    throw new ApiError(
      error instanceof Error ? error.message : "Health check failed",
      0,
    );
  }
}

export async function checkGeofencing(): Promise<HealthCheckResult> {
  try {
    await fetchHealthCheck();
    return { healthy: true, isGeoBlocked: false };
  } catch (error) {
    if (error instanceof ApiError && isError451(error)) {
      return { healthy: false, isGeoBlocked: true };
    }

    // Non-451 errors don't block the user - GraphQL check handles general availability
    logger.warn("Healthcheck endpoint error", { data: { error } });
    return { healthy: true, isGeoBlocked: false };
  }
}

export async function checkGraphQLEndpoint(): Promise<HealthCheckResult> {
  try {
    const response = await fetch(ENV.GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "{ __typename }" }),
    });

    if (!response.ok) {
      return {
        healthy: false,
        error: {
          title: "Service Unavailable",
          message:
            "Unable to connect to the backend services. Please check your internet connection and try again later.",
        },
      };
    }

    return { healthy: true };
  } catch {
    return {
      healthy: false,
      error: {
        title: "Service Unavailable",
        message:
          "Unable to connect to the backend services. Please check your internet connection and try again later.",
      },
    };
  }
}

export async function runHealthChecks(): Promise<HealthCheckResult> {
  const geoResult = await checkGeofencing();
  if (geoResult.isGeoBlocked) {
    return geoResult;
  }

  const graphqlResult = await checkGraphQLEndpoint();
  if (!graphqlResult.healthy) {
    return graphqlResult;
  }

  return { healthy: true, isGeoBlocked: false };
}

export function createWagmiInitError(): AppError {
  return {
    title: "Wallet Configuration Error",
    message:
      "Failed to initialize wallet connections. Please refresh the page or contact support if the issue persists.",
  };
}

export function createEnvConfigError(details: string): AppError {
  return {
    title: "Configuration Error",
    message: `The application is missing required configuration. Please contact support. (${details})`,
  };
}
