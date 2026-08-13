/**
 * The VP auth pin follows the *current operation* key, deliberately — auth is a
 * per-operator server identity, not a per-vault binding (RFC-006 open question
 * 5). Documented on the module but untested, so nothing stopped a future reader
 * "correcting" it toward the genesis key and breaking auth for every vault of a
 * rotated provider.
 */

import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetCurrentVaultProviderOperationBtcKey = vi.hoisted(() => vi.fn());
const mockGetVaultProviderGenesisBtcPubKey = vi.hoisted(() => vi.fn());
const mockGetVaultKeyEpochs = vi.hoisted(() => vi.fn());

vi.mock("@/clients/eth-contract/sdk-readers", () => ({
  getVaultRegistryReader: () => ({
    getCurrentVaultProviderOperationBtcKey:
      mockGetCurrentVaultProviderOperationBtcKey,
    getVaultProviderGenesisBtcPubKey: mockGetVaultProviderGenesisBtcPubKey,
    getVaultKeyEpochs: mockGetVaultKeyEpochs,
  }),
}));

import { resolveVpAuthPinnedPubkey } from "../vpAuthPinnedPubkey";

const VP_ADDRESS = `0x${"1".repeat(40)}` as Address;
const CURRENT_OPERATION_KEY = "a".repeat(64);
const GENESIS_KEY = "b".repeat(64);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentVaultProviderOperationBtcKey.mockResolvedValue(
    CURRENT_OPERATION_KEY,
  );
  mockGetVaultProviderGenesisBtcPubKey.mockResolvedValue(GENESIS_KEY);
});

describe("resolveVpAuthPinnedPubkey", () => {
  it("returns the provider's current operation key", async () => {
    await expect(resolveVpAuthPinnedPubkey(VP_ADDRESS)).resolves.toBe(
      CURRENT_OPERATION_KEY,
    );

    expect(mockGetCurrentVaultProviderOperationBtcKey).toHaveBeenCalledWith(
      VP_ADDRESS,
    );
  });

  it("does not read the registration key or any frozen epoch", async () => {
    await resolveVpAuthPinnedPubkey(VP_ADDRESS);

    expect(mockGetVaultProviderGenesisBtcPubKey).not.toHaveBeenCalled();
    expect(mockGetVaultKeyEpochs).not.toHaveBeenCalled();
  });
});
