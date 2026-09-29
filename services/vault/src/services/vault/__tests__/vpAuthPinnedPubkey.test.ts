/** Subject-specific auth pins across an RFC-006 operation-key rotation. */

import type { Address, Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetCurrentVaultProviderOperationBtcKey = vi.hoisted(() => vi.fn());
const mockGetVaultProviderOperationBtcKeyAtEpoch = vi.hoisted(() => vi.fn());
const mockGetVaultKeyEpochs = vi.hoisted(() => vi.fn());
const mockGetVaultBasicInfo = vi.hoisted(() => vi.fn());

vi.mock("@/clients/eth-contract/sdk-readers", () => ({
  getVaultRegistryReader: () => ({
    getCurrentVaultProviderOperationBtcKey:
      mockGetCurrentVaultProviderOperationBtcKey,
    getVaultProviderOperationBtcKeyAtEpoch:
      mockGetVaultProviderOperationBtcKeyAtEpoch,
    getVaultKeyEpochs: mockGetVaultKeyEpochs,
    getVaultBasicInfo: mockGetVaultBasicInfo,
  }),
}));

import {
  refreshVpJsonRpcPinnedPubkey,
  resolveVpAuthPins,
} from "../vpAuthPinnedPubkey";

const VAULT_ID = `0x${"f".repeat(64)}` as Hex;
const VP_ADDRESS = `0x${"1".repeat(40)}` as Address;
const OTHER_VP_ADDRESS = `0x${"2".repeat(40)}` as Address;
const CURRENT_OPERATION_KEY = "a".repeat(64);
const FROZEN_OPERATION_KEY = "b".repeat(64);
const FROZEN_EPOCH = 17n;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentVaultProviderOperationBtcKey.mockResolvedValue(
    CURRENT_OPERATION_KEY,
  );
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
  it("uses the live key for JSON-RPC and the vault's frozen key for gRPC", async () => {
    await expect(resolveVpAuthPins(VP_ADDRESS, VAULT_ID)).resolves.toEqual({
      pinnedServerPubkey: CURRENT_OPERATION_KEY,
      grpcPinnedServerPubkey: FROZEN_OPERATION_KEY,
      grpcKeyEpoch: FROZEN_EPOCH,
    });

    expect(mockGetCurrentVaultProviderOperationBtcKey).toHaveBeenCalledWith(
      VP_ADDRESS,
    );
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
    expect(mockGetCurrentVaultProviderOperationBtcKey).not.toHaveBeenCalled();
    expect(mockGetVaultProviderOperationBtcKeyAtEpoch).not.toHaveBeenCalled();
  });

  it("refreshes only the live JSON-RPC key", async () => {
    await expect(refreshVpJsonRpcPinnedPubkey(VP_ADDRESS)).resolves.toBe(
      CURRENT_OPERATION_KEY,
    );

    expect(mockGetCurrentVaultProviderOperationBtcKey).toHaveBeenCalledWith(
      VP_ADDRESS,
    );
    expect(mockGetVaultKeyEpochs).not.toHaveBeenCalled();
    expect(mockGetVaultProviderOperationBtcKeyAtEpoch).not.toHaveBeenCalled();
  });
});
