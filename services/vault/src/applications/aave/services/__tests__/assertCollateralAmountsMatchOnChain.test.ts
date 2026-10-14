/**
 * Tests for the collateral amount guard: the per-vault amounts the user
 * reviewed must equal the `BTCVaultRegistry` amounts before a reorder is
 * signed. Guard A and Guard C compare vault IDs only, and `positionService`
 * checks only the set, the count and the sum, so a swapped pair of amounts
 * passes every one of them.
 */

import type { Address, Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getBtcVaultBasicInfoFromChain } from "@/clients/eth-contract/btc-vault-registry/query";

import {
  CollateralAmountMismatchError,
  CollateralRegistryReadError,
  assertCollateralAmountsMatchOnChain,
} from "../assertCollateralAmountsMatchOnChain";

vi.mock("@/clients/eth-contract/btc-vault-registry/query", () => ({
  getBtcVaultBasicInfoFromChain: vi.fn(),
}));

const mockGetBtcVaultBasicInfo = vi.mocked(getBtcVaultBasicInfoFromChain);

const ADAPTER = "0x000000000000000000000000000000000000ada9" as Address;
const OTHER_APP = "0x000000000000000000000000000000000000a1ce" as Address;
const VAULT_A =
  "0xaaaa000000000000000000000000000000000000000000000000000000000001" as Hex;
const VAULT_B =
  "0xbbbb000000000000000000000000000000000000000000000000000000000002" as Hex;

const STATUS_ACTIVE = 2;
const STATUS_REDEEMED = 3;

function activeInfo(amount: bigint, app: Address = ADAPTER) {
  return {
    amount,
    status: STATUS_ACTIVE,
    applicationEntryPoint: app,
  };
}

function basicInfoMap(
  entries: Array<[Hex, ReturnType<typeof activeInfo>]>,
): Map<Hex, ReturnType<typeof activeInfo>> {
  return new Map(entries.map(([id, info]) => [id.toLowerCase() as Hex, info]));
}

describe("assertCollateralAmountsMatchOnChain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves when every reviewed amount equals the registry amount", async () => {
    mockGetBtcVaultBasicInfo.mockResolvedValue(
      basicInfoMap([
        [VAULT_A, activeInfo(60_000_000n)],
        [VAULT_B, activeInfo(20_000_000n)],
      ]),
    );

    await expect(
      assertCollateralAmountsMatchOnChain(
        [
          { vaultId: VAULT_A, amountSats: 60_000_000n },
          { vaultId: VAULT_B, amountSats: 20_000_000n },
        ],
        ADAPTER,
      ),
    ).resolves.toBeUndefined();
    expect(mockGetBtcVaultBasicInfo).toHaveBeenCalledWith([VAULT_A, VAULT_B]);
  });

  it("rejects when two vaults' amounts are swapped and the total is unchanged", async () => {
    // The reported attack: the indexer shows A as 0.2 BTC and B as 0.6 BTC.
    // The vault-ID set, the row count and the total sum all still match.
    mockGetBtcVaultBasicInfo.mockResolvedValue(
      basicInfoMap([
        [VAULT_A, activeInfo(60_000_000n)],
        [VAULT_B, activeInfo(20_000_000n)],
      ]),
    );

    await expect(
      assertCollateralAmountsMatchOnChain(
        [
          { vaultId: VAULT_A, amountSats: 20_000_000n },
          { vaultId: VAULT_B, amountSats: 60_000_000n },
        ],
        ADAPTER,
      ),
    ).rejects.toBeInstanceOf(CollateralAmountMismatchError);
  });

  it("rejects when a vault is not in ACTIVE status", async () => {
    mockGetBtcVaultBasicInfo.mockResolvedValue(
      basicInfoMap([
        [VAULT_A, activeInfo(60_000_000n)],
        [
          VAULT_B,
          {
            amount: 20_000_000n,
            status: STATUS_REDEEMED,
            applicationEntryPoint: ADAPTER,
          },
        ],
      ]),
    );

    await expect(
      assertCollateralAmountsMatchOnChain(
        [
          { vaultId: VAULT_A, amountSats: 60_000_000n },
          { vaultId: VAULT_B, amountSats: 20_000_000n },
        ],
        ADAPTER,
      ),
    ).rejects.toBeInstanceOf(CollateralAmountMismatchError);
  });

  it("rejects when a vault is bound to another application", async () => {
    mockGetBtcVaultBasicInfo.mockResolvedValue(
      basicInfoMap([
        [VAULT_A, activeInfo(60_000_000n)],
        [VAULT_B, activeInfo(20_000_000n, OTHER_APP)],
      ]),
    );

    await expect(
      assertCollateralAmountsMatchOnChain(
        [
          { vaultId: VAULT_A, amountSats: 60_000_000n },
          { vaultId: VAULT_B, amountSats: 20_000_000n },
        ],
        ADAPTER,
      ),
    ).rejects.toBeInstanceOf(CollateralAmountMismatchError);
  });

  it("rejects when the registry omits a vault from its response", async () => {
    mockGetBtcVaultBasicInfo.mockResolvedValue(
      basicInfoMap([[VAULT_A, activeInfo(60_000_000n)]]),
    );

    await expect(
      assertCollateralAmountsMatchOnChain(
        [
          { vaultId: VAULT_A, amountSats: 60_000_000n },
          { vaultId: VAULT_B, amountSats: 20_000_000n },
        ],
        ADAPTER,
      ),
    ).rejects.toBeInstanceOf(CollateralAmountMismatchError);
  });

  it("rejects empty input without reading the registry", async () => {
    await expect(
      assertCollateralAmountsMatchOnChain([], ADAPTER),
    ).rejects.toBeInstanceOf(CollateralAmountMismatchError);
    expect(mockGetBtcVaultBasicInfo).not.toHaveBeenCalled();
  });

  it("refuses with CollateralRegistryReadError, not a mismatch, when the registry read fails", async () => {
    mockGetBtcVaultBasicInfo.mockRejectedValue(
      new Error("vault not registered on-chain"),
    );

    await expect(
      assertCollateralAmountsMatchOnChain(
        [{ vaultId: VAULT_A, amountSats: 60_000_000n }],
        ADAPTER,
      ),
    ).rejects.toBeInstanceOf(CollateralRegistryReadError);
  });
});
