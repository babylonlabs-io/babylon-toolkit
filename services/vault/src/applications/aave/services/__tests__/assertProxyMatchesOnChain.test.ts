/**
 * Tests for the F8 proxy-integrity guard.
 *
 * `assertProxyMatchesOnChain` resolves the user's proxy from the env-pinned
 * adapter (`getPosition`) and fails closed if it disagrees with the
 * indexer-supplied proxy. This is what prevents a compromised indexer from
 * corrupting live risk figures / the full-repay amount by swapping in a proxy
 * with less debt or healthier collateral.
 */

import { getPosition } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ProxyMismatchError,
  _resetProxyCacheForTests,
  assertProxyMatchesOnChain,
} from "../assertProxyMatchesOnChain";

vi.mock("@/clients/eth-contract/client", () => ({
  ethClient: {
    getPublicClient: vi.fn(() => ({ __mockPublicClient: true })),
  },
}));

vi.mock("@babylonlabs-io/ts-sdk/tbv/integrations/aave", async () => {
  const actual = await vi.importActual<
    typeof import("@babylonlabs-io/ts-sdk/tbv/integrations/aave")
  >("@babylonlabs-io/ts-sdk/tbv/integrations/aave");
  return {
    ...actual,
    getPosition: vi.fn(),
  };
});

const mockGetPosition = vi.mocked(getPosition);

const ADAPTER = ("0x" + "a".repeat(40)) as Address;
const USER = ("0x" + "b".repeat(40)) as Address;
// Checksummed on-chain proxy (mixed case) to exercise case-insensitive compare.
const ONCHAIN_PROXY = "0xAbC0000000000000000000000000000000000123" as Address;
const ATTACKER_PROXY = ("0x" + "e".repeat(40)) as Address;

function onChainPosition(proxyContract: Address) {
  return {
    proxyContract,
    vaultIds: [],
    totalCollateralBTC: 0n,
  };
}

describe("assertProxyMatchesOnChain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetProxyCacheForTests();
  });

  it("returns the on-chain proxy when the indexer proxy matches", async () => {
    mockGetPosition.mockResolvedValue(onChainPosition(ONCHAIN_PROXY));

    const result = await assertProxyMatchesOnChain(
      ADAPTER,
      USER,
      ONCHAIN_PROXY,
    );

    expect(result).toBe(ONCHAIN_PROXY);
    expect(mockGetPosition).toHaveBeenCalledWith(
      { __mockPublicClient: true },
      ADAPTER,
      USER,
    );
  });

  it("matches case-insensitively (checksummed on-chain vs lowercase indexer)", async () => {
    mockGetPosition.mockResolvedValue(onChainPosition(ONCHAIN_PROXY));

    const result = await assertProxyMatchesOnChain(
      ADAPTER,
      USER,
      ONCHAIN_PROXY.toLowerCase() as Address,
    );

    // Returns the on-chain (checksummed) form, not the lowercase indexer input.
    expect(result).toBe(ONCHAIN_PROXY);
  });

  it("throws when the indexer proxy is an attacker's healthier proxy", async () => {
    mockGetPosition.mockResolvedValue(onChainPosition(ONCHAIN_PROXY));

    await expect(
      assertProxyMatchesOnChain(ADAPTER, USER, ATTACKER_PROXY),
    ).rejects.toBeInstanceOf(ProxyMismatchError);
  });

  it("throws (fail closed) when on-chain has no position but the indexer supplied a proxy", async () => {
    mockGetPosition.mockResolvedValue(null);

    await expect(
      assertProxyMatchesOnChain(ADAPTER, USER, ONCHAIN_PROXY),
    ).rejects.toBeInstanceOf(ProxyMismatchError);
  });

  it("propagates RPC failures and does not poison the cache (next call retries)", async () => {
    mockGetPosition.mockRejectedValueOnce(new Error("RPC down"));

    await expect(
      assertProxyMatchesOnChain(ADAPTER, USER, ONCHAIN_PROXY),
    ).rejects.toThrow("RPC down");

    // Cache was not poisoned: a subsequent call re-reads and succeeds.
    mockGetPosition.mockResolvedValue(onChainPosition(ONCHAIN_PROXY));
    const result = await assertProxyMatchesOnChain(
      ADAPTER,
      USER,
      ONCHAIN_PROXY,
    );
    expect(result).toBe(ONCHAIN_PROXY);
    expect(mockGetPosition).toHaveBeenCalledTimes(2);
  });

  it("dedupes a resolved proxy per user (single RPC across repeated calls)", async () => {
    mockGetPosition.mockResolvedValue(onChainPosition(ONCHAIN_PROXY));

    await assertProxyMatchesOnChain(ADAPTER, USER, ONCHAIN_PROXY);
    await assertProxyMatchesOnChain(ADAPTER, USER, ONCHAIN_PROXY);

    expect(mockGetPosition).toHaveBeenCalledTimes(1);
  });
});
