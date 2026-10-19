import { describe, expect, it, vi } from "vitest";
import type { Address } from "viem";

import { resolveProtocolAddresses } from "../contract-address-resolver";

const REGISTRY = "0x000000000000000000000000000000000000beef" as Address;
const PROTOCOL_PARAMS = "0x1111111111111111111111111111111111111111" as Address;
const APPLICATION_REGISTRY =
  "0x2222222222222222222222222222222222222222" as Address;

describe("resolveProtocolAddresses", () => {
  it("reads the registry pointers at the given block", async () => {
    const multicall = vi.fn(async () => [PROTOCOL_PARAMS, APPLICATION_REGISTRY]);

    const addresses = await resolveProtocolAddresses(
      { multicall } as never,
      REGISTRY,
      123n,
    );

    expect(multicall).toHaveBeenCalledTimes(1);
    expect(multicall).toHaveBeenCalledWith(
      expect.objectContaining({ blockNumber: 123n }),
    );
    expect(addresses).toEqual({
      protocolParams: PROTOCOL_PARAMS,
      applicationRegistry: APPLICATION_REGISTRY,
    });
  });
});
