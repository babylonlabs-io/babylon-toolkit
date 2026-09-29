/**
 * The VP auth pin follows the *current operation* key, deliberately — auth is a
 * per-operator server identity, not a per-vault binding (RFC-006 open question
 * 5). Documented on the module but untested, so nothing stopped a future reader
 * "correcting" it toward the genesis key and breaking auth for every vault of a
 * rotated provider.
 */

import type { Address, Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetCurrentVaultProviderOperationBtcKey = vi.hoisted(() => vi.fn());
const mockGetVaultProviderGenesisBtcPubKey = vi.hoisted(() => vi.fn());
const mockGetVaultKeyEpochs = vi.hoisted(() => vi.fn());
const mockGetVaultBasicInfo = vi.hoisted(() => vi.fn());

vi.mock("@/clients/eth-contract/sdk-readers", () => ({
  getVaultRegistryReader: () => ({
    getCurrentVaultProviderOperationBtcKey:
      mockGetCurrentVaultProviderOperationBtcKey,
    getVaultProviderGenesisBtcPubKey: mockGetVaultProviderGenesisBtcPubKey,
    getVaultKeyEpochs: mockGetVaultKeyEpochs,
    getVaultBasicInfo: mockGetVaultBasicInfo,
  }),
}));

import { resolveVpAuthPinnedPubkey } from "../vpAuthPinnedPubkey";

const VAULT_ID = `0x${"f".repeat(64)}` as Hex;
const VP_ADDRESS = `0x${"1".repeat(40)}` as Address;
const OTHER_VP_ADDRESS = `0x${"2".repeat(40)}` as Address;
const CURRENT_OPERATION_KEY = "a".repeat(64);
const GENESIS_KEY = "b".repeat(64);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentVaultProviderOperationBtcKey.mockResolvedValue(
    CURRENT_OPERATION_KEY,
  );
  mockGetVaultProviderGenesisBtcPubKey.mockResolvedValue(GENESIS_KEY);
  mockGetVaultBasicInfo.mockResolvedValue({ vaultProvider: VP_ADDRESS });
});

describe("resolveVpAuthPinnedPubkey", () => {
  it("returns the provider's current operation key", async () => {
    await expect(resolveVpAuthPinnedPubkey(VAULT_ID, VP_ADDRESS)).resolves.toBe(
      CURRENT_OPERATION_KEY,
    );

    expect(mockGetCurrentVaultProviderOperationBtcKey).toHaveBeenCalledWith(
      VP_ADDRESS,
    );
  });

  it("does not read the registration key or any frozen epoch", async () => {
    await resolveVpAuthPinnedPubkey(VAULT_ID, VP_ADDRESS);

    expect(mockGetVaultProviderGenesisBtcPubKey).not.toHaveBeenCalled();
    expect(mockGetVaultKeyEpochs).not.toHaveBeenCalled();
  });

  it("throws when the address is not the vault's on-chain provider", async () => {
    mockGetVaultBasicInfo.mockResolvedValue({
      vaultProvider: OTHER_VP_ADDRESS,
    });

    await expect(
      resolveVpAuthPinnedPubkey(VAULT_ID, VP_ADDRESS),
    ).rejects.toThrow(/Vault provider mismatch/);

    expect(mockGetVaultBasicInfo).toHaveBeenCalledWith(VAULT_ID);
    expect(mockGetCurrentVaultProviderOperationBtcKey).not.toHaveBeenCalled();
  });
});
