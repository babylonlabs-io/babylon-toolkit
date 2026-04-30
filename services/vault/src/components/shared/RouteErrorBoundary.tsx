import { useEffect, type ReactNode } from "react";
import { ErrorBoundary, type FallbackProps } from "react-error-boundary";

import { logger } from "@/infrastructure";

const CHUNK_RELOAD_KEY = "route-chunk-reload-attempt";

function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "ChunkLoadError") return true;
  return (
    /Loading chunk [\w-]+ failed/i.test(error.message) ||
    /Failed to fetch dynamically imported module/i.test(error.message) ||
    /Importing a module script failed/i.test(error.message)
  );
}

function RouteFallback({ error, resetErrorBoundary }: FallbackProps) {
  const chunkError = isChunkLoadError(error);

  useEffect(() => {
    logger.error(error instanceof Error ? error : new Error(String(error)), {
      tags: {
        source: "RouteErrorBoundary",
        chunkLoadError: String(chunkError),
      },
    });
  }, [error, chunkError]);

  useEffect(() => {
    if (!chunkError) return;
    const alreadyReloaded = sessionStorage.getItem(CHUNK_RELOAD_KEY);
    if (alreadyReloaded) return;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
    window.location.reload();
  }, [chunkError]);

  if (chunkError) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4">
        <p className="text-accent-secondary">Reloading…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-lg border border-secondary-strokeLight bg-secondary-contrast p-6 text-center">
        <h2 className="mb-2 text-lg font-semibold text-accent-primary">
          Couldn’t load this page
        </h2>
        <p className="mb-4 text-sm text-accent-secondary">
          A temporary error stopped this view from loading. Try again in a
          moment.
        </p>
        <button
          onClick={resetErrorBoundary}
          className="rounded-md bg-primary-main px-4 py-2 text-sm text-primary-contrast hover:bg-primary-main/90"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

interface RouteErrorBoundaryProps {
  children: ReactNode;
}

export function RouteErrorBoundary({ children }: RouteErrorBoundaryProps) {
  return (
    <ErrorBoundary FallbackComponent={RouteFallback}>{children}</ErrorBoundary>
  );
}
