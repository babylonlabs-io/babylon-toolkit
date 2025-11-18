import type { ErrorHandlerParam } from "@/context/error";

export function createErrorHandler(
  handleError: (param: ErrorHandlerParam) => void,
) {
  return {
    withErrorHandling: async <T>(
      operation: () => Promise<T>,
      options?: {
        showModal?: boolean;
        retryAction?: () => void;
        noCancel?: boolean;
        metadata?: Record<string, unknown>;
      },
    ): Promise<T | null> => {
      try {
        return await operation();
      } catch (error) {
        handleError({
          error: error as Error,
          displayOptions: {
            showModal: options?.showModal ?? true,
            retryAction: options?.retryAction,
            noCancel: options?.noCancel,
          },
          metadata: options?.metadata,
        });
        return null;
      }
    },

    catchAndDisplay: (
      error: Error,
      options?: {
        showModal?: boolean;
        retryAction?: () => void;
        noCancel?: boolean;
        metadata?: Record<string, unknown>;
      },
    ) => {
      handleError({
        error,
        displayOptions: {
          showModal: options?.showModal ?? true,
          retryAction: options?.retryAction,
          noCancel: options?.noCancel,
        },
        metadata: options?.metadata,
      });
    },
  };
}
