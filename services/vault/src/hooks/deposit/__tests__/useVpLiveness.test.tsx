import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TELEMETRY_EVENT, shortId } from "@/infrastructure/telemetryEvents";

import { useVpLiveness } from "../useVpLiveness";

const probeVpLiveness = vi.hoisted(() => vi.fn());
vi.mock("@/services/vpLiveness", () => ({ probeVpLiveness }));

const mockLoggerEvent = vi.hoisted(() => vi.fn());
const mockLoggerError = vi.hoisted(() => vi.fn());
vi.mock("@/infrastructure", () => ({
  logger: {
    event: mockLoggerEvent,
    error: mockLoggerError,
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

const PROVIDER = "0x1111111111111111111111111111111111111111";
const VAULT_ID = "0xabc123";

describe("useVpLiveness", () => {
  beforeEach(() => {
    probeVpLiveness.mockReset();
    mockLoggerEvent.mockReset();
    mockLoggerError.mockReset();
  });

  it("probes once on enable and reports reachable", async () => {
    probeVpLiveness.mockResolvedValue("reachable");

    const { result } = renderHook(() =>
      useVpLiveness(PROVIDER, VAULT_ID, true),
    );

    expect(result.current.status).toBe("probing");
    await waitFor(() => expect(result.current.status).toBe("reachable"));
    expect(probeVpLiveness).toHaveBeenCalledTimes(1);
    expect(probeVpLiveness).toHaveBeenCalledWith(
      PROVIDER,
      VAULT_ID,
      expect.any(AbortSignal),
    );
    expect(mockLoggerEvent).not.toHaveBeenCalled();
  });

  it("stays idle and does not probe while disabled or without a provider", () => {
    const disabled = renderHook(() => useVpLiveness(PROVIDER, VAULT_ID, false));
    const noProvider = renderHook(() =>
      useVpLiveness(undefined, VAULT_ID, true),
    );

    expect(disabled.result.current.status).toBe("idle");
    expect(noProvider.result.current.status).toBe("idle");
    expect(probeVpLiveness).not.toHaveBeenCalled();
  });

  it("sends one telemetry event per mount when unconfirmed, and retry re-probes", async () => {
    probeVpLiveness.mockResolvedValue("vp-unconfirmed");

    const { result } = renderHook(() =>
      useVpLiveness(PROVIDER, VAULT_ID, true),
    );

    await waitFor(() => expect(result.current.status).toBe("vp-unconfirmed"));
    expect(mockLoggerEvent).toHaveBeenCalledTimes(1);
    expect(mockLoggerEvent).toHaveBeenCalledWith(
      TELEMETRY_EVENT.ACTIVATION_PROVIDER_UNCONFIRMED,
      {
        level: "warning",
        category: "activation",
        tags: { vaultId: shortId(VAULT_ID), outcome: "vp-unconfirmed" },
      },
    );

    act(() => result.current.retry());

    expect(result.current.status).toBe("probing");
    await waitFor(() => expect(result.current.status).toBe("vp-unconfirmed"));
    expect(probeVpLiveness).toHaveBeenCalledTimes(2);
    expect(mockLoggerEvent).toHaveBeenCalledTimes(1);
  });

  it("reports the proxy as unreachable, logging the error and telemetry, when the probe itself rejects", async () => {
    const failure = new Error("boom");
    probeVpLiveness.mockRejectedValue(failure);

    const { result } = renderHook(() =>
      useVpLiveness(PROVIDER, VAULT_ID, true),
    );

    await waitFor(() =>
      expect(result.current.status).toBe("proxy-unreachable"),
    );
    expect(mockLoggerError).toHaveBeenCalledWith(failure, expect.anything());
    expect(mockLoggerEvent).toHaveBeenCalledWith(
      TELEMETRY_EVENT.ACTIVATION_PROVIDER_UNCONFIRMED,
      expect.objectContaining({
        tags: { vaultId: shortId(VAULT_ID), outcome: "proxy-unreachable" },
      }),
    );
  });

  it("aborts the probe on unmount and applies nothing afterwards", async () => {
    let settle: (outcome: string) => void = () => {};
    let seenSignal: AbortSignal | undefined;
    probeVpLiveness.mockImplementation(
      (_p: string, _v: string, signal: AbortSignal) => {
        seenSignal = signal;
        return new Promise((resolve) => {
          settle = resolve;
        });
      },
    );

    const { result, unmount } = renderHook(() =>
      useVpLiveness(PROVIDER, VAULT_ID, true),
    );
    unmount();
    settle("vp-unconfirmed");
    await Promise.resolve();

    expect(seenSignal?.aborted).toBe(true);
    expect(result.current.status).toBe("probing");
    expect(mockLoggerEvent).not.toHaveBeenCalled();
  });
});
