import { describe, expect, it, vi } from "vitest";

// The range assert lives in vaultPayoutSignatureService, whose module graph
// reaches the shared ETH client (config read at construction). Stub the
// chain-facing modules so the pure helpers under test load without config.
vi.mock("../../../clients/eth-contract/btc-vault-registry/query", () => ({
  getVaultFromChain: vi.fn(),
  getVaultProviderGenesisBtcPubkeyFromChain: vi.fn(),
  getVaultKeyEpochsFromChain: vi.fn(),
}));
vi.mock("../../../clients/eth-contract/sdk-readers", () => ({
  getOperationKeyReader: vi.fn(),
  getProtocolParamsReader: vi.fn(),
  getUniversalChallengerReader: vi.fn(),
  getVaultKeeperReader: vi.fn(),
  getVaultRegistryReader: vi.fn(),
}));
vi.mock("../../../config/pegin", () => ({
  getBTCNetworkForWASM: vi.fn(() => "testnet"),
}));

import { resolveResumeCommissionCeilingBps } from "../resolveResumeCommissionCeilingBps";

describe("resolveResumeCommissionCeilingBps", () => {
  it("throws when the stored commission is below the protocol floor", () => {
    expect(() =>
      resolveResumeCommissionCeilingBps({ vaultProviderCommissionBps: 5 }, 10),
    ).toThrow(/VP commission 5 bps out of protocol range \[10, 10000\)/);
  });

  it("throws on a zero commission (tx-graph builder refuses vp_commission_bps == 0)", () => {
    expect(() =>
      resolveResumeCommissionCeilingBps({ vaultProviderCommissionBps: 0 }, 0),
    ).toThrow(/VP commission 0 bps out of protocol range \[1, 10000\)/);
  });

  it("applies the fresh path's +25 bps headroom to an in-range commission", () => {
    expect(
      resolveResumeCommissionCeilingBps(
        { vaultProviderCommissionBps: 250 },
        10,
      ),
    ).toBe(275);
  });

  it("caps the ceiling at 9999 so it never reaches the contract's exclusive bound", () => {
    expect(
      resolveResumeCommissionCeilingBps(
        { vaultProviderCommissionBps: 9990 },
        10,
      ),
    ).toBe(9999);
  });

  it("rejects a NaN floor instead of letting it silently disable the range check", () => {
    // Math.max(NaN, 1) is NaN and every comparison against NaN is false —
    // without the guard, a commission of 0 would pass.
    expect(() =>
      resolveResumeCommissionCeilingBps(
        { vaultProviderCommissionBps: 0 },
        Number.NaN,
      ),
    ).toThrow(/non-negative integer/);
  });
});
