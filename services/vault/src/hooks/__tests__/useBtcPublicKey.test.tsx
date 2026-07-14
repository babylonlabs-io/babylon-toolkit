import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useBtcPublicKey } from "../useBtcPublicKey";

const mockGetPublicKeyHex = vi.hoisted(() => vi.fn());
// Stable connector instance, mirroring the real provider context (which keeps
// the same connector object across reconnects and only bumps its map).
const mockConnector = vi.hoisted(() => ({
  connectedWallet: { provider: { getPublicKeyHex: mockGetPublicKeyHex } },
}));

vi.mock("@babylonlabs-io/wallet-connector", () => ({
  useChainConnector: () => mockConnector,
}));

vi.mock("@babylonlabs-io/ts-sdk/tbv/core", () => ({
  // Fixed x-only output with 0x prefix so the strip behavior is observable.
  processPublicKeyToXOnly: () => `0x${"ab".repeat(32)}`,
}));

vi.mock("@/infrastructure", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

describe("useBtcPublicKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the x-only key without the 0x prefix once the wallet responds", async () => {
    mockGetPublicKeyHex.mockResolvedValue(`02${"ab".repeat(32)}`);

    const { result } = renderHook(() => useBtcPublicKey(true));

    await waitFor(() => {
      expect(result.current.publicKey).toBe("ab".repeat(32));
    });
    expect(result.current.error).toBeNull();
  });

  it("surfaces a terminal error when the wallet public-key read fails", async () => {
    mockGetPublicKeyHex.mockRejectedValue(new Error("wallet locked"));

    const { result } = renderHook(() => useBtcPublicKey(true));

    await waitFor(() => {
      expect(result.current.error?.message).toBe("wallet locked");
    });
    expect(result.current.publicKey).toBeUndefined();
  });

  it("refetch() re-reads and clears the error after a reconnect unlocks the wallet", async () => {
    mockGetPublicKeyHex.mockRejectedValueOnce(new Error("wallet locked"));
    mockGetPublicKeyHex.mockResolvedValue(`02${"ab".repeat(32)}`);

    const { result } = renderHook(() => useBtcPublicKey(true));
    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });

    // The user reconnects/unlocks; the CTA handler awaits refetch().
    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.publicKey).toBe("ab".repeat(32));
    expect(result.current.error).toBeNull();
  });

  it("does not let a stale mount read clobber a fresher refetch result", async () => {
    // Mount read: still pending (wallet locked, slow), will ultimately fail.
    let rejectMountRead!: (e: Error) => void;
    const mountRead = new Promise<string>((_, reject) => {
      rejectMountRead = reject;
    });
    mockGetPublicKeyHex
      .mockReturnValueOnce(mountRead) // mount read — hangs
      .mockResolvedValue(`02${"ab".repeat(32)}`); // refetch — fresh key

    const { result } = renderHook(() => useBtcPublicKey(true));

    // Reconnect fires refetch while the mount read is still in flight; it wins.
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.publicKey).toBe("ab".repeat(32));

    // The stale mount read finally fails — it must NOT overwrite the fresh key.
    await act(async () => {
      rejectMountRead(new Error("wallet locked"));
      await mountRead.catch(() => undefined);
    });
    expect(result.current.publicKey).toBe("ab".repeat(32));
    expect(result.current.error).toBeNull();
  });

  it("stays empty without error while the wallet is disconnected", async () => {
    const { result } = renderHook(() => useBtcPublicKey(false));

    await waitFor(() => {
      expect(result.current.publicKey).toBeUndefined();
      expect(result.current.error).toBeNull();
    });
    expect(mockGetPublicKeyHex).not.toHaveBeenCalled();
  });
});
