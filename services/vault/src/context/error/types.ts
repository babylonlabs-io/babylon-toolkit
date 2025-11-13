import { ErrorCode } from "@/utils/errors/types";

export interface ErrorDisplayOptions {
  retryAction?: () => void;
  noCancel?: boolean;
  showModal?: boolean;
}

export interface AppError {
  message: string;
  code?: ErrorCode;
  title?: string;
  trace?: string;
  context?: Record<string, unknown>;
}

export interface ErrorHandlerParam {
  error: Error | AppError;
  displayOptions?: ErrorDisplayOptions;
  metadata?: Record<string, unknown>;
}

export interface ErrorState {
  isOpen: boolean;
  error: AppError;
  modalOptions: {
    retryAction?: () => void;
    noCancel?: boolean;
  };
}

export interface ErrorContextType extends ErrorState {
  dismissError: () => void;
  handleError: (param: ErrorHandlerParam) => void;
}
