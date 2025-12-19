import {
  type FC,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import { ErrorModal } from "@/components/shared/ErrorModal";
import { logger } from "@/infrastructure";

import type { ErrorContextType, ErrorHandlerParam, ErrorState } from "./types";

const ErrorContext = createContext<ErrorContextType>({
  isOpen: false,
  error: {
    message: "",
  },
  modalOptions: {},
  dismissError: () => {},
  handleError: () => {},
});

interface ErrorProviderProps {
  children: ReactNode;
}

export const ErrorProvider: FC<ErrorProviderProps> = ({ children }) => {
  const [state, setState] = useState<ErrorState>({
    isOpen: false,
    error: { message: "" },
    modalOptions: {},
  });

  const dismissError = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const handleError = useCallback(
    ({ error, displayOptions, metadata }: ErrorHandlerParam) => {
      if (!error) return;

      const stackTrace = error instanceof Error ? error.stack || "" : "";

      const shouldShowModal = displayOptions?.showModal ?? true;

      const errorData = {
        message: error.message,
        code: "code" in error ? error.code : undefined,
        title: "title" in error ? error.title : undefined,
        trace: stackTrace,
        context: "context" in error ? error.context : undefined,
        metadata: metadata ?? {},
      };

      if (error instanceof Error) {
        logger.error(error, {
          tags: errorData.code ? { errorCode: String(errorData.code) } : {},
        });
      }

      if (shouldShowModal) {
        setState((prev) => {
          if (prev.isOpen && prev.error.message === errorData.message) {
            return prev;
          }
          return {
            isOpen: true,
            error: errorData,
            modalOptions: {
              retryAction: displayOptions?.retryAction,
              noCancel: displayOptions?.noCancel,
              blocking: displayOptions?.blocking,
            },
          };
        });
      }
    },
    [],
  );

  const contextValue = useMemo(
    () => ({
      ...state,
      dismissError,
      handleError,
    }),
    [state, dismissError, handleError],
  );

  return (
    <ErrorContext.Provider value={contextValue}>
      {children}
      <ErrorModal />
    </ErrorContext.Provider>
  );
};

export const useError = () => useContext(ErrorContext);
