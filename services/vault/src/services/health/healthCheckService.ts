import { ENV } from "@/config/env";
import type { AppError } from "@/context/error";

export interface HealthCheckResult {
  healthy: boolean;
  error?: AppError;
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
  const graphqlResult = await checkGraphQLEndpoint();
  if (!graphqlResult.healthy) {
    return graphqlResult;
  }

  return { healthy: true };
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
