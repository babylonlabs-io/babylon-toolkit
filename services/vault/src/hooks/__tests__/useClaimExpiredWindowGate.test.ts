import { OnChainBtcVaultStatus } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import type { Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetVaultData = vi.hoisted(() => vi.fn());
vi.mock("@/clients/eth-contract/sdk-readers", () => ({
  getVaultRegistryReader: () => ({ getVaultData: mockGetVaultData }),
}));

const mockGetBlockNumber = vi.hoisted(() => vi.fn());
vi.mock("@/clients/eth-contract/client", () => ({
  ethClient: {
    getPublicClient: () => ({ getBlockNumber: mockGetBlockNumber }),
  },
}));

import {
  classifyClaimExpiredWindow,
  useClaimExpiredWindowGate,
} from "../useClaimExpiredWindowGate";

const VERIFIED_AT = 1_000n;
const CLAIM_EXPIRED_UNTIL = 300_000n;

describe("classifyClaimExpiredWindow", () => {
  it("reports an open window with the blocks left until claimExpiredUntil", () => {
    expect(
      classifyClaimExpiredWindow({
        status: OnChainBtcVaultStatus.EXPIRED,
        verifiedAt: VERIFIED_AT,
        claimExpiredUntil: CLAIM_EXPIRED_UNTIL,
        head: CLAIM_EXPIRED_UNTIL - 50n,
      }),
    ).toEqual({ state: "open", blocksRemaining: 50 });
  });

  it("leaves one block open when the head is just before claimExpiredUntil", () => {
    expect(
      classifyClaimExpiredWindow({
        status: OnChainBtcVaultStatus.EXPIRED,
        verifiedAt: VERIFIED_AT,
        claimExpiredUntil: CLAIM_EXPIRED_UNTIL,
        head: CLAIM_EXPIRED_UNTIL - 1n,
      }),
    ).toEqual({ state: "open", blocksRemaining: 1 });
  });

  it("closes once the head reaches claimExpiredUntil, since a redeem can only be mined after it", () => {
    expect(
      classifyClaimExpiredWindow({
        status: OnChainBtcVaultStatus.EXPIRED,
        verifiedAt: VERIFIED_AT,
        claimExpiredUntil: CLAIM_EXPIRED_UNTIL,
        head: CLAIM_EXPIRED_UNTIL,
      }),
    ).toEqual({ state: "closed" });
  });

  it("reports a vault that expired without verification as closed, head or not", () => {
    expect(
      classifyClaimExpiredWindow({
        status: OnChainBtcVaultStatus.EXPIRED,
        verifiedAt: 0n,
        claimExpiredUntil: CLAIM_EXPIRED_UNTIL,
        head: null,
      }),
    ).toEqual({ state: "closed" });
  });

  it("reports a vault the chain already lists as Redeemed as redeemed", () => {
    expect(
      classifyClaimExpiredWindow({
        status: OnChainBtcVaultStatus.REDEEMED,
        verifiedAt: VERIFIED_AT,
        claimExpiredUntil: CLAIM_EXPIRED_UNTIL,
        head: null,
      }),
    ).toEqual({ state: "redeemed" });
  });

  it("leaves the window unknown when the head could not be read", () => {
    expect(
      classifyClaimExpiredWindow({
        status: OnChainBtcVaultStatus.EXPIRED,
        verifiedAt: VERIFIED_AT,
        claimExpiredUntil: CLAIM_EXPIRED_UNTIL,
        head: null,
      }),
    ).toBeUndefined();
  });

  it("leaves the window unknown for a status that does not settle it", () => {
    expect(
      classifyClaimExpiredWindow({
        status: OnChainBtcVaultStatus.VERIFIED,
        verifiedAt: VERIFIED_AT,
        claimExpiredUntil: 0n,
        head: CLAIM_EXPIRED_UNTIL,
      }),
    ).toBeUndefined();
  });
});

describe("useClaimExpiredWindowGate", () => {
  // Mixed-case ids, as the indexer returns them; the map is keyed lowercase.
  const VAULT_A = `0x${"Aa".repeat(32)}` as Hex;
  const VAULT_B = `0x${"Bb".repeat(32)}` as Hex;
  const HEAD = 299_000n;

  function vaultData(status: number, claimExpiredUntil: bigint) {
    return {
      basic: { status },
      protocol: { verifiedAt: VERIFIED_AT, claimExpiredUntil },
    };
  }

  function renderGate(initialSuspects: readonly Hex[]) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    return renderHook(
      ({ suspects }: { suspects: readonly Hex[] }) =>
        useClaimExpiredWindowGate(suspects),
      { wrapper, initialProps: { suspects: initialSuspects } },
    );
  }

  beforeEach(() => {
    mockGetVaultData.mockReset();
    mockGetBlockNumber.mockReset();
    mockGetBlockNumber.mockResolvedValue(HEAD);
  });

  it("reads each suspect's window from chain, keyed by lowercased vault id", async () => {
    mockGetVaultData.mockResolvedValue(
      vaultData(OnChainBtcVaultStatus.EXPIRED, CLAIM_EXPIRED_UNTIL),
    );

    const { result } = renderGate([VAULT_A]);

    await waitFor(() =>
      expect(result.current.get(VAULT_A.toLowerCase())).toEqual({
        state: "open",
        blocksRemaining: Number(CLAIM_EXPIRED_UNTIL - HEAD),
      }),
    );
    expect(mockGetVaultData).toHaveBeenCalledWith(VAULT_A);
  });

  it("leaves a vault whose read failed unknown while the others resolve", async () => {
    mockGetVaultData.mockImplementation(async (id: Hex) => {
      if (id === VAULT_B) throw new Error("rpc down");
      return vaultData(OnChainBtcVaultStatus.EXPIRED, CLAIM_EXPIRED_UNTIL);
    });

    const { result } = renderGate([VAULT_A, VAULT_B]);

    await waitFor(() =>
      expect(result.current.has(VAULT_A.toLowerCase())).toBe(true),
    );
    expect(result.current.has(VAULT_B.toLowerCase())).toBe(false);
  });

  it("still reports a redeemed vault when the head cannot be read", async () => {
    mockGetBlockNumber.mockRejectedValue(new Error("rpc down"));
    mockGetVaultData.mockImplementation(async (id: Hex) =>
      id === VAULT_A
        ? vaultData(OnChainBtcVaultStatus.REDEEMED, CLAIM_EXPIRED_UNTIL)
        : vaultData(OnChainBtcVaultStatus.EXPIRED, CLAIM_EXPIRED_UNTIL),
    );

    const { result } = renderGate([VAULT_A, VAULT_B]);

    await waitFor(() =>
      expect(result.current.get(VAULT_A.toLowerCase())).toEqual({
        state: "redeemed",
      }),
    );
    // The expired vault's window needs the head, so it stays unknown.
    expect(result.current.has(VAULT_B.toLowerCase())).toBe(false);
  });

  it("keeps a known closed window while a changed suspect set is read", async () => {
    mockGetVaultData.mockResolvedValue(
      vaultData(OnChainBtcVaultStatus.EXPIRED, HEAD - 1n),
    );
    const { result, rerender } = renderGate([VAULT_A]);
    await waitFor(() =>
      expect(result.current.get(VAULT_A.toLowerCase())).toEqual({
        state: "closed",
      }),
    );

    // A second vault is swept: the new key's read has not answered yet.
    mockGetVaultData.mockImplementation(() => new Promise(() => {}));
    rerender({ suspects: [VAULT_A, VAULT_B] });

    expect(result.current.get(VAULT_A.toLowerCase())).toEqual({
      state: "closed",
    });
  });

  it("drops a carried-over window whose vault is no longer a suspect while the new set loads", async () => {
    mockGetVaultData.mockResolvedValue(
      vaultData(OnChainBtcVaultStatus.EXPIRED, CLAIM_EXPIRED_UNTIL),
    );
    const { result, rerender } = renderGate([VAULT_A]);
    await waitFor(() =>
      expect(result.current.has(VAULT_A.toLowerCase())).toBe(true),
    );

    // A was redeemed and B swept: the previous data still holds A, but the
    // live suspect set no longer does.
    mockGetVaultData.mockImplementation(() => new Promise(() => {}));
    rerender({ suspects: [VAULT_B] });

    expect(result.current.has(VAULT_A.toLowerCase())).toBe(false);
    expect(result.current.has(VAULT_B.toLowerCase())).toBe(false);
  });

  it("drops a window once its vault is no longer a suspect", async () => {
    mockGetVaultData.mockResolvedValue(
      vaultData(OnChainBtcVaultStatus.EXPIRED, CLAIM_EXPIRED_UNTIL),
    );
    const { result, rerender } = renderGate([VAULT_A]);
    await waitFor(() =>
      expect(result.current.has(VAULT_A.toLowerCase())).toBe(true),
    );

    rerender({ suspects: [] });

    expect(result.current.size).toBe(0);
  });
});
