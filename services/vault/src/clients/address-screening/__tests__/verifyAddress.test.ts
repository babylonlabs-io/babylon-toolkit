import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/env", () => ({
  ENV: {
    UTILS_API_URL: "https://utils.example.com",
  },
}));

import { AddressScreeningNetworkError, verifyAddress } from "../verifyAddress";

describe("verifyAddress", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls the utils-api with the `address` query param and url-encodes it", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { btc_address: { risk: "low" } } }),
    } as Response);

    await verifyAddress("bc1 test");

    expect(fetch).toHaveBeenCalledWith(
      "https://utils.example.com/address/screening?address=bc1%20test",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("returns true for risk level 'low'", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { btc_address: { risk: "low" } } }),
    } as Response);

    await expect(verifyAddress("addr")).resolves.toBe(true);
  });

  it("returns true for risk level 'medium'", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { btc_address: { risk: "medium" } } }),
    } as Response);

    await expect(verifyAddress("addr")).resolves.toBe(true);
  });

  it("treats risk levels case-insensitively", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { btc_address: { risk: "MEDIUM" } } }),
    } as Response);

    await expect(verifyAddress("addr")).resolves.toBe(true);
  });

  it("returns false for risk level 'high'", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { btc_address: { risk: "high" } } }),
    } as Response);

    await expect(verifyAddress("addr")).resolves.toBe(false);
  });

  it("returns false when risk field is missing from response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: {} }),
    } as Response);

    await expect(verifyAddress("addr")).resolves.toBe(false);
  });

  it("throws AddressScreeningNetworkError on non-OK HTTP response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response);

    await expect(verifyAddress("addr")).rejects.toBeInstanceOf(
      AddressScreeningNetworkError,
    );
  });

  it("throws AddressScreeningNetworkError on fetch rejection", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await expect(verifyAddress("addr")).rejects.toBeInstanceOf(
      AddressScreeningNetworkError,
    );
  });

  it("allows by default when UTILS_API_URL is not configured", async () => {
    // Temporarily override ENV to simulate missing URL
    const envModule = await import("@/config/env");
    const originalUrl = envModule.ENV.UTILS_API_URL;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (envModule.ENV as any).UTILS_API_URL = undefined;

    try {
      await expect(verifyAddress("addr")).resolves.toBe(true);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (envModule.ENV as any).UTILS_API_URL = originalUrl;
    }
  });
});
