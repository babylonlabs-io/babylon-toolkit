import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ErrorProvider, useError } from "@/context/error";

import { GeoFencingProvider, useGeoFencing } from "../GeoFencingProvider";

vi.mock("@/config/contracts", () => ({
  CONTRACTS: {
    AAVE_CONTROLLER: "0x1234567890123456789012345678901234567890",
  },
}));

const mockCheckGeofencing = vi.fn();
const mockCheckGraphQLEndpoint = vi.fn();

let mockEnvInitError: string | null = null;
let mockWagmiInitError: string | null = null;

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
  checkGeofencing: (...args: unknown[]) => mockCheckGeofencing(...args),
  checkGraphQLEndpoint: (...args: unknown[]) =>
    mockCheckGraphQLEndpoint(...args),
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
  onGeoBlocked: (isGeoBlocked: boolean) => void;
}) {
  const { isGeoBlocked } = useGeoFencing();
  const { error, isOpen } = useError();

  if (isOpen && error.message) {
    onError(error);
  }

  onGeoBlocked(isGeoBlocked);

  return <div data-testid="test">Test</div>;
}

function renderWithProviders(
  onError: (error: unknown) => void,
  onGeoBlocked: (isGeoBlocked: boolean) => void,
) {
  return render(
    <ErrorProvider>
      <GeoFencingProvider>
        <TestComponent onError={onError} onGeoBlocked={onGeoBlocked} />
      </GeoFencingProvider>
    </ErrorProvider>,
  );
}

describe("GeoFencingProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnvInitError = null;
    mockWagmiInitError = null;
    mockCheckGeofencing.mockResolvedValue({
      healthy: true,
      isGeoBlocked: false,
    });
    mockCheckGraphQLEndpoint.mockResolvedValue({
      healthy: true,
    });
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("does not show error when all checks pass", async () => {
    const onError = vi.fn();
    const onGeoBlocked = vi.fn();

    renderWithProviders(onError, onGeoBlocked);

    await waitFor(() => {
      expect(mockCheckGeofencing).toHaveBeenCalled();
      expect(mockCheckGraphQLEndpoint).toHaveBeenCalled();
    });

    expect(onError).not.toHaveBeenCalled();
    expect(onGeoBlocked).toHaveBeenCalledWith(false);
  });

  it("sets isGeoBlocked when user is geo-blocked without showing error modal", async () => {
    mockCheckGeofencing.mockResolvedValueOnce({
      healthy: false,
      isGeoBlocked: true,
      error: {
        title: "Access Restricted",
        message:
          "We're sorry, but this page isn't accessible in your location at the moment due to regional restrictions",
      },
    });

    const onError = vi.fn();
    const onGeoBlocked = vi.fn();
    renderWithProviders(onError, onGeoBlocked);

    await waitFor(() => {
      expect(onGeoBlocked).toHaveBeenCalledWith(true);
    });

    expect(onError).not.toHaveBeenCalled();
  });

  it("shows error when GraphQL is unreachable", async () => {
    mockCheckGraphQLEndpoint.mockResolvedValueOnce({
      healthy: false,
      error: {
        title: "Service Unavailable",
        message: "Cannot connect to backend",
      },
    });

    const onError = vi.fn();
    const onGeoBlocked = vi.fn();
    renderWithProviders(onError, onGeoBlocked);

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Service Unavailable",
        }),
      );
    });

    expect(onGeoBlocked).toHaveBeenCalledWith(false);
  });
});
