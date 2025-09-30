import { ClientError, ERROR_CODES } from "@/ui/common/errors";

import { isError451 } from "../api/error";
import {
  GEO_BLOCK_MESSAGE,
  HealthCheckResult,
  HealthCheckStatus,
} from "../types/services/healthCheck";

export const getHealthCheck = async (): Promise<HealthCheckResult> => {
  try {
    return {
      status: HealthCheckStatus.Normal,
      message: "API is normal",
    };
  } catch (error: any) {
    if (isError451(error.cause)) {
      throw new ClientError(ERROR_CODES.GEO_BLOCK, GEO_BLOCK_MESSAGE, {
        cause: error.cause,
      });
    }
    throw error;
  }
};
