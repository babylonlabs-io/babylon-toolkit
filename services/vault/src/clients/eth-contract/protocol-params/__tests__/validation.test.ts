import { describe, expect, it } from "vitest";

import type {
  PegInConfiguration,
  TBVProtocolParams,
  VersionedOffchainParams,
} from "../query";
import {
  validateOffchainParams,
  validatePegInConfiguration,
  validateTBVProtocolParams,
} from "../validation";

function validOffchainParams(
  overrides: Partial<VersionedOffchainParams> = {},
): VersionedOffchainParams {
  return {
    timelockAssert: 150n,
    timelockChallengeAssert: 300n,
    securityCouncilKeys: ["0xaa", "0xbb", "0xcc"],
    councilQuorum: 2,
    feeRate: 1000n,
    babeTotalInstances: 3,
    babeInstancesToFinalize: 2,
    minVpCommissionBps: 500,
    tRefund: 144,
    tStale: 288,
    minPeginFeeRate: 1n,
    ...overrides,
  };
}

function validPegInConfig(
  overrides: Partial<PegInConfiguration> = {},
  offchainOverrides: Partial<VersionedOffchainParams> = {},
): PegInConfiguration {
  return {
    minimumPegInAmount: 100_000n,
    maxPegInAmount: 10_000_000n,
    pegInAckTimeout: 100n,
    pegInActivationTimeout: 200n,
    timelockPegin: 150,
    timelockRefund: 144,
    minVpCommissionBps: 500,
    offchainParams: validOffchainParams(offchainOverrides),
    ...overrides,
  };
}

describe("validateOffchainParams", () => {
  it("accepts valid offchain params", () => {
    expect(() => validateOffchainParams(validOffchainParams())).not.toThrow();
  });

  it("rejects timelockAssert of zero", () => {
    expect(() =>
      validateOffchainParams(validOffchainParams({ timelockAssert: 0n })),
    ).toThrow(/timelockAssert must be positive/);
  });

  it("rejects timelockAssert exceeding uint16 max", () => {
    expect(() =>
      validateOffchainParams(validOffchainParams({ timelockAssert: 65536n })),
    ).toThrow(/exceeds uint16 max/);
  });

  it("accepts timelockAssert at uint16 max boundary", () => {
    expect(() =>
      validateOffchainParams(validOffchainParams({ timelockAssert: 65535n })),
    ).not.toThrow();
  });

  it("rejects timelockChallengeAssert of zero", () => {
    expect(() =>
      validateOffchainParams(
        validOffchainParams({ timelockChallengeAssert: 0n }),
      ),
    ).toThrow(/timelockChallengeAssert must be positive/);
  });

  it("rejects tRefund of zero", () => {
    expect(() =>
      validateOffchainParams(validOffchainParams({ tRefund: 0 })),
    ).toThrow(/tRefund must be positive/);
  });

  it("rejects tStale of zero", () => {
    expect(() =>
      validateOffchainParams(validOffchainParams({ tStale: 0 })),
    ).toThrow(/tStale must be positive/);
  });

  it("rejects empty securityCouncilKeys", () => {
    expect(() =>
      validateOffchainParams(
        validOffchainParams({ securityCouncilKeys: [], councilQuorum: 0 }),
      ),
    ).toThrow(/securityCouncilKeys must not be empty/);
  });

  it("rejects councilQuorum of zero", () => {
    expect(() =>
      validateOffchainParams(validOffchainParams({ councilQuorum: 0 })),
    ).toThrow(/councilQuorum must be positive/);
  });

  it("rejects councilQuorum exceeding securityCouncilKeys count", () => {
    expect(() =>
      validateOffchainParams(
        validOffchainParams({
          securityCouncilKeys: ["0xaa", "0xbb"],
          councilQuorum: 3,
        }),
      ),
    ).toThrow(/councilQuorum \(3\) exceeds securityCouncilKeys count \(2\)/);
  });

  it("rejects feeRate of zero", () => {
    expect(() =>
      validateOffchainParams(validOffchainParams({ feeRate: 0n })),
    ).toThrow(/feeRate must be positive/);
  });

  it("rejects minPeginFeeRate of zero", () => {
    expect(() =>
      validateOffchainParams(validOffchainParams({ minPeginFeeRate: 0n })),
    ).toThrow(/minPeginFeeRate must be positive/);
  });

  it("rejects babeTotalInstances of zero", () => {
    expect(() =>
      validateOffchainParams(
        validOffchainParams({
          babeTotalInstances: 0,
          babeInstancesToFinalize: 0,
        }),
      ),
    ).toThrow(/babeTotalInstances must be positive/);
  });

  it("rejects babeInstancesToFinalize exceeding babeTotalInstances", () => {
    expect(() =>
      validateOffchainParams(
        validOffchainParams({
          babeTotalInstances: 2,
          babeInstancesToFinalize: 3,
        }),
      ),
    ).toThrow(/babeInstancesToFinalize \(3\) exceeds babeTotalInstances \(2\)/);
  });

  it("rejects minVpCommissionBps above 10000", () => {
    expect(() =>
      validateOffchainParams(
        validOffchainParams({ minVpCommissionBps: 10001 }),
      ),
    ).toThrow(/minVpCommissionBps must be in \[0, 10000\]/);
  });

  it("accepts minVpCommissionBps at boundary values", () => {
    expect(() =>
      validateOffchainParams(validOffchainParams({ minVpCommissionBps: 0 })),
    ).not.toThrow();
    expect(() =>
      validateOffchainParams(
        validOffchainParams({ minVpCommissionBps: 10000 }),
      ),
    ).not.toThrow();
  });

  it("collects multiple errors into a single message", () => {
    expect(() =>
      validateOffchainParams(
        validOffchainParams({
          timelockAssert: 0n,
          councilQuorum: 0,
          feeRate: 0n,
        }),
      ),
    ).toThrow(/timelockAssert.*councilQuorum.*feeRate/s);
  });
});

function validTBVParams(
  overrides: Partial<TBVProtocolParams> = {},
): TBVProtocolParams {
  return {
    minimumPegInAmount: 100_000n,
    maxPegInAmount: 10_000_000n,
    pegInAckTimeout: 100n,
    pegInActivationTimeout: 200n,
    ...overrides,
  };
}

describe("validateTBVProtocolParams", () => {
  it("accepts valid TBV params", () => {
    expect(() => validateTBVProtocolParams(validTBVParams())).not.toThrow();
  });

  it("rejects minimumPegInAmount of zero", () => {
    expect(() =>
      validateTBVProtocolParams(validTBVParams({ minimumPegInAmount: 0n })),
    ).toThrow(/minimumPegInAmount must be positive/);
  });

  it("rejects maxPegInAmount less than minimumPegInAmount", () => {
    expect(() =>
      validateTBVProtocolParams(
        validTBVParams({
          minimumPegInAmount: 1_000_000n,
          maxPegInAmount: 500_000n,
        }),
      ),
    ).toThrow(/maxPegInAmount.*must be >= minimumPegInAmount/);
  });

  it("rejects pegInAckTimeout of zero", () => {
    expect(() =>
      validateTBVProtocolParams(validTBVParams({ pegInAckTimeout: 0n })),
    ).toThrow(/pegInAckTimeout must be positive/);
  });

  it("rejects pegInActivationTimeout of zero", () => {
    expect(() =>
      validateTBVProtocolParams(validTBVParams({ pegInActivationTimeout: 0n })),
    ).toThrow(/pegInActivationTimeout must be positive/);
  });
});

describe("validatePegInConfiguration", () => {
  it("accepts valid peg-in configuration", () => {
    expect(() => validatePegInConfiguration(validPegInConfig())).not.toThrow();
  });

  it("rejects minimumPegInAmount of zero", () => {
    expect(() =>
      validatePegInConfiguration(validPegInConfig({ minimumPegInAmount: 0n })),
    ).toThrow(/minimumPegInAmount must be positive/);
  });

  it("rejects maxPegInAmount less than minimumPegInAmount", () => {
    expect(() =>
      validatePegInConfiguration(
        validPegInConfig({
          minimumPegInAmount: 1_000_000n,
          maxPegInAmount: 500_000n,
        }),
      ),
    ).toThrow(/maxPegInAmount.*must be >= minimumPegInAmount/);
  });

  it("rejects pegInAckTimeout of zero", () => {
    expect(() =>
      validatePegInConfiguration(validPegInConfig({ pegInAckTimeout: 0n })),
    ).toThrow(/pegInAckTimeout must be positive/);
  });

  it("rejects pegInActivationTimeout of zero", () => {
    expect(() =>
      validatePegInConfiguration(
        validPegInConfig({ pegInActivationTimeout: 0n }),
      ),
    ).toThrow(/pegInActivationTimeout must be positive/);
  });

  it("also validates offchain params within the configuration", () => {
    expect(() =>
      validatePegInConfiguration(validPegInConfig({}, { councilQuorum: 0 })),
    ).toThrow(/councilQuorum must be positive/);
  });
});
