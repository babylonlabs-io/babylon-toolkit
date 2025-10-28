import {
  Button,
  DialogBody,
  DialogFooter,
  Heading,
  ResponsiveDialog,
  Text,
} from "@babylonlabs-io/core-ui";
import { useEffect, useState } from "react";
import { FiCheck, FiCopy } from "react-icons/fi";

import { useError } from "../../context/Error/ErrorProvider";
import { ErrorType } from "../../context/Error/errors/types";

export const ErrorModal: React.FC = () => {
  const { error, modalOptions, dismissError, isOpen } = useError();
  const { retryAction, noCancel } = modalOptions;
  const [copied, setCopied] = useState(false);

  const handleRetry = () => {
    dismissError();
    setTimeout(() => {
      if (retryAction) {
        retryAction();
      }
    }, 300);
  };

  const ERROR_TITLES = {
    [ErrorType.SERVER]: "Server Error",
    [ErrorType.VAULT_DEPOSIT]: "Deposit Error",
    [ErrorType.VAULT_REDEEM]: "Redeem Error",
    [ErrorType.VAULT_BORROW]: "Borrow Error",
    [ErrorType.VAULT_REPAY]: "Repay Error",
    [ErrorType.WALLET]: "Wallet Error",
    [ErrorType.UNKNOWN]: "System Error",
  };

  const ERROR_MESSAGES = {
    [ErrorType.SERVER]: "Error fetching data due to:",
    [ErrorType.VAULT_DEPOSIT]: "Failed to deposit due to:",
    [ErrorType.VAULT_REDEEM]: "Failed to redeem due to:",
    [ErrorType.VAULT_BORROW]: "Failed to borrow due to:",
    [ErrorType.VAULT_REPAY]: "Failed to repay due to:",
    [ErrorType.WALLET]: "Failed to perform wallet action due to:",
    [ErrorType.UNKNOWN]: "A system error occurred:",
  };

  const getErrorTitle = () => {
    return ERROR_TITLES[error.type ?? ErrorType.UNKNOWN];
  };

  const getErrorMessage = () => {
    const prefix = ERROR_MESSAGES[error.type ?? ErrorType.UNKNOWN];
    return `${prefix} ${error.displayMessage || error.message}`;
  };

  const copyErrorDetails = () => {
    const errorDetails = JSON.stringify(
      {
        date: new Date().toISOString(),
        device: navigator.userAgent,
        environment: import.meta.env.MODE,
        ...error,
      },
      null,
      2,
    );

    navigator.clipboard.writeText(errorDetails);
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
      <DialogBody className="py-16 text-center text-accent-primary">
        <div className="bg-error/10 mb-6 inline-flex h-20 w-20 items-center justify-center rounded-full">
          <Text className="text-4xl">⚠️</Text>
        </div>

        <Heading variant="h4" className="mb-4 text-accent-primary">
          {getErrorTitle()}
        </Heading>

        <div className="flex flex-col gap-3">
          <Text variant="body1" className="text-center text-accent-secondary">
            {getErrorMessage()}
          </Text>

          <div className="mt-2 flex items-center justify-center gap-4">
            <button
              className="flex items-center gap-1 text-sm text-accent-secondary hover:opacity-70"
              onClick={copyErrorDetails}
            >
              {copied ? (
                <FiCheck className="h-4 w-4" />
              ) : (
                <FiCopy className="h-4 w-4" />
              )}
              <span>{copied ? "Copied!" : "Copy error details"}</span>
            </button>
          </div>
        </div>
      </DialogBody>

      <DialogFooter className="flex gap-4">
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
      </DialogFooter>
    </ResponsiveDialog>
  );
};
