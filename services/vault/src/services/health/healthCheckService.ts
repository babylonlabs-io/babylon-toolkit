import type { Address } from "viem";

import { ethClient } from "@/clients/eth-contract/client";
import { ENV } from "@/config/env";
import type { AppError } from "@/context/error";

import MorphoIntegrationControllerABI from "../../applications/morpho/clients/morpho-controller/abis/MorphoIntegrationController.abi.json";

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

export async function checkApplicationPaused(
  morphoControllerAddress: Address,
): Promise<HealthCheckResult> {
  try {
    const publicClient = ethClient.getPublicClient();

    const isPaused = await publicClient.readContract({
      address: morphoControllerAddress,
      abi: MorphoIntegrationControllerABI,
      functionName: "paused",
      args: [],
    });

    if (isPaused) {
      return {
        healthy: false,
        error: {
          title: "Application Paused",
          message:
            "This application is currently paused for maintenance. Your existing vaults are safe. Please check back later.",
        },
      };
    }

    return { healthy: true };
  } catch {
    return { healthy: true };
  }
}

export async function runHealthChecks(
  morphoControllerAddress?: Address,
): Promise<HealthCheckResult> {
  const graphqlResult = await checkGraphQLEndpoint();
  if (!graphqlResult.healthy) {
    return graphqlResult;
  }

  if (morphoControllerAddress) {
    const pausedResult = await checkApplicationPaused(morphoControllerAddress);
    if (!pausedResult.healthy) {
      return pausedResult;
    }
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
