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

vi.mock("@/services/health", () => ({
  checkGeofencing: (...args: unknown[]) => mockCheckGeofencing(...args),
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
    mockCheckGeofencing.mockResolvedValue({
      healthy: true,
      isGeoBlocked: false,
    });
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("does not show error when user is not geo-blocked", async () => {
    const onError = vi.fn();
    const onGeoBlocked = vi.fn();

    renderWithProviders(onError, onGeoBlocked);

    await waitFor(() => {
      expect(mockCheckGeofencing).toHaveBeenCalled();
    });

    expect(onError).not.toHaveBeenCalled();
    expect(onGeoBlocked).toHaveBeenCalledWith(false);
  });

  it("shows blocking error and sets isGeoBlocked when user is geo-blocked", async () => {
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
