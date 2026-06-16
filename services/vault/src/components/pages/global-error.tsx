import { useEffect } from "react";
import type { FallbackProps } from "react-error-boundary";

import { COPY } from "@/copy";
import { logger } from "@/infrastructure";
import { classifyError } from "@/utils/errors/formatting";

export default function GlobalError({
  error,
  resetErrorBoundary,
}: FallbackProps) {
  // A stale-deploy chunk 404 cannot be recovered by re-rendering the same
  // (cached-rejected) lazy import — only a full reload fetches fresh chunks.
  const isStaleDeploy = classifyError(error) === "stale-deploy";

  useEffect(() => {
    if (error) {
      logger.error(error, {
        tags: { source: "GlobalErrorBoundary" },
      });
    }
  }, [error]);

  const heading = isStaleDeploy
    ? COPY.common.globalError.staleDeployHeading
    : COPY.common.globalError.heading;
  const body = isStaleDeploy
    ? COPY.common.classifiedErrors.staleDeploy
    : COPY.common.globalError.body;
  const buttonLabel = isStaleDeploy
    ? COPY.common.globalError.reloadButton
    : COPY.common.globalError.retryButton;
  const onAction = isStaleDeploy
    ? () => window.location.reload()
    : resetErrorBoundary;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-lg">
        <h1 className="mb-4 text-2xl font-bold text-red-600">{heading}</h1>
        <p className="mb-4 text-gray-700">{body}</p>
        <button
          onClick={onAction}
          className="w-full rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}
