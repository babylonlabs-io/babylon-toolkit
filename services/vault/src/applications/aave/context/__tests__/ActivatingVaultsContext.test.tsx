import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ActivatingVaultsProvider,
  useActivatingVaults,
} from "../ActivatingVaultsContext";

const VAULT_A = ("0x" + "a".repeat(64)) as `0x${string}`;
const VAULT_B = ("0x" + "b".repeat(64)) as `0x${string}`;
// The provider auto-clears each entry after 90s (its internal backstop).
const OVERRIDE_TIMEOUT_MS = 90 * 1000;

function wrapper({ children }: { children: ReactNode }) {
  return <ActivatingVaultsProvider>{children}</ActivatingVaultsProvider>;
}

describe("ActivatingVaultsContext", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with no activating vaults", () => {
    const { result } = renderHook(() => useActivatingVaults(), { wrapper });
    expect(result.current.activatingVaults.size).toBe(0);
  });

  it("addActivatingVault records an entry keyed by lowercased vaultId", () => {
    const { result } = renderHook(() => useActivatingVaults(), { wrapper });
    act(() =>
      result.current.addActivatingVault({ vaultId: VAULT_A, amountBtc: 1 }),
    );
    expect(result.current.activatingVaults.get(VAULT_A.toLowerCase())).toEqual({
      vaultId: VAULT_A,
      amountBtc: 1,
    });
  });

  it("clearActivatingVault removes a single entry (case-insensitive)", () => {
    const { result } = renderHook(() => useActivatingVaults(), { wrapper });
    act(() => {
      result.current.addActivatingVault({ vaultId: VAULT_A, amountBtc: 1 });
      result.current.addActivatingVault({ vaultId: VAULT_B, amountBtc: 2 });
    });
    act(() => result.current.clearActivatingVault(VAULT_A.toUpperCase()));
    expect(result.current.activatingVaults.has(VAULT_A.toLowerCase())).toBe(
      false,
    );
    expect(result.current.activatingVaults.has(VAULT_B.toLowerCase())).toBe(
      true,
    );
  });

  it("auto-clears an entry after the backstop timeout", () => {
    const { result } = renderHook(() => useActivatingVaults(), { wrapper });
    act(() =>
      result.current.addActivatingVault({ vaultId: VAULT_A, amountBtc: 1 }),
    );

    act(() => vi.advanceTimersByTime(OVERRIDE_TIMEOUT_MS - 1));
    expect(result.current.activatingVaults.size).toBe(1);

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.activatingVaults.size).toBe(0);
  });

  it("throws when used outside the provider", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    expect(() => renderHook(() => useActivatingVaults())).toThrow(
      /within an ActivatingVaultsProvider/,
    );
    consoleError.mockRestore();
  });

  it("shares state across consumers under one provider (writer → reader boundary)", () => {
    // Guards the provider-boundary wiring: a writer (addActivatingVault) and a
    // separate reader must see the same state when both sit under a single
    // ActivatingVaultsProvider — the bug class this provider placement avoids.
    const { result } = renderHook(
      () => ({ writer: useActivatingVaults(), reader: useActivatingVaults() }),
      { wrapper },
    );

    act(() =>
      result.current.writer.addActivatingVault({
        vaultId: VAULT_A,
        amountBtc: 3,
      }),
    );

    expect(
      result.current.reader.activatingVaults.get(VAULT_A.toLowerCase()),
    ).toEqual({ vaultId: VAULT_A, amountBtc: 3 });
  });
});
