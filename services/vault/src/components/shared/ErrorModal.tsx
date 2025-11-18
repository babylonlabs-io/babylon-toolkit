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
  [ErrorCode.API_ERROR]: "API Error",
  [ErrorCode.API_TIMEOUT]: "Request Timeout",
  [ErrorCode.API_UNAUTHORIZED]: "Unauthorized",
  [ErrorCode.API_NOT_FOUND]: "Not Found",
  [ErrorCode.API_SERVER_ERROR]: "Server Error",
  [ErrorCode.API_CLIENT_ERROR]: "Request Error",

  [ErrorCode.CONTRACT_ERROR]: "Contract Error",
  [ErrorCode.CONTRACT_REVERT]: "Transaction Reverted",
  [ErrorCode.CONTRACT_EXECUTION_FAILED]: "Execution Failed",
  [ErrorCode.CONTRACT_INSUFFICIENT_GAS]: "Insufficient Gas",
  [ErrorCode.CONTRACT_NONCE_ERROR]: "Nonce Error",

  [ErrorCode.NETWORK_ERROR]: "Network Error",
  [ErrorCode.NETWORK_TIMEOUT]: "Network Timeout",
  [ErrorCode.NETWORK_CONNECTION_FAILED]: "Connection Failed",
  [ErrorCode.NETWORK_OFFLINE]: "Offline",

  [ErrorCode.WALLET_ERROR]: "Wallet Error",
  [ErrorCode.WALLET_NOT_CONNECTED]: "Wallet Not Connected",
  [ErrorCode.WALLET_REJECTED]: "Transaction Rejected",
  [ErrorCode.WALLET_INSUFFICIENT_BALANCE]: "Insufficient Balance",
  [ErrorCode.WALLET_TRANSACTION_FAILED]: "Transaction Failed",
  [ErrorCode.WALLET_NETWORK_MISMATCH]: "Network Mismatch",

  [ErrorCode.VALIDATION_ERROR]: "Validation Error",
  [ErrorCode.VALIDATION_INVALID_INPUT]: "Invalid Input",
  [ErrorCode.VALIDATION_MISSING_REQUIRED_FIELD]: "Missing Required Field",
  [ErrorCode.VALIDATION_INVALID_FORMAT]: "Invalid Format",
  [ErrorCode.VALIDATION_OUT_OF_RANGE]: "Out of Range",
};

export function ErrorModal() {
  const { error, modalOptions, dismissError, isOpen } = useError();
  const { retryAction, noCancel } = modalOptions;

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

  return (
    <ResponsiveDialog
      className="z-[150]"
      backdropClassName="z-[100]"
      open={isOpen}
      onClose={dismissError}
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
      </DialogBody>

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
    </ResponsiveDialog>
  );
}
