import {
  Button,
  DialogBody,
  DialogFooter,
  Heading,
  ResponsiveDialog,
  Text,
} from "@babylonlabs-io/core-ui";
import { useEffect, useState } from "react";

import { useError } from "@/context/error";
import { ErrorCode } from "@/utils/errors/types";

const CopyIcon = () => (
  <svg
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const CheckIcon = () => (
  <svg
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

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
  const [copied, setCopied] = useState(false);

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

  const copyErrorDetails = () => {
    const details = [
      `Error: ${error.message}`,
      error.code ? `Code: ${error.code}` : null,
      error.trace ? `Trace: ${error.trace}` : null,
      error.context
        ? `Context: ${JSON.stringify(error.context, null, 2)}`
        : null,
    ]
      .filter(Boolean)
      .join("\n\n");

    navigator.clipboard.writeText(details);
    setCopied(true);
  };

  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => setCopied(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [copied]);

  return (
    <ResponsiveDialog
      className="z-[150]"
      backdropClassName="z-[100]"
      open={isOpen}
      onClose={dismissError}
      data-testid="error-dialog"
    >
      <DialogBody className="px-4 py-16 text-center text-accent-primary sm:px-6">
        <div className="mb-6 inline-flex h-20 w-20 items-center justify-center bg-primary-contrast">
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

        <div className="flex flex-col gap-3">
          <Text
            variant="body1"
            className="text-center text-sm text-accent-secondary sm:text-base"
          >
            {error.message}
          </Text>

          <div className="mt-2 flex items-center justify-center gap-4">
            <button
              className="flex items-center gap-1 text-sm text-accent-secondary hover:opacity-70"
              onClick={copyErrorDetails}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
              <span>{copied ? "Copied!" : "Copy error details"}</span>
            </button>
          </div>
        </div>
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
