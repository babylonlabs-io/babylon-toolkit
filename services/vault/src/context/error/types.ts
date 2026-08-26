import { ErrorCode } from "@/utils/errors/types";

export interface ErrorDisplayOptions {
  retryAction?: () => void;
  noCancel?: boolean;
  blocking?: boolean;
}

export interface AppError {
  message: string;
  code?: ErrorCode;
  title?: string;
}

export interface ErrorHandlerParam {
  error: Error | AppError;
  displayOptions?: ErrorDisplayOptions;
}

export interface ErrorState {
  isOpen: boolean;
  error: AppError;
  modalOptions: {
    retryAction?: () => void;
    noCancel?: boolean;
    blocking?: boolean;
  };
}

export interface ErrorContextType extends ErrorState {
  dismissError: () => void;
  handleError: (param: ErrorHandlerParam) => void;
}
