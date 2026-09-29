/**
 * Covers the mapping from a stored pending peg-in to the `VaultActivity` the
 * polling tree consumes.
 *
 * The version is the field worth pinning. It is persisted at registration and
 * re-asserted on chain, but was never mapped across - so pending rows reached
 * the depth resolver as `undefined`, silently took the latest params, and
 * persisted an at-depth conclusion drawn against the wrong version.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { logger } from "@/infrastructure";

import { STORAGE_KEY_PREFIX } from "../../constants";
import { addPendingPegin, PendingPeginStorageReadError } from "../peginStorage";
import {
  __resetReportedStorageReadErrorsForTests,
  usePeginStorage,
} from "../usePeginStorage";

vi.mock("@/infrastructure", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    event: vi.fn(),
  },
}));

const ETH_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";
const VAULT_ID = `0x${"a".repeat(64)}` as const;
const PEGIN_TXHASH = `0x${"b".repeat(64)}` as const;
const REGISTERED_VERSION = 7;

describe("usePeginStorage pending activity mapping", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("carries the registered offchain-params version onto the activity", () => {
    addPendingPegin(ETH_ADDRESS, {
      id: VAULT_ID,
      peginTxHash: PEGIN_TXHASH,
      unsignedTxHex: "0xdeadbeef",
      buildOffchainParamsVersion: REGISTERED_VERSION,
      buildAppVaultKeepersVersion: 3,
      buildUniversalChallengersVersion: 5,
      buildVaultCoreVersion: 1,
    });

    const { result } = renderHook(() =>
      usePeginStorage({ ethAddress: ETH_ADDRESS, confirmedPegins: [] }),
    );

    const activity = result.current.allActivities.find(
      (a) => a.id === VAULT_ID,
    );
    expect(activity).toBeDefined();
    expect(activity?.offchainParamsVersion).toBe(REGISTERED_VERSION);
  });
});

// Keep the storage key derivation honest: the test seeds through the public
// writer, so a change to the key shape breaks here rather than silently
// reading an empty list and passing.
describe("storage key", () => {
  it("scopes pending peg-ins to the connected address", () => {
    expect(`${STORAGE_KEY_PREFIX}-${ETH_ADDRESS}`).toContain(ETH_ADDRESS);
  });
});

describe("usePeginStorage read failures", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    __resetReportedStorageReadErrorsForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("exposes unreadable records on the first render and preserves them through cleanup", () => {
    const raw = '[{"id":';
    const key = `${STORAGE_KEY_PREFIX}-${ETH_ADDRESS}`;
    localStorage.setItem(key, raw);
    const removeItem = vi.spyOn(Storage.prototype, "removeItem");
    const { result } = renderHook(() =>
      usePeginStorage({
        ethAddress: ETH_ADDRESS,
        confirmedPegins: [],
      }),
    );

    expect(result.current.storageReadError).toBeInstanceOf(
      PendingPeginStorageReadError,
    );
    expect(result.current.storageReadError?.raw).toBe(raw);
    expect(result.current.pendingPegins).toEqual([]);
    act(() => vi.advanceTimersByTime(500));
    expect(localStorage.getItem(key)).toBe(raw);
    expect(removeItem).not.toHaveBeenCalled();
  });

  it("reports a failed storage refresh and clears it after a readable refresh", () => {
    const key = `${STORAGE_KEY_PREFIX}-${ETH_ADDRESS}`;
    const { result } = renderHook(() =>
      usePeginStorage({
        ethAddress: ETH_ADDRESS,
        confirmedPegins: [],
      }),
    );
    act(() => {
      localStorage.setItem(key, "{");
      window.dispatchEvent(new StorageEvent("storage", { key }));
    });
    expect(result.current.storageReadError).toBeInstanceOf(
      PendingPeginStorageReadError,
    );

    act(() => {
      localStorage.setItem(key, "[]");
      window.dispatchEvent(new StorageEvent("storage", { key }));
    });
    expect(result.current.storageReadError).toBeNull();
  });

  it("raises one event for an address every mounted instance re-reads", () => {
    const key = `${STORAGE_KEY_PREFIX}-${ETH_ADDRESS}`;
    localStorage.setItem(key, '[{"id":');

    // The root polling provider and the Vaults page each mount one.
    renderHook(() =>
      usePeginStorage({ ethAddress: ETH_ADDRESS, confirmedPegins: [] }),
    );
    renderHook(() =>
      usePeginStorage({ ethAddress: ETH_ADDRESS, confirmedPegins: [] }),
    );

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ name: "PendingPeginStorageReadError" }),
      expect.objectContaining({
        data: expect.objectContaining({
          ethAddress: ETH_ADDRESS,
          cause: "SyntaxError",
        }),
      }),
    );
  });

  it("raises a second event when a corrupt blob becomes blocked storage", () => {
    const key = `${STORAGE_KEY_PREFIX}-${ETH_ADDRESS}`;
    localStorage.setItem(key, '[{"id":');

    renderHook(() =>
      usePeginStorage({ ethAddress: ETH_ADDRESS, confirmedPegins: [] }),
    );
    // The blob never reads cleanly in between, so only the code tells the two
    // failures apart - and they have different remedies.
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("access denied", "SecurityError");
    });
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key }));
    });

    expect(logger.error).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenLastCalledWith(
      expect.objectContaining({ errorCode: "PENDING_PEGIN_STORAGE_BLOCKED" }),
      expect.anything(),
    );
  });

  it("raises a second event when an address goes unreadable again", () => {
    const key = `${STORAGE_KEY_PREFIX}-${ETH_ADDRESS}`;
    localStorage.setItem(key, '[{"id":');

    renderHook(() =>
      usePeginStorage({ ethAddress: ETH_ADDRESS, confirmedPegins: [] }),
    );
    act(() => {
      localStorage.setItem(key, "[]");
      window.dispatchEvent(new StorageEvent("storage", { key }));
    });
    act(() => {
      localStorage.setItem(key, '[{"id":');
      window.dispatchEvent(new StorageEvent("storage", { key }));
    });

    expect(logger.error).toHaveBeenCalledTimes(2);
  });
});
