import { ErrorCode } from "./types";

export interface ErrorMessageConfig {
  message: string;
  action?: string;
}

export const ERROR_MESSAGES: Record<ErrorCode, ErrorMessageConfig> = {
  [ErrorCode.API_ERROR]: {
    message: "An error occurred while communicating with the server.",
    action: "Please try again in a few moments. If the problem persists, contact support.",
  },
  [ErrorCode.API_TIMEOUT]: {
    message: "The request took too long to complete.",
    action: "Please check your internet connection and try again.",
  },
  [ErrorCode.API_UNAUTHORIZED]: {
    message: "Your session has expired or you don't have permission to access this resource.",
    action: "Please refresh the page or log in again.",
  },
  [ErrorCode.API_NOT_FOUND]: {
    message: "The requested resource could not be found.",
    action: "Please verify the information and try again.",
  },
  [ErrorCode.API_SERVER_ERROR]: {
    message: "The server encountered an error while processing your request.",
    action: "Please try again later. If the problem persists, contact support.",
  },
  [ErrorCode.API_CLIENT_ERROR]: {
    message: "There was an issue with your request.",
    action: "Please check your input and try again.",
  },

  [ErrorCode.CONTRACT_ERROR]: {
    message: "An error occurred while interacting with the smart contract.",
    action: "Please try again. If the problem persists, check the transaction status on the blockchain explorer.",
  },
  [ErrorCode.CONTRACT_REVERT]: {
    message: "The transaction was rejected by the smart contract.",
    action: "This usually means the transaction conditions were not met. Please review the transaction details and try again.",
  },
  [ErrorCode.CONTRACT_EXECUTION_FAILED]: {
    message: "The contract execution failed.",
    action: "Please check the transaction parameters and ensure all conditions are met before trying again.",
  },
  [ErrorCode.CONTRACT_INSUFFICIENT_GAS]: {
    message: "Insufficient gas to complete the transaction.",
    action: "Please ensure you have enough ETH in your wallet for gas fees.",
  },
  [ErrorCode.CONTRACT_NONCE_ERROR]: {
    message: "There was a nonce error with the transaction.",
    action: "Please try again. The wallet will automatically adjust the nonce.",
  },

  [ErrorCode.NETWORK_ERROR]: {
    message: "A network error occurred while processing your request.",
    action: "Please check your internet connection and try again.",
  },
  [ErrorCode.NETWORK_TIMEOUT]: {
    message: "The network request timed out.",
    action: "Please check your internet connection and try again.",
  },
  [ErrorCode.NETWORK_CONNECTION_FAILED]: {
    message: "Failed to connect to the network.",
    action: "Please check your internet connection and ensure you're connected to the correct network.",
  },
  [ErrorCode.NETWORK_OFFLINE]: {
    message: "You appear to be offline.",
    action: "Please check your internet connection and try again.",
  },

  [ErrorCode.WALLET_ERROR]: {
    message: "An error occurred with your wallet.",
    action: "Please check your wallet connection and try again.",
  },
  [ErrorCode.WALLET_NOT_CONNECTED]: {
    message: "Your wallet is not connected.",
    action: "Please connect your wallet and try again.",
  },
  [ErrorCode.WALLET_REJECTED]: {
    message: "The transaction was rejected in your wallet.",
    action: "Please approve the transaction in your wallet to continue.",
  },
  [ErrorCode.WALLET_INSUFFICIENT_BALANCE]: {
    message: "You don't have enough balance to complete this transaction.",
    action: "Please ensure you have sufficient balance and try again.",
  },
  [ErrorCode.WALLET_TRANSACTION_FAILED]: {
    message: "The transaction failed in your wallet.",
    action: "Please check your wallet settings and try again.",
  },
  [ErrorCode.WALLET_NETWORK_MISMATCH]: {
    message: "Your wallet is connected to a different network than required.",
    action: "Please switch your wallet to the correct network and try again.",
  },

  [ErrorCode.VALIDATION_ERROR]: {
    message: "The provided information is invalid.",
    action: "Please check your input and try again.",
  },
  [ErrorCode.VALIDATION_INVALID_INPUT]: {
    message: "One or more input values are invalid.",
    action: "Please review your input and ensure all values are correct.",
  },
  [ErrorCode.VALIDATION_MISSING_REQUIRED_FIELD]: {
    message: "Required information is missing.",
    action: "Please fill in all required fields and try again.",
  },
  [ErrorCode.VALIDATION_INVALID_FORMAT]: {
    message: "The input format is incorrect.",
    action: "Please check the format of your input and try again.",
  },
  [ErrorCode.VALIDATION_OUT_OF_RANGE]: {
    message: "The value is outside the acceptable range.",
    action: "Please enter a value within the allowed range.",
  },
};

export function getUserFriendlyMessage(
  code: ErrorCode,
  customMessage?: string,
): string {
  const config = ERROR_MESSAGES[code];
  if (!config) {
    return customMessage || "An unexpected error occurred.";
  }

  if (customMessage) {
    return `${config.message} ${customMessage}`;
  }

  return config.message;
}

export function getUserFriendlyAction(code: ErrorCode): string | undefined {
  return ERROR_MESSAGES[code]?.action;
}

export function getFullErrorMessage(
  code: ErrorCode,
  customMessage?: string,
): string {
  const message = getUserFriendlyMessage(code, customMessage);
  const action = getUserFriendlyAction(code);

  if (action) {
    return `${message} ${action}`;
  }

  return message;
}

