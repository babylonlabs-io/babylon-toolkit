import {
  Button,
  DialogBody,
  DialogFooter,
  Heading,
  ResponsiveDialog,
  Text,
} from "@babylonlabs-io/core-ui";

import { useError } from "@/context/error";
import { ErrorCode } from "@/utils/errors/types";

const ERROR_TITLES: Record<ErrorCode, string> = {
  [ErrorCode.API_ERROR]: "API error",
  [ErrorCode.API_TIMEOUT]: "Request timeout",
  [ErrorCode.API_UNAUTHORIZED]: "Unauthorized",
  [ErrorCode.API_NOT_FOUND]: "Not found",
  [ErrorCode.API_SERVER_ERROR]: "Server error",
  [ErrorCode.API_CLIENT_ERROR]: "Request error",

  [ErrorCode.CONTRACT_ERROR]: "Contract error",
  [ErrorCode.CONTRACT_REVERT]: "Transaction reverted",
  [ErrorCode.CONTRACT_EXECUTION_FAILED]: "Execution failed",
  [ErrorCode.CONTRACT_INSUFFICIENT_GAS]: "Insufficient gas",
  [ErrorCode.CONTRACT_NONCE_ERROR]: "Nonce error",

  [ErrorCode.NETWORK_ERROR]: "Network error",
  [ErrorCode.NETWORK_TIMEOUT]: "Network timeout",
  [ErrorCode.NETWORK_CONNECTION_FAILED]: "Connection failed",
  [ErrorCode.NETWORK_OFFLINE]: "Offline",

  [ErrorCode.WALLET_ERROR]: "Wallet error",
  [ErrorCode.WALLET_NOT_CONNECTED]: "Wallet not connected",
  [ErrorCode.WALLET_REJECTED]: "Transaction rejected",
  [ErrorCode.WALLET_INSUFFICIENT_BALANCE]: "Insufficient balance",
  [ErrorCode.WALLET_TRANSACTION_FAILED]: "Transaction failed",
  [ErrorCode.WALLET_NETWORK_MISMATCH]: "Network mismatch",

  [ErrorCode.VALIDATION_ERROR]: "Validation error",
  [ErrorCode.VALIDATION_INVALID_INPUT]: "Invalid input",
  [ErrorCode.VALIDATION_MISSING_REQUIRED_FIELD]: "Missing required field",
  [ErrorCode.VALIDATION_INVALID_FORMAT]: "Invalid format",
  [ErrorCode.VALIDATION_OUT_OF_RANGE]: "Out of range",
};

export function ErrorModal() {
  const { error, modalOptions, dismissError, isOpen } = useError();
  const { retryAction, noCancel, blocking } = modalOptions;

  const getErrorTitle = () => {
    if (error.title) {
      return error.title;
    }
    if (error.code) {
      return ERROR_TITLES[error.code] || "Error";
    }
    return "Error";
  };

  const handleRetry = () => {
    dismissError();

    setTimeout(() => {
      if (retryAction) {
        retryAction();
      }
    }, 300);
  };

  const handleClose = blocking ? undefined : dismissError;

  return (
    <ResponsiveDialog
      className="z-[150]"
      backdropClassName="z-[100]"
      open={isOpen}
      onClose={handleClose}
      data-testid="error-dialog"
    >
      <DialogBody className="px-4 py-16 text-center text-accent-primary sm:px-6">
        <div className="mb-6 inline-flex h-20 w-20 items-center justify-center">
          <img
            src="/images/status/warning.svg"
            alt="Warning"
            width={48}
            height={42}
          />
        </div>

        <Heading
          variant="h4"
          className="mb-4 text-xl text-accent-primary sm:text-2xl"
        >
          {getErrorTitle()}
        </Heading>

        <Text
          variant="body1"
          className="text-center text-sm text-accent-secondary sm:text-base"
        >
          {error.message}
        </Text>

        {blocking && (
          <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
            <Text
              variant="body2"
              className="text-sm text-amber-700 dark:text-amber-300"
            >
              Please refresh the page or try again later.
            </Text>
          </div>
        )}
      </DialogBody>

      {!blocking && (
        <DialogFooter className="flex gap-4 px-4 pb-8 sm:px-6">
          {!noCancel && (
            <Button
              variant="outlined"
              fluid
              className="px-2"
              onClick={dismissError}
            >
              Cancel
            </Button>
          )}
          {retryAction && (
            <Button className="px-2" fluid onClick={handleRetry}>
              Try Again
            </Button>
          )}
          {!retryAction && noCancel && (
            <Button className="w-full px-2" onClick={dismissError}>
              Done
            </Button>
          )}
        </DialogFooter>
      )}
    </ResponsiveDialog>
  );
}
