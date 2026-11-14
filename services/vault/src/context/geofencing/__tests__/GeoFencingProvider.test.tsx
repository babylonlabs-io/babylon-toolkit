import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ErrorProvider, useError } from "@/context/error";

import { GeoFencingProvider, useGeoFencing } from "../GeoFencingProvider";

vi.mock("@/config/contracts", () => ({
  CONTRACTS: {
    AAVE_ADAPTER: "0x1234567890123456789012345678901234567890",
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

  it("reports a blocked visitor's region as known", async () => {
    mockCheckGeofencing.mockResolvedValueOnce({
      healthy: false,
      isGeoBlocked: true,
    });
    let state: ReturnType<typeof useGeoFencing> | undefined;
    function Probe() {
      state = useGeoFencing();
      return null;
    }
    render(
      <ErrorProvider>
        <GeoFencingProvider>
          <Probe />
        </GeoFencingProvider>
      </ErrorProvider>,
    );

    await waitFor(() => expect(state?.isLoading).toBe(false));
    expect(state).toEqual({
      isGeoBlocked: true,
      isLoading: false,
      isGeoChecked: true,
    });
  });

  it("sets isGeoBlocked when user is geo-blocked without showing error modal", async () => {
    mockCheckGeofencing.mockResolvedValueOnce({
      healthy: false,
      isGeoBlocked: true,
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

  it("reports the geofence as checked once the check has run", async () => {
    let state: ReturnType<typeof useGeoFencing> | undefined;
    function Probe() {
      state = useGeoFencing();
      return null;
    }
    render(
      <ErrorProvider>
        <GeoFencingProvider>
          <Probe />
        </GeoFencingProvider>
      </ErrorProvider>,
    );

    await waitFor(() => expect(state?.isLoading).toBe(false));
    expect(state).toEqual({
      isGeoBlocked: false,
      isLoading: false,
      isGeoChecked: true,
    });
  });

  it("reports the geofence as not checked when the health endpoint did not answer", async () => {
    mockCheckGeofencing.mockResolvedValueOnce({
      healthy: false,
      isGeoBlocked: false,
    });
    let state: ReturnType<typeof useGeoFencing> | undefined;
    function Probe() {
      state = useGeoFencing();
      return null;
    }
    render(
      <ErrorProvider>
        <GeoFencingProvider>
          <Probe />
        </GeoFencingProvider>
      </ErrorProvider>,
    );

    await waitFor(() => expect(state?.isLoading).toBe(false));
    expect(state).toEqual({
      isGeoBlocked: false,
      isLoading: false,
      isGeoChecked: false,
    });
  });

  it("reports the geofence as not checked when a wallet init error stops the checks first", async () => {
    mockWagmiInitError = "AppKit failed";
    let state: ReturnType<typeof useGeoFencing> | undefined;
    function Probe() {
      state = useGeoFencing();
      return null;
    }
    render(
      <ErrorProvider>
        <GeoFencingProvider>
          <Probe />
        </GeoFencingProvider>
      </ErrorProvider>,
    );

    await waitFor(() => expect(state?.isLoading).toBe(false));
    expect(mockCheckGeofencing).not.toHaveBeenCalled();
    expect(state).toEqual({
      isGeoBlocked: false,
      isLoading: false,
      isGeoChecked: false,
    });
  });
});
