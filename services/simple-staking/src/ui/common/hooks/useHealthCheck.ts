import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useLocation } from "react-router";

import { ClientError, ERROR_CODES } from "@/ui/common/errors";
import { useLogger } from "@/ui/common/hooks/useLogger";
import { getHealthCheck } from "@/ui/common/services/healthCheckService";
import { HealthCheckStatus } from "@/ui/common/types/services/healthCheck";

import { useError } from "../context/Error/ErrorProvider";

export const HEALTH_CHECK_KEY = "HEALTH_CHECK";

export const useHealthCheck = () => {
  const { handleError } = useError();
  const logger = useLogger();
  const location = useLocation();
  const isVaultRoute = location.pathname.startsWith("/vault");

  const { data, error, isError, isLoading, refetch } = useQuery({
    queryKey: [HEALTH_CHECK_KEY],
    queryFn: getHealthCheck,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    enabled: !isVaultRoute, // Skip health check for vault routes
    retry: (_, error) => {
      // Prevent retries for geoblocked errors
      return (error as ClientError).errorCode !== ERROR_CODES.GEO_BLOCK;
    },
  });

  // For vault routes, always consider API as normal since we don't need staking API
  // TODO this should be extracted on production to do a vault specific health check
  const isApiNormal = isVaultRoute
    ? true
    : data?.status === HealthCheckStatus.Normal;
  const isGeoBlocked = error
    ? (error as ClientError).errorCode === ERROR_CODES.GEO_BLOCK
    : false;
  const apiMessage = data?.message;

  useEffect(() => {
    if (isError && !isVaultRoute) {
      if (isGeoBlocked) {
        return;
      }

      logger.error(error);

      handleError({
        error,
        displayOptions: {
          retryAction: refetch,
        },
      });
    }
  }, [
    isError,
    error,
    refetch,
    handleError,
    logger,
    isGeoBlocked,
    isVaultRoute,
  ]);

  return {
    isApiNormal,
    isGeoBlocked,
    apiMessage,
    isError,
    error,
    isLoading,
    refetch,
  };
};
