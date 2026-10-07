import {
  JsonRpcError,
  VpResponseValidationError,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { probeVpLiveness } from "../probeVpLiveness";

const { getPeginStatusByVaultId, createVpClient } = vi.hoisted(() => {
  const getPeginStatusByVaultId = vi.fn();
  return {
    getPeginStatusByVaultId,
    createVpClient: vi.fn<
      (
        address: string,
        options?: unknown,
      ) => { getPeginStatusByVaultId: typeof getPeginStatusByVaultId }
    >(() => ({ getPeginStatusByVaultId })),
  };
});
vi.mock("@/utils/rpc", () => ({ createVpClient }));
vi.mock("@/config/env", () => ({
  ENV: { VP_PROXY_URL: "https://proxy.example.com" },
}));

const PROVIDER = "0x1111111111111111111111111111111111111111";
const VAULT_ID = "0xabc123";

function healthOk() {
  vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
}

function healthDown() {
  vi.mocked(fetch).mockRejectedValue(new TypeError("fetch failed"));
}

describe("probeVpLiveness", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    getPeginStatusByVaultId.mockReset();
    createVpClient.mockClear();
    createVpClient.mockImplementation(() => ({ getPeginStatusByVaultId }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("uses a short per-attempt timeout and no retries", async () => {
    getPeginStatusByVaultId.mockResolvedValue({});

    await probeVpLiveness(PROVIDER, VAULT_ID);

    expect(createVpClient).toHaveBeenCalledWith(PROVIDER, {
      timeout: 10_000,
      retries: 0,
    });
    expect(getPeginStatusByVaultId).toHaveBeenCalledWith(
      { vault_id: VAULT_ID },
      expect.any(AbortSignal),
    );
  });

  it("is reachable when the status call resolves, without touching /health", async () => {
    getPeginStatusByVaultId.mockResolvedValue({});

    await expect(probeVpLiveness(PROVIDER, VAULT_ID)).resolves.toBe(
      "reachable",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("is reachable when a result arrived with a drifted shape", async () => {
    getPeginStatusByVaultId.mockRejectedValue(
      new VpResponseValidationError("status missing"),
    );

    await expect(probeVpLiveness(PROVIDER, VAULT_ID)).resolves.toBe(
      "reachable",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not take a proxy-written error as proof the provider answered", async () => {
    // The proxy writes -32601 before contacting the provider; the SDK still
    // labels it "wire".
    getPeginStatusByVaultId.mockRejectedValue(
      new JsonRpcError(
        -32601,
        "Method not allowed: vaultProvider_getPeginStatusByVaultId",
        "wire",
      ),
    );
    healthOk();

    await expect(probeVpLiveness(PROVIDER, VAULT_ID)).resolves.toBe(
      "vp-unconfirmed",
    );
  });

  it.each([
    [
      "the proxy could not reach the provider",
      new JsonRpcError(-32003, "Failed to reach provider", "wire"),
    ],
    [
      "the proxy timed out on the provider",
      new JsonRpcError(-32002, "Provider request timed out", "wire"),
    ],
    [
      "the proxy did not find the provider",
      new JsonRpcError(-32001, "Provider not found", "wire"),
    ],
    [
      "the daemon answered an error",
      new JsonRpcError(-32603, "Internal error", "wire"),
    ],
    [
      "the client timed out",
      new JsonRpcError(
        -32000,
        "Request timeout after 10000ms (1 attempts)",
        "local",
      ),
    ],
    [
      "a dead tunnel's 404 passed through",
      new Error("HTTP error: 404 Not Found"),
    ],
  ])(
    "is unconfirmed when %s and the proxy is healthy",
    async (_name, error) => {
      getPeginStatusByVaultId.mockRejectedValue(error);
      healthOk();

      await expect(probeVpLiveness(PROVIDER, VAULT_ID)).resolves.toBe(
        "vp-unconfirmed",
      );
      expect(fetch).toHaveBeenCalledWith(
        "https://proxy.example.com/health",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    },
  );

  it("is proxy-unreachable when a network error meets a failed /health", async () => {
    getPeginStatusByVaultId.mockRejectedValue(
      new JsonRpcError(
        -32001,
        "Network error: fetch failed (1 attempts)",
        "local",
      ),
    );
    healthDown();

    await expect(probeVpLiveness(PROVIDER, VAULT_ID)).resolves.toBe(
      "proxy-unreachable",
    );
  });

  it("is proxy-unreachable when a 5xx meets a /health that is not ok", async () => {
    getPeginStatusByVaultId.mockRejectedValue(
      new Error("HTTP error: 502 Bad Gateway"),
    );
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);

    await expect(probeVpLiveness(PROVIDER, VAULT_ID)).resolves.toBe(
      "proxy-unreachable",
    );
  });

  it("rethrows when no proxy URL can be built, without touching /health", async () => {
    createVpClient.mockImplementation(() => {
      throw new Error("VP_PROXY_URL is not configured");
    });

    await expect(probeVpLiveness(PROVIDER, VAULT_ID)).rejects.toThrow(
      "VP_PROXY_URL is not configured",
    );
    expect(getPeginStatusByVaultId).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("settles within the 15 s overall deadline when the body stalls", async () => {
    vi.useFakeTimers();
    // Never settles: the SDK stopped its own timer once headers arrived.
    getPeginStatusByVaultId.mockImplementation(() => new Promise(() => {}));
    healthOk();

    const outcome = probeVpLiveness(PROVIDER, VAULT_ID);
    await vi.advanceTimersByTimeAsync(15_001);

    await expect(outcome).resolves.toBe("vp-unconfirmed");
  });

  it("rejects at once when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      probeVpLiveness(PROVIDER, VAULT_ID, controller.signal),
    ).rejects.toThrow();
    expect(createVpClient).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rethrows when the caller aborted during the call, without touching /health", async () => {
    const controller = new AbortController();
    getPeginStatusByVaultId.mockImplementation(() => {
      controller.abort();
      return Promise.reject(new Error("Request aborted"));
    });

    await expect(
      probeVpLiveness(PROVIDER, VAULT_ID, controller.signal),
    ).rejects.toThrow("Request aborted");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rethrows when the caller aborts during /health", async () => {
    const controller = new AbortController();
    getPeginStatusByVaultId.mockRejectedValue(
      new JsonRpcError(-32003, "Failed to reach provider", "wire"),
    );
    vi.mocked(fetch).mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
          controller.abort();
        }),
    );

    await expect(
      probeVpLiveness(PROVIDER, VAULT_ID, controller.signal),
    ).rejects.toThrow();
  });

  it("gives /health its own 5 s deadline", async () => {
    vi.useFakeTimers();
    getPeginStatusByVaultId.mockRejectedValue(
      new JsonRpcError(-32003, "Failed to reach provider", "wire"),
    );
    vi.mocked(fetch).mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );

    const outcome = probeVpLiveness(PROVIDER, VAULT_ID);
    await vi.advanceTimersByTimeAsync(5_001);

    await expect(outcome).resolves.toBe("proxy-unreachable");
  });
});
