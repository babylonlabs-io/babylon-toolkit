/**
 * Error message formatting utilities
 * Transform errors to user-friendly messages
 */

import { JsonRpcError } from "../rpc";

/**
 * Transform error to user-friendly message
 * @param error - Raw error
 * @returns User-friendly error message
 */
export function formatErrorMessage(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    if (error.message.includes("insufficient")) {
      return "Insufficient balance for this transaction";
    }
    if (error.message.includes("rejected")) {
      return "Transaction was rejected";
    }
    if (error.message.includes("timeout")) {
      return "Request timed out. Please try again";
    }

    return error.message;
  }

  return "An unexpected error occurred";
}

/**
 * Format payout signature errors with user-friendly messages
 */
export function formatPayoutSignatureError(error: unknown): {
  title: string;
  message: string;
} {
  if (error instanceof JsonRpcError) {
    if (error.code === -32000) {
      return {
        title: "Request Timeout",
        message:
          "The vault provider took too long to respond. Please try again.",
      };
    }
    if (error.code === -32001) {
      return {
        title: "Connection Failed",
        message:
          "Unable to connect to the vault provider. Please check your connection and try again.",
      };
    }
    return {
      title: "Signature Submission Failed",
      message: `The vault provider rejected the request: ${error.message}`,
    };
  }

  if (error instanceof Error) {
    if (error.message.includes("Vault provider not found")) {
      return {
        title: "Provider Not Found",
        message:
          "The vault provider for this deposit could not be found. Please contact support.",
      };
    }
    if (error.message.includes("BTC wallet not connected")) {
      return {
        title: "Wallet Not Connected",
        message: "Please reconnect your Bitcoin wallet to continue.",
      };
    }
    if (error.message.includes("Vault or pegin transaction not found")) {
      return {
        title: "Deposit Not Found",
        message:
          "The deposit transaction could not be found. It may have been processed already.",
      };
    }
    if (error.message.includes("Failed to sign payout transaction")) {
      return {
        title: "Signing Failed",
        message:
          "Failed to sign the payout transaction. Please try again or reconnect your wallet.",
      };
    }
    return {
      title: "Payout Signing Error",
      message: error.message,
    };
  }

  return {
    title: "Unexpected Error",
    message: "An unexpected error occurred while signing payouts.",
  };
}

/**
 * Format borrow/lending errors with user-friendly messages
 */
export function formatLendingError(error: unknown): {
  title: string;
  message: string;
} {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();

    if (msg.includes("insufficient balance to fully repay")) {
      return {
        title: "Insufficient Balance",
        message:
          "Not enough stablecoin to cover the debt plus interest. Please add more funds to your wallet.",
      };
    }
    if (msg.includes("insufficient liquidity") || msg.includes("not enough")) {
      return {
        title: "Insufficient Liquidity",
        message:
          "There is not enough liquidity in the market to complete this borrow. Please try a smaller amount or wait for more liquidity.",
      };
    }
    if (msg.includes("paused")) {
      return {
        title: "Market Paused",
        message:
          "This market is temporarily paused. Please try again later or contact support.",
      };
    }
    if (msg.includes("frozen") || msg.includes("inactive")) {
      return {
        title: "Market Unavailable",
        message:
          "This market is currently unavailable. Please try again later.",
      };
    }
    if (msg.includes("cap") || msg.includes("limit reached")) {
      return {
        title: "Protocol Cap Reached",
        message:
          "The protocol cap for this market has been reached. Please try a smaller amount or wait for capacity.",
      };
    }
    return {
      title: "Transaction Failed",
      message: error.message,
    };
  }

  return {
    title: "Unexpected Error",
    message: "An unexpected error occurred during the transaction.",
  };
}
