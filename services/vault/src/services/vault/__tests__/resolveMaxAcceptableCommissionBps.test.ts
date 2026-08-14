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

import { resolveMaxAcceptableCommissionBps } from "../resolveMaxAcceptableCommissionBps";

describe("resolveMaxAcceptableCommissionBps", () => {
  it("throws when the stored commission is below the protocol floor", () => {
    expect(() =>
      resolveMaxAcceptableCommissionBps({ vaultProviderCommissionBps: 5 }, 10),
    ).toThrow(/VP commission 5 bps out of protocol range \[10, 10000\)/);
  });

  it("throws on a zero commission (tx-graph builder refuses vp_commission_bps == 0)", () => {
    expect(() =>
      resolveMaxAcceptableCommissionBps({ vaultProviderCommissionBps: 0 }, 0),
    ).toThrow(/VP commission 0 bps out of protocol range \[1, 10000\)/);
  });

  it("applies the fresh path's +25 bps headroom to an in-range commission", () => {
    expect(
      resolveMaxAcceptableCommissionBps(
        { vaultProviderCommissionBps: 250 },
        10,
      ),
    ).toBe(275);
  });

  it("caps the ceiling at 9999 so it never reaches the contract's exclusive bound", () => {
    expect(
      resolveMaxAcceptableCommissionBps(
        { vaultProviderCommissionBps: 9990 },
        10,
      ),
    ).toBe(9999);
  });
});
