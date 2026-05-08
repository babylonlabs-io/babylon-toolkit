/**
 * Tests for the SDK-readers cache (TTL, per-chain keying, dedupe,
 * stale-while-revalidate). The new factory replaced the old per-chain
 * `protocolParamsAddressCache` in `protocol-params/query.ts` and these
 * tests carry the cache-semantics coverage forward.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetChainId = vi.fn<() => Promise<number>>();
const mockPublicClient = {
  getChainId: mockGetChainId,
  // chain.id is read by the sync getVaultRegistryReader.
  chain: { id: 0 } as { id: number | undefined },
};

vi.mock("../client", () => ({
  ethClient: {
    getPublicClient: vi.fn(() => mockPublicClient),
  },
}));

const mockResolveProtocolAddresses = vi.fn();
const mockProtocolParamsReaderCtor = vi.fn();
const mockVaultKeeperReaderCtor = vi.fn();
const mockUniversalChallengerReaderCtor = vi.fn();
const mockVaultRegistryReaderCtor = vi.fn();

vi.mock("@babylonlabs-io/ts-sdk/tbv/core/clients", () => {
  // Constructable classes must be declared inside the factory because
  // `vi.mock` is hoisted above outer-scope declarations.
  class MockProtocolParamsReader {
    args: unknown[];
    kind = "protocol-params" as const;
    constructor(...args: unknown[]) {
      mockProtocolParamsReaderCtor(...args);
      this.args = args;
    }
  }
  class MockVaultKeeperReader {
    args: unknown[];
    kind = "vault-keeper" as const;
    constructor(...args: unknown[]) {
      mockVaultKeeperReaderCtor(...args);
      this.args = args;
    }
  }
  class MockUniversalChallengerReader {
    args: unknown[];
    kind = "universal-challenger" as const;
    constructor(...args: unknown[]) {
      mockUniversalChallengerReaderCtor(...args);
      this.args = args;
    }
  }
  class MockVaultRegistryReader {
    args: unknown[];
    kind = "vault-registry" as const;
    constructor(...args: unknown[]) {
      mockVaultRegistryReaderCtor(...args);
      this.args = args;
    }
  }

  return {
    resolveProtocolAddresses: (...args: unknown[]) =>
      mockResolveProtocolAddresses(...args),
    ViemProtocolParamsReader: MockProtocolParamsReader,
    ViemVaultKeeperReader: MockVaultKeeperReader,
    ViemUniversalChallengerReader: MockUniversalChallengerReader,
    ViemVaultRegistryReader: MockVaultRegistryReader,
  };
});

vi.mock("../../../config/contracts", () => ({
  CONTRACTS: {
    BTC_VAULT_REGISTRY: "0x000000000000000000000000000000000000beef",
  },
}));

import {
  _resetSdkReadersCacheForTests,
  getProtocolParamsReader,
  getVaultRegistryReader,
} from "../sdk-readers";

const ADDRESSES_A = {
  protocolParams: "0x000000000000000000000000000000000000aaaa",
  applicationRegistry: "0x000000000000000000000000000000000000bbbb",
};
const ADDRESSES_B = {
  protocolParams: "0x000000000000000000000000000000000000cccc",
  applicationRegistry: "0x000000000000000000000000000000000000dddd",
};

describe("sdk-readers", () => {
  beforeEach(() => {
    _resetSdkReadersCacheForTests();
    vi.clearAllMocks();
    mockGetChainId.mockResolvedValue(1);
    mockResolveProtocolAddresses.mockResolvedValue(ADDRESSES_A);
    mockPublicClient.chain = { id: 1 };
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("getProtocolParamsReader (TTL + per-chain + dedupe)", () => {
    it("caches the resolved reader within the TTL window", async () => {
      await getProtocolParamsReader();
      await getProtocolParamsReader();

      // Resolve called once across two calls inside TTL.
      expect(mockResolveProtocolAddresses).toHaveBeenCalledTimes(1);
    });

    it("re-resolves after the TTL expires", async () => {
      await getProtocolParamsReader();
      // Advance past the 5-min TTL.
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);

      mockResolveProtocolAddresses.mockResolvedValueOnce(ADDRESSES_B);
      await getProtocolParamsReader();

      expect(mockResolveProtocolAddresses).toHaveBeenCalledTimes(2);
    });

    it("keys the cache per chain id (network switch resolves fresh)", async () => {
      mockGetChainId.mockResolvedValueOnce(1);
      await getProtocolParamsReader();

      mockGetChainId.mockResolvedValueOnce(2);
      mockResolveProtocolAddresses.mockResolvedValueOnce(ADDRESSES_B);
      await getProtocolParamsReader();

      expect(mockResolveProtocolAddresses).toHaveBeenCalledTimes(2);
      // First chain's reader was constructed against protocolParams A,
      // second chain's against B.
      expect(mockProtocolParamsReaderCtor).toHaveBeenNthCalledWith(
        1,
        mockPublicClient,
        ADDRESSES_A.protocolParams,
      );
      expect(mockProtocolParamsReaderCtor).toHaveBeenNthCalledWith(
        2,
        mockPublicClient,
        ADDRESSES_B.protocolParams,
      );
    });

    it("dedupes concurrent first callers per chain to a single resolve", async () => {
      let resolveAddresses: (v: typeof ADDRESSES_A) => void = () => {};
      mockResolveProtocolAddresses.mockReturnValueOnce(
        new Promise((res) => {
          resolveAddresses = res;
        }),
      );

      const p1 = getProtocolParamsReader();
      const p2 = getProtocolParamsReader();

      resolveAddresses(ADDRESSES_A);
      const [r1, r2] = await Promise.all([p1, p2]);

      expect(r1).toBe(r2);
      expect(mockResolveProtocolAddresses).toHaveBeenCalledTimes(1);
    });

    it("falls back to the stale cached reader when re-resolve fails after TTL", async () => {
      await getProtocolParamsReader();
      const constructorCallsAfterFirst =
        mockProtocolParamsReaderCtor.mock.calls.length;

      vi.advanceTimersByTime(5 * 60 * 1000 + 1);
      mockResolveProtocolAddresses.mockRejectedValueOnce(new Error("rpc down"));

      // Should not throw; falls back to the cached reader.
      await expect(getProtocolParamsReader()).resolves.toBeDefined();
      // No new reader instances were constructed during the failed re-resolve.
      expect(mockProtocolParamsReaderCtor.mock.calls.length).toBe(
        constructorCallsAfterFirst,
      );
    });

    it("does not retry resolve on every call during a sustained outage", async () => {
      // Prime the cache, then expire it.
      await getProtocolParamsReader();
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);

      // First post-TTL call hits the failing RPC and falls back to stale.
      mockResolveProtocolAddresses.mockRejectedValueOnce(new Error("rpc down"));
      await getProtocolParamsReader();
      const resolveCallsAfterFallback =
        mockResolveProtocolAddresses.mock.calls.length;

      // Subsequent calls within the TTL window must NOT re-attempt
      // the resolve — otherwise an outage would cause one chain RPC
      // call per consumer per render.
      await getProtocolParamsReader();
      await getProtocolParamsReader();
      expect(mockResolveProtocolAddresses.mock.calls.length).toBe(
        resolveCallsAfterFallback,
      );
    });

    it("propagates the resolve error on the very first call (no cache to fall back to)", async () => {
      mockResolveProtocolAddresses.mockRejectedValueOnce(new Error("rpc down"));

      await expect(getProtocolParamsReader()).rejects.toThrow("rpc down");
    });
  });

  describe("getVaultRegistryReader (sync, per-chain)", () => {
    it("returns the same instance for the same chain id", () => {
      mockPublicClient.chain = { id: 1 };
      const a = getVaultRegistryReader();
      const b = getVaultRegistryReader();
      expect(a).toBe(b);
      expect(mockVaultRegistryReaderCtor).toHaveBeenCalledTimes(1);
    });

    it("returns a fresh instance after a chain switch", () => {
      mockPublicClient.chain = { id: 1 };
      const a = getVaultRegistryReader();

      mockPublicClient.chain = { id: 2 };
      const b = getVaultRegistryReader();

      expect(a).not.toBe(b);
      expect(mockVaultRegistryReaderCtor).toHaveBeenCalledTimes(2);
    });

    it("falls back to a chainId=0 keyed instance when the public client has no chain pinned", () => {
      mockPublicClient.chain = { id: undefined };
      const a = getVaultRegistryReader();
      const b = getVaultRegistryReader();
      expect(a).toBe(b);
    });
  });
});
