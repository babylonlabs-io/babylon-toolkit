import { describe, expect, it } from "vitest";

import { validateTBVProtocolParams } from "../protocol-params-validation";
import type { TBVProtocolParams } from "../types";

describe("validateTBVProtocolParams", () => {
  it("rejects a negative maxPegInAmount", () => {
    const params: TBVProtocolParams = {
      minimumPegInAmount: 100000n,
      maxPegInAmount: -1n,
      pegInAckTimeout: 7200n,
      pegInActivationTimeout: 14400n,
      maxHtlcOutputCount: 5,
      expiredPegInGraceBlocks: 100n,
      maxFundingInputCount: 20,
      minActivationGas: 5_000_000n,
    };

    expect(() => validateTBVProtocolParams(params)).toThrow(
      /maxPegInAmount \(-1\) must be >= minimumPegInAmount \(100000\)/,
    );
  });
});
