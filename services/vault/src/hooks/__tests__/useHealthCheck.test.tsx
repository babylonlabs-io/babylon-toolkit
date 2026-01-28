import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ErrorProvider, useError } from "@/context/error";

import { useHealthCheck } from "../useHealthCheck";

vi.mock("@/config/contracts", () => ({
  CONTRACTS: {
    AAVE_CONTROLLER: "0x1234567890123456789012345678901234567890",
  },
}));

const mockRunHealthChecks = vi.fn();
const mockEnvInitError: string | null = null;
const mockWagmiInitError: string | null = null;

vi.mock("@/config/env", () => ({
  get envInitError() {
    return mockEnvInitError;
  },
}));

vi.mock("@/config/wagmi", () => ({
  get wagmiInitError() {
    return mockWagmiInitError;
  },
}));

vi.mock("@/services/health", () => ({
  runHealthChecks: (...args: unknown[]) => mockRunHealthChecks(...args),
  createEnvConfigError: (details: string) => ({
    title: "Configuration Error",
    message: `Missing configuration (${details})`,
  }),
  createWagmiInitError: () => ({
    title: "Wallet Error",
    message: "Wallet init failed",
  }),
}));

function TestComponent({
  onError,
  onGeoBlocked,
}: {
  onError: (error: unknown) => void;
  onGeoBlocked?: (isGeoBlocked: boolean) => void;
}) {
  const { isGeoBlocked } = useHealthCheck();
  const { error, isOpen } = useError();

  if (isOpen && error.message) {
    onError(error);
  }

  if (onGeoBlocked) {
    onGeoBlocked(isGeoBlocked);
  }

  return <div data-testid="test">Test</div>;
}

function renderWithProviders(
  onError: (error: unknown) => void,
  onGeoBlocked?: (isGeoBlocked: boolean) => void,
) {
  return render(
    <ErrorProvider>
      <TestComponent onError={onError} onGeoBlocked={onGeoBlocked} />
    </ErrorProvider>,
  );
}

describe("useHealthCheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunHealthChecks.mockResolvedValue({
      healthy: true,
      isGeoBlocked: false,
    });
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("does not show error when all checks pass", async () => {
    const onError = vi.fn();

    renderWithProviders(onError);

    await waitFor(() => {
      expect(mockRunHealthChecks).toHaveBeenCalled();
    });

    expect(onError).not.toHaveBeenCalled();
  });

  it("shows error when GraphQL is unreachable", async () => {
    mockRunHealthChecks.mockResolvedValueOnce({
      healthy: false,
      error: {
        title: "Service Unavailable",
        message: "Cannot connect to backend",
      },
    });

    const onError = vi.fn();
    renderWithProviders(onError);

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Service Unavailable",
        }),
      );
    });
  });

  it("shows error when application is paused", async () => {
    mockRunHealthChecks.mockResolvedValueOnce({
      healthy: false,
      error: {
        title: "Application Paused",
        message: "Application is paused for maintenance",
      },
    });

    const onError = vi.fn();
    renderWithProviders(onError);

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Application Paused",
        }),
      );
    });
  });

  it("shows blocking error and sets isGeoBlocked when user is geo-blocked", async () => {
    mockRunHealthChecks.mockResolvedValueOnce({
      healthy: false,
      isGeoBlocked: true,
      error: {
        title: "Access Restricted",
        message:
          "We're sorry, but this page isn't accessible in your location at the moment due to the regional restrictions",
      },
    });

    const onError = vi.fn();
    const onGeoBlocked = vi.fn();
    renderWithProviders(onError, onGeoBlocked);

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Access Restricted",
        }),
      );
    });

    await waitFor(() => {
      expect(onGeoBlocked).toHaveBeenCalledWith(true);
    });
  });
});
