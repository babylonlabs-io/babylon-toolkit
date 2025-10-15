import type { FallbackProps } from "react-error-boundary";

export default function GlobalError({
  error,
  resetErrorBoundary,
}: FallbackProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-lg">
        <h1 className="mb-4 text-2xl font-bold text-red-600">
          Something went wrong
        </h1>
        <p className="mb-4 text-gray-700">
          {error?.message || "An unexpected error occurred"}
        </p>
        <button
          onClick={resetErrorBoundary}
          className="w-full rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
