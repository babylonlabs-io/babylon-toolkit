/** Both VP token-subject pins come from the vault's frozen VP epoch. */

import type { Address, Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetVaultProviderOperationBtcKeyAtEpoch = vi.hoisted(() => vi.fn());
const mockGetVaultKeyEpochs = vi.hoisted(() => vi.fn());
const mockGetVaultBasicInfo = vi.hoisted(() => vi.fn());

vi.mock("@/clients/eth-contract/sdk-readers", () => ({
  getVaultRegistryReader: () => ({
    getVaultProviderOperationBtcKeyAtEpoch:
      mockGetVaultProviderOperationBtcKeyAtEpoch,
    getVaultKeyEpochs: mockGetVaultKeyEpochs,
    getVaultBasicInfo: mockGetVaultBasicInfo,
  }),
}));

import { resolveVpAuthPins } from "../vpAuthPinnedPubkey";

const VAULT_ID = `0x${"f".repeat(64)}` as Hex;
const VP_ADDRESS = `0x${"1".repeat(40)}` as Address;
const OTHER_VP_ADDRESS = `0x${"2".repeat(40)}` as Address;
const FROZEN_OPERATION_KEY = "b".repeat(64);
const FROZEN_EPOCH = 17n;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetVaultProviderOperationBtcKeyAtEpoch.mockResolvedValue(
    FROZEN_OPERATION_KEY,
  );
  mockGetVaultKeyEpochs.mockResolvedValue({
    vpKeyEpoch: FROZEN_EPOCH,
    appKeeperKeyEpoch: 18n,
    ucKeyEpoch: 19n,
  });
  mockGetVaultBasicInfo.mockResolvedValue({ vaultProvider: VP_ADDRESS });
});

describe("resolveVpAuthPins", () => {
  it("pins both token subjects to the operation key frozen at the vault's VP epoch", async () => {
    await expect(resolveVpAuthPins(VP_ADDRESS, VAULT_ID)).resolves.toEqual({
      pinnedServerPubkey: FROZEN_OPERATION_KEY,
      grpcPinnedServerPubkey: FROZEN_OPERATION_KEY,
      grpcKeyEpoch: FROZEN_EPOCH,
    });
    expect(mockGetVaultKeyEpochs).toHaveBeenCalledWith(VAULT_ID);
    expect(mockGetVaultProviderOperationBtcKeyAtEpoch).toHaveBeenCalledWith(
      VP_ADDRESS,
      FROZEN_EPOCH,
    );
  });

  it("throws before any key read when the address is not the vault's on-chain provider", async () => {
    mockGetVaultBasicInfo.mockResolvedValue({
      vaultProvider: OTHER_VP_ADDRESS,
    });

    await expect(resolveVpAuthPins(VP_ADDRESS, VAULT_ID)).rejects.toThrow(
      /Vault provider mismatch/,
    );

    expect(mockGetVaultBasicInfo).toHaveBeenCalledWith(VAULT_ID);
    expect(mockGetVaultKeyEpochs).not.toHaveBeenCalled();
    expect(mockGetVaultProviderOperationBtcKeyAtEpoch).not.toHaveBeenCalled();
  });
});
