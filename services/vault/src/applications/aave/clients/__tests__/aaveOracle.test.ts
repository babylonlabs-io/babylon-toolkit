import {
  getOracleAddress as sdkGetOracleAddress,
  getReservesPrices as sdkGetReservesPrices,
  getReservesPricesSafe as sdkGetReservesPricesSafe,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import { describe, expect, it, vi } from "vitest";

import {
  getOracleAddress,
  getReservesPrices,
  getReservesPricesSafe,
} from "../aaveOracle";

// vitest hoists vi.mock above imports automatically.
vi.mock("@babylonlabs-io/ts-sdk/tbv/integrations/aave", () => ({
  getOracleAddress: vi.fn(),
  getReservesPrices: vi.fn(),
  getReservesPricesSafe: vi.fn(),
}));

const FAKE_CLIENT = { __id: "fake-public-client" } as const;
vi.mock("../../../../clients/eth-contract/client", () => ({
  ethClient: { getPublicClient: () => FAKE_CLIENT },
}));

const SPOKE = "0x0000000000000000000000000000000000000001" as const;
const ORACLE = "0x0000000000000000000000000000000000000002" as const;

describe("vault aaveOracle wrapper", () => {
  it("forwards getOracleAddress to the SDK with the injected client", async () => {
    vi.mocked(sdkGetOracleAddress).mockResolvedValueOnce(ORACLE);
    expect(await getOracleAddress(SPOKE)).toBe(ORACLE);
    expect(sdkGetOracleAddress).toHaveBeenCalledWith(FAKE_CLIENT, SPOKE);
  });

  it("forwards getReservesPrices", async () => {
    vi.mocked(sdkGetReservesPrices).mockResolvedValueOnce([8_000_000_000_000n]);
    expect(await getReservesPrices(ORACLE, [1n])).toEqual([8_000_000_000_000n]);
    expect(sdkGetReservesPrices).toHaveBeenCalledWith(FAKE_CLIENT, ORACLE, [
      1n,
    ]);
  });

  it("forwards getReservesPricesSafe", async () => {
    vi.mocked(sdkGetReservesPricesSafe).mockResolvedValueOnce([
      { reserveId: 1n, priceRaw: 100_000_000n, error: null },
    ]);
    const out = await getReservesPricesSafe(ORACLE, [1n]);
    expect(out[0]?.priceRaw).toBe(100_000_000n);
    expect(sdkGetReservesPricesSafe).toHaveBeenCalledWith(FAKE_CLIENT, ORACLE, [
      1n,
    ]);
  });
});
