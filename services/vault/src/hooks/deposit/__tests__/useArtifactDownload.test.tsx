import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import {
  createAuthenticatedVpClient,
  JsonRpcError,
  VpResponseValidationError,
  vpTokenRegistry,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/artifacts", async () => {
  // Re-export the real cancellation sentinel so the hook's
  // `err instanceof ArtifactDownloadCancelledError` check matches the
  // class instances test cases may throw from the mocked fetch.
  const actual = await vi.importActual<typeof import("@/services/artifacts")>(
    "@/services/artifacts",
  );
  return {
    ...actual,
    fetchAndDownloadArtifacts: vi.fn(),
  };
});

vi.mock("@/utils/artifactDownloadStorage", () => ({
  markArtifactsDownloaded: vi.fn(),
}));

vi.mock("@/hooks/deposit/depositFlowSteps/ensureAuthenticatedVpClient", () => ({
  ensureAuthenticatedVpClient: vi.fn(),
}));

import {
  ArtifactDownloadCancelledError,
  fetchAndDownloadArtifacts,
} from "@/services/artifacts";

import { ensureAuthenticatedVpClient } from "../depositFlowSteps/ensureAuthenticatedVpClient";
import { useArtifactDownload } from "../useArtifactDownload";

const fetchMock = vi.mocked(fetchAndDownloadArtifacts);
const ensureAuthMock = vi.mocked(ensureAuthenticatedVpClient);

const PROVIDER_ADDRESS = "0x1234";
const PEGIN_TXID =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const DEPOSITOR_PK =
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const VAULT_ID = "0xdeadbeef" as const;
const UNSIGNED_PRE_PEGIN_TX_HEX = "0xdeadbeef";

const fakeWallet = {} as BitcoinWallet;

const primeContext = {
  vaultId: VAULT_ID,
  unsignedPrePeginTxHex: UNSIGNED_PRE_PEGIN_TX_HEX,
  btcWallet: fakeWallet,
};

/** Seed the singleton registry so `peek()` returns a provider (hot cache). */
function seedHotCache(): void {
  createAuthenticatedVpClient({
    baseUrl: "https://vp.test/rpc",
    peginTxid: PEGIN_TXID,
    authAnchorHex: "c".repeat(64),
    pinnedServerPubkey: "ab".repeat(32) as unknown as Parameters<
      typeof createAuthenticatedVpClient
    >[0]["pinnedServerPubkey"],
    depositorBtcPubkey: DEPOSITOR_PK,
  });
}

describe("useArtifactDownload — prime then fetch", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    ensureAuthMock.mockReset();
    (vpTokenRegistry as unknown as { clear?: () => void }).clear?.();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("primes the bearer upfront when the registry is cold, then fetches once", async () => {
    ensureAuthMock.mockResolvedValueOnce(
      undefined as unknown as Awaited<
        ReturnType<typeof ensureAuthenticatedVpClient>
      >,
    );
    fetchMock.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useArtifactDownload({ primeContext }));

    await act(async () => {
      await result.current.download(PROVIDER_ADDRESS, PEGIN_TXID, DEPOSITOR_PK);
    });

    await waitFor(() => expect(result.current.downloaded).toBe(true));
    expect(ensureAuthMock).toHaveBeenCalledTimes(1);
    expect(ensureAuthMock).toHaveBeenCalledWith({
      btcWallet: fakeWallet,
      vaultId: VAULT_ID,
      unsignedPrePeginTxHex: UNSIGNED_PRE_PEGIN_TX_HEX,
      peginTxHash: PEGIN_TXID,
      providerAddress: PROVIDER_ADDRESS,
      depositorBtcPubkey: DEPOSITOR_PK,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
  });

  it("skips the upfront prime when the registry is already hot", async () => {
    seedHotCache();
    fetchMock.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useArtifactDownload({ primeContext }));

    await act(async () => {
      await result.current.download(PROVIDER_ADDRESS, PEGIN_TXID, DEPOSITOR_PK);
    });

    await waitFor(() => expect(result.current.downloaded).toBe(true));
    expect(ensureAuthMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces an error and never fetches when cold and no prime context is provided", async () => {
    const { result } = renderHook(() =>
      useArtifactDownload({ primeContext: null }),
    );

    await act(async () => {
      await result.current.download(PROVIDER_ADDRESS, PEGIN_TXID, DEPOSITOR_PK);
    });

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(ensureAuthMock).not.toHaveBeenCalled();
    expect(result.current.downloaded).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it("surfaces a clean error when the upfront prime throws", async () => {
    ensureAuthMock.mockRejectedValueOnce(
      new Error("Pre-PegIn transaction hash mismatch"),
    );

    const { result } = renderHook(() => useArtifactDownload({ primeContext }));

    await act(async () => {
      await result.current.download(PROVIDER_ADDRESS, PEGIN_TXID, DEPOSITOR_PK);
    });

    await waitFor(() =>
      expect(result.current.error).toBe("Pre-PegIn transaction hash mismatch"),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(ensureAuthMock).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(false);
    expect(result.current.downloaded).toBe(false);
  });

  it("does not fetch if the user cancels during the upfront prime", async () => {
    let resolveEnsure: () => void = () => {};
    const ensureDeferred = new Promise<unknown>((resolve) => {
      resolveEnsure = () => resolve(undefined);
    });
    ensureAuthMock.mockImplementationOnce(
      () =>
        ensureDeferred as unknown as ReturnType<
          typeof ensureAuthenticatedVpClient
        >,
    );

    const { result } = renderHook(() => useArtifactDownload({ primeContext }));

    let downloadPromise: Promise<void> | undefined;
    act(() => {
      downloadPromise = result.current.download(
        PROVIDER_ADDRESS,
        PEGIN_TXID,
        DEPOSITOR_PK,
      );
    });

    act(() => {
      result.current.cancel();
    });

    await act(async () => {
      resolveEnsure();
      await downloadPromise;
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.downloaded).toBe(false);
  });

  it("retries once when the bearer expires mid-flight (hot-but-stale)", async () => {
    seedHotCache();
    const seededProvider = vpTokenRegistry.peek(PEGIN_TXID);
    expect(seededProvider).toBeDefined();
    const invalidateSpy = vi.spyOn(
      seededProvider as { invalidate: () => void },
      "invalidate",
    );

    fetchMock
      .mockRejectedValueOnce(
        new JsonRpcError(-32001, "auth expired", "wire", {
          kind: "auth_expired",
        }),
      )
      .mockResolvedValueOnce(undefined);
    ensureAuthMock.mockResolvedValueOnce(
      undefined as unknown as Awaited<
        ReturnType<typeof ensureAuthenticatedVpClient>
      >,
    );

    const { result } = renderHook(() => useArtifactDownload({ primeContext }));

    await act(async () => {
      await result.current.download(PROVIDER_ADDRESS, PEGIN_TXID, DEPOSITOR_PK);
    });

    await waitFor(() => expect(result.current.downloaded).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    // Upfront prime skipped (hot cache); ensureAuth called only on the
    // retry path after auth_expired.
    expect(ensureAuthMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries at most once - propagates failure when the retry also auth-fails", async () => {
    seedHotCache();
    fetchMock
      .mockRejectedValueOnce(
        new JsonRpcError(-32001, "missing or malformed Bearer token", "wire"),
      )
      .mockRejectedValueOnce(
        new JsonRpcError(-32001, "missing or malformed Bearer token", "wire"),
      );
    ensureAuthMock.mockResolvedValueOnce(
      undefined as unknown as Awaited<
        ReturnType<typeof ensureAuthenticatedVpClient>
      >,
    );

    const { result } = renderHook(() => useArtifactDownload({ primeContext }));

    await act(async () => {
      await result.current.download(PROVIDER_ADDRESS, PEGIN_TXID, DEPOSITOR_PK);
    });

    await waitFor(() =>
      expect(result.current.error).toBe("missing or malformed Bearer token"),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(ensureAuthMock).toHaveBeenCalledTimes(1);
    expect(result.current.downloaded).toBe(false);
  });

  it("does not prime on a non-auth wire error", async () => {
    seedHotCache();
    fetchMock.mockRejectedValueOnce(
      new JsonRpcError(-32001, "internal error", "wire"),
    );

    const { result } = renderHook(() => useArtifactDownload({ primeContext }));

    await act(async () => {
      await result.current.download(PROVIDER_ADDRESS, PEGIN_TXID, DEPOSITOR_PK);
    });

    await waitFor(() => expect(result.current.error).toBe("internal error"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(ensureAuthMock).not.toHaveBeenCalled();
    expect(result.current.downloaded).toBe(false);
  });

  it("does not prime on a local JsonRpcError (transport / SDK failure)", async () => {
    seedHotCache();
    fetchMock.mockRejectedValueOnce(
      new JsonRpcError(-32000, "request timed out", "local"),
    );

    const { result } = renderHook(() => useArtifactDownload({ primeContext }));

    await act(async () => {
      await result.current.download(PROVIDER_ADDRESS, PEGIN_TXID, DEPOSITOR_PK);
    });

    await waitFor(() => expect(result.current.error).toBe("request timed out"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(ensureAuthMock).not.toHaveBeenCalled();
    expect(result.current.downloaded).toBe(false);
  });

  it("does not prime on a VpResponseValidationError", async () => {
    seedHotCache();
    fetchMock.mockRejectedValueOnce(
      new VpResponseValidationError("shape mismatch"),
    );

    const { result } = renderHook(() => useArtifactDownload({ primeContext }));

    await act(async () => {
      await result.current.download(PROVIDER_ADDRESS, PEGIN_TXID, DEPOSITOR_PK);
    });

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(ensureAuthMock).not.toHaveBeenCalled();
    expect(result.current.downloaded).toBe(false);
  });

  it("aborts the request on cancel and swallows the resulting sentinel without surfacing an error", async () => {
    seedHotCache();
    // Mirror the real service: reject with the cancellation sentinel once the
    // caller aborts the signal. This exercises both the abort wiring and the
    // hook's `instanceof ArtifactDownloadCancelledError` swallow path.
    fetchMock.mockImplementationOnce(
      (_provider, _txid, _pk, options) =>
        new Promise<void>((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () =>
            reject(new ArtifactDownloadCancelledError()),
          );
        }),
    );

    const { result } = renderHook(() => useArtifactDownload({ primeContext }));

    let downloadPromise: Promise<void> | undefined;
    act(() => {
      downloadPromise = result.current.download(
        PROVIDER_ADDRESS,
        PEGIN_TXID,
        DEPOSITOR_PK,
      );
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.cancel();
    });

    await act(async () => {
      await downloadPromise;
    });

    // cancel() resets UI state; the swallowed sentinel must not surface.
    expect(result.current.error).toBeNull();
    expect(result.current.downloaded).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it("propagates received/total bytes from the in-flight progress callback", async () => {
    seedHotCache();
    let resolveFetch: () => void = () => {};
    fetchMock.mockImplementationOnce((_provider, _txid, _pk, options) => {
      options?.onProgress?.(500, 1000);
      return new Promise<void>((resolve) => {
        resolveFetch = resolve;
      });
    });

    const { result } = renderHook(() => useArtifactDownload({ primeContext }));

    let downloadPromise: Promise<void> | undefined;
    act(() => {
      downloadPromise = result.current.download(
        PROVIDER_ADDRESS,
        PEGIN_TXID,
        DEPOSITOR_PK,
      );
    });

    await waitFor(() => {
      expect(result.current.receivedBytes).toBe(500);
      expect(result.current.totalBytes).toBe(1000);
    });

    await act(async () => {
      resolveFetch();
      await downloadPromise;
    });

    expect(result.current.downloaded).toBe(true);
  });
});
