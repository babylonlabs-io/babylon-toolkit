import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import {
  JsonRpcError,
  vpTokenRegistry,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@babylonlabs-io/wallet-connector", () => ({
  useChainConnector: () => null,
}));

vi.mock("@/services/artifacts", () => ({
  fetchAndDownloadArtifacts: vi.fn(),
}));

vi.mock("@/utils/artifactDownloadStorage", () => ({
  markArtifactsDownloaded: vi.fn(),
}));

vi.mock("@/hooks/deposit/depositFlowSteps/ensureAuthenticatedVpClient", () => ({
  ensureAuthenticatedVpClient: vi.fn(),
}));

import { fetchAndDownloadArtifacts } from "@/services/artifacts";

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

describe("useArtifactDownload — optimistic-then-prime-and-retry", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    ensureAuthMock.mockReset();
    (vpTokenRegistry as unknown as { clear?: () => void }).clear?.();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("succeeds on the first attempt and never calls ensureAuthenticatedVpClient", async () => {
    fetchMock.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useArtifactDownload({ primeContext }));

    await act(async () => {
      await result.current.download(PROVIDER_ADDRESS, PEGIN_TXID, DEPOSITOR_PK);
    });

    await waitFor(() => expect(result.current.downloaded).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(ensureAuthMock).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });

  it("primes the registry and retries once when the cache is cold at first attempt", async () => {
    // First attempt rejects with a wire-source bearer rejection — the server's
    // response when we send the request without an Authorization header.
    fetchMock
      .mockRejectedValueOnce(
        new JsonRpcError(-32001, "missing or malformed Bearer token", "wire"),
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
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(ensureAuthMock).toHaveBeenCalledTimes(1);
    expect(ensureAuthMock).toHaveBeenCalledWith({
      btcWallet: fakeWallet,
      vaultId: VAULT_ID,
      unsignedPrePeginTxHex: UNSIGNED_PRE_PEGIN_TX_HEX,
      peginTxHash: PEGIN_TXID,
      providerAddress: PROVIDER_ADDRESS,
      depositorBtcPubkey: DEPOSITOR_PK,
    });
    expect(result.current.error).toBeNull();
  });

  it("surfaces the original error when no prime context is provided", async () => {
    fetchMock.mockRejectedValueOnce(
      new JsonRpcError(-32001, "missing or malformed Bearer token", "wire"),
    );

    const { result } = renderHook(() =>
      useArtifactDownload({ primeContext: null }),
    );

    await act(async () => {
      await result.current.download(PROVIDER_ADDRESS, PEGIN_TXID, DEPOSITOR_PK);
    });

    await waitFor(() =>
      expect(result.current.error).toBe("missing or malformed Bearer token"),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(ensureAuthMock).not.toHaveBeenCalled();
    expect(result.current.downloaded).toBe(false);
  });

  it("retries at most once - propagates failure when the second attempt also fails", async () => {
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

  it("surfaces a prime failure as the modal error", async () => {
    fetchMock.mockRejectedValueOnce(
      new JsonRpcError(-32001, "missing or malformed Bearer token", "wire"),
    );
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
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(ensureAuthMock).toHaveBeenCalledTimes(1);
    expect(result.current.downloaded).toBe(false);
  });
});
