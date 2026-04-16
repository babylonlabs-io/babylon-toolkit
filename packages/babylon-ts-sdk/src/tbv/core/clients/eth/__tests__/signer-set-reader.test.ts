import { describe, expect, it, vi } from "vitest";
import type { Address, Hex } from "viem";

import {
  ViemUniversalChallengerReader,
  ViemVaultKeeperReader,
} from "../signer-set-reader";

const MOCK_PROTOCOL_PARAMS_ADDRESS =
  "0x1111111111111111111111111111111111111111" as Address;
const MOCK_APP_REGISTRY_ADDRESS =
  "0x2222222222222222222222222222222222222222" as Address;
const MOCK_APP_ENTRY_POINT =
  "0x3333333333333333333333333333333333333333" as Address;

const MOCK_KEY_PAIRS = [
  {
    ethAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address,
    btcPubKey:
      "0xbbbb000000000000000000000000000000000000000000000000000000000000" as Hex,
  },
  {
    ethAddress: "0xcccccccccccccccccccccccccccccccccccccccc" as Address,
    btcPubKey:
      "0xdddd000000000000000000000000000000000000000000000000000000000000" as Hex,
  },
];

describe("ViemVaultKeeperReader", () => {
  function createMockPublicClient(overrides?: {
    keepers?: unknown;
    version?: unknown;
  }) {
    return {
      readContract: vi.fn(
        async ({
          functionName,
        }: {
          functionName: string;
          args?: unknown[];
        }) => {
          if (
            functionName === "getVaultKeepersByVersion" ||
            functionName === "getCurrentVaultKeepers"
          ) {
            return overrides?.keepers ?? MOCK_KEY_PAIRS;
          }
          if (functionName === "getCurrentVaultKeepersVersion") {
            return overrides?.version ?? 2;
          }
          throw new Error(`Unknown function: ${functionName}`);
        },
      ),
    };
  }

  it("returns vault keepers with correct field mapping", async () => {
    const publicClient = createMockPublicClient();
    const reader = new ViemVaultKeeperReader(
      publicClient as never,
      MOCK_APP_REGISTRY_ADDRESS,
    );

    const keepers = await reader.getCurrentVaultKeepers(MOCK_APP_ENTRY_POINT);

    expect(keepers).toHaveLength(2);
    expect(keepers[0].ethAddress).toBe(MOCK_KEY_PAIRS[0].ethAddress);
    expect(keepers[0].btcPubKey).toBe(MOCK_KEY_PAIRS[0].btcPubKey);
    expect(keepers[1].ethAddress).toBe(MOCK_KEY_PAIRS[1].ethAddress);
  });

  it("passes appEntryPoint and version to getVaultKeepersByVersion", async () => {
    const publicClient = createMockPublicClient();
    const reader = new ViemVaultKeeperReader(
      publicClient as never,
      MOCK_APP_REGISTRY_ADDRESS,
    );

    await reader.getVaultKeepersByVersion(MOCK_APP_ENTRY_POINT, 3);

    expect(publicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: MOCK_APP_REGISTRY_ADDRESS,
        functionName: "getVaultKeepersByVersion",
        args: [MOCK_APP_ENTRY_POINT, 3],
      }),
    );
  });

  it("returns empty array when no vault keepers exist", async () => {
    const publicClient = createMockPublicClient({ keepers: [] });
    const reader = new ViemVaultKeeperReader(
      publicClient as never,
      MOCK_APP_REGISTRY_ADDRESS,
    );

    const keepers = await reader.getCurrentVaultKeepers(MOCK_APP_ENTRY_POINT);

    expect(keepers).toEqual([]);
  });

  it("returns current vault keepers version", async () => {
    const publicClient = createMockPublicClient();
    const reader = new ViemVaultKeeperReader(
      publicClient as never,
      MOCK_APP_REGISTRY_ADDRESS,
    );

    const version = await reader.getCurrentVaultKeepersVersion(
      MOCK_APP_ENTRY_POINT,
    );

    expect(version).toBe(2);
  });
});

describe("ViemUniversalChallengerReader", () => {
  function createMockPublicClient(overrides?: {
    challengers?: unknown;
    version?: unknown;
  }) {
    return {
      readContract: vi.fn(
        async ({
          functionName,
        }: {
          functionName: string;
          args?: unknown[];
        }) => {
          if (
            functionName === "getUniversalChallengersByVersion" ||
            functionName === "getCurrentUniversalChallengers"
          ) {
            return overrides?.challengers ?? MOCK_KEY_PAIRS;
          }
          if (functionName === "latestUniversalChallengersVersion") {
            return overrides?.version ?? 1;
          }
          throw new Error(`Unknown function: ${functionName}`);
        },
      ),
    };
  }

  it("returns universal challengers with correct field mapping", async () => {
    const publicClient = createMockPublicClient();
    const reader = new ViemUniversalChallengerReader(
      publicClient as never,
      MOCK_PROTOCOL_PARAMS_ADDRESS,
    );

    const challengers = await reader.getCurrentUniversalChallengers();

    expect(challengers).toHaveLength(2);
    expect(challengers[0].ethAddress).toBe(MOCK_KEY_PAIRS[0].ethAddress);
    expect(challengers[0].btcPubKey).toBe(MOCK_KEY_PAIRS[0].btcPubKey);
  });

  it("passes version to getUniversalChallengersByVersion", async () => {
    const publicClient = createMockPublicClient();
    const reader = new ViemUniversalChallengerReader(
      publicClient as never,
      MOCK_PROTOCOL_PARAMS_ADDRESS,
    );

    await reader.getUniversalChallengersByVersion(5);

    expect(publicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: MOCK_PROTOCOL_PARAMS_ADDRESS,
        functionName: "getUniversalChallengersByVersion",
        args: [5],
      }),
    );
  });

  it("returns empty array when no universal challengers exist", async () => {
    const publicClient = createMockPublicClient({ challengers: [] });
    const reader = new ViemUniversalChallengerReader(
      publicClient as never,
      MOCK_PROTOCOL_PARAMS_ADDRESS,
    );

    const challengers = await reader.getCurrentUniversalChallengers();

    expect(challengers).toEqual([]);
  });

  it("returns latest universal challengers version", async () => {
    const publicClient = createMockPublicClient();
    const reader = new ViemUniversalChallengerReader(
      publicClient as never,
      MOCK_PROTOCOL_PARAMS_ADDRESS,
    );

    const version = await reader.getLatestUniversalChallengersVersion();

    expect(version).toBe(1);
  });
});
