/**
 * useActiveVaultChainCheck — an indexer ACTIVE is not proof of activation.
 * The registry status replaces it when the chain still reports the vault
 * Pending or Verified, a failed read keeps the indexer's value, and a read
 * that has not settled is reported pending.
 */

import { OnChainBtcVaultStatus } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { type Hex, zeroAddress } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ContractStatus } from "@/models/peginStateMachine";

import { useActiveVaultChainCheck } from "../useActiveVaultChainCheck";

const mockGetVaultBasicInfo = vi.hoisted(() => vi.fn());
vi.mock("@/clients/eth-contract/sdk-readers", () => ({
  getVaultRegistryReader: () => ({
    getVaultBasicInfo: mockGetVaultBasicInfo,
  }),
}));

const DEPOSITOR = "0x000000000000000000000000000000000000dEaD";

// Mixed-case ids, as the indexer returns them; the result is keyed lowercase.
const VAULT_A = `0x${"Aa".repeat(32)}` as Hex;
const VAULT_B = `0x${"Bb".repeat(32)}` as Hex;
const VAULT_C = `0x${"Cc".repeat(32)}` as Hex;

function renderCheck(activeIds: readonly Hex[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return renderHook(({ ids }) => useActiveVaultChainCheck(ids), {
    wrapper,
    initialProps: { ids: activeIds },
  });
}

beforeEach(() => {
  mockGetVaultBasicInfo.mockReset();
});

describe("useActiveVaultChainCheck", () => {
  it("returns Verified for an indexer-ACTIVE vault the chain still reports Verified", async () => {
    mockGetVaultBasicInfo.mockImplementation(async (id: Hex) => ({
      depositor: DEPOSITOR,
      status:
        id === VAULT_A
          ? OnChainBtcVaultStatus.VERIFIED
          : OnChainBtcVaultStatus.ACTIVE,
    }));

    const { result } = renderCheck([VAULT_A, VAULT_B]);

    await waitFor(() =>
      expect(result.current.statuses.get(VAULT_A.toLowerCase())).toBe(
        ContractStatus.VERIFIED,
      ),
    );
    expect(result.current.statuses.has(VAULT_B.toLowerCase())).toBe(false);
  });

  it("returns Pending for an indexer-ACTIVE vault the chain still reports Pending", async () => {
    mockGetVaultBasicInfo.mockResolvedValue({
      depositor: DEPOSITOR,
      status: OnChainBtcVaultStatus.PENDING,
    });

    const { result } = renderCheck([VAULT_A]);

    await waitFor(() =>
      expect(result.current.statuses.get(VAULT_A.toLowerCase())).toBe(
        ContractStatus.PENDING,
      ),
    );
  });

  it("keeps the indexer status when the chain read fails or the record is empty", async () => {
    mockGetVaultBasicInfo.mockImplementation(async (id: Hex) => {
      if (id === VAULT_A) throw new Error("rpc down");
      if (id === VAULT_B) {
        return {
          depositor: zeroAddress,
          status: OnChainBtcVaultStatus.PENDING,
        };
      }
      return { depositor: DEPOSITOR, status: OnChainBtcVaultStatus.VERIFIED };
    });

    const { result } = renderCheck([VAULT_A, VAULT_B, VAULT_C]);

    await waitFor(() =>
      expect(result.current.statuses.has(VAULT_C.toLowerCase())).toBe(true),
    );
    expect(result.current.statuses.has(VAULT_A.toLowerCase())).toBe(false);
    expect(result.current.statuses.has(VAULT_B.toLowerCase())).toBe(false);
    expect(result.current.pendingIds.size).toBe(0);
  });

  it("does not read the chain when no vault is indexer-ACTIVE", () => {
    const { result } = renderCheck([]);

    expect(mockGetVaultBasicInfo).not.toHaveBeenCalled();
    expect(result.current.statuses.size).toBe(0);
    expect(result.current.pendingIds.size).toBe(0);
  });

  it("reports an id pending until its read settles", async () => {
    let resolveRead: (value: unknown) => void = () => {};
    mockGetVaultBasicInfo.mockReturnValue(
      new Promise((resolve) => {
        resolveRead = resolve;
      }),
    );

    const { result } = renderCheck([VAULT_A]);

    expect(result.current.pendingIds).toEqual(new Set([VAULT_A.toLowerCase()]));
    resolveRead({ depositor: DEPOSITOR, status: OnChainBtcVaultStatus.ACTIVE });
    await waitFor(() => expect(result.current.pendingIds.size).toBe(0));
  });

  it("keeps a refused vault's status while a new id set loads, and reports only the new id pending", async () => {
    mockGetVaultBasicInfo.mockResolvedValue({
      depositor: DEPOSITOR,
      status: OnChainBtcVaultStatus.VERIFIED,
    });
    const { result, rerender } = renderCheck([VAULT_A]);
    await waitFor(() =>
      expect(result.current.statuses.get(VAULT_A.toLowerCase())).toBe(
        ContractStatus.VERIFIED,
      ),
    );
    mockGetVaultBasicInfo.mockReturnValue(new Promise(() => {}));

    rerender({ ids: [VAULT_A, VAULT_B] });

    expect(result.current.statuses.get(VAULT_A.toLowerCase())).toBe(
      ContractStatus.VERIFIED,
    );
    expect(result.current.pendingIds).toEqual(new Set([VAULT_B.toLowerCase()]));
  });

  it("drops the status of a vault that left the indexer-ACTIVE set", async () => {
    mockGetVaultBasicInfo.mockResolvedValue({
      depositor: DEPOSITOR,
      status: OnChainBtcVaultStatus.VERIFIED,
    });
    const { result, rerender } = renderCheck([VAULT_A, VAULT_B]);
    await waitFor(() =>
      expect(result.current.statuses.has(VAULT_B.toLowerCase())).toBe(true),
    );
    mockGetVaultBasicInfo.mockReturnValue(new Promise(() => {}));

    rerender({ ids: [VAULT_A] });

    expect(result.current.statuses.has(VAULT_A.toLowerCase())).toBe(true);
    expect(result.current.statuses.has(VAULT_B.toLowerCase())).toBe(false);
  });
});
