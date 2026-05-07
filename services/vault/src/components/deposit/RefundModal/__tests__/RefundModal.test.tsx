import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { useMemo, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  PegInConfiguration,
  VersionedOffchainParams,
} from "@/clients/eth-contract/protocol-params";
import type { VaultActivity } from "@/types/activity";

import { RefundModal } from "../index";

const { OFFCHAIN_PARAMS, PEGIN_CONFIG } = vi.hoisted(() => {
  const offchain: VersionedOffchainParams = {
    timelockAssert: 0n,
    timelockChallengeAssert: 0n,
    securityCouncilKeys: [],
    councilQuorum: 0,
    feeRate: 0n,
    babeTotalInstances: 0,
    babeInstancesToFinalize: 0,
    minVpCommissionBps: 0,
    tRefund: 36,
    tStale: 0,
    minPeginFeeRate: 0n,
    proverProgramVersion: 0,
    minPrepeginDepth: 0,
  };
  const config: PegInConfiguration = {
    minimumPegInAmount: 100_000n,
    maxPegInAmount: 10_000_000_000n,
    pegInAckTimeout: 0n,
    pegInActivationTimeout: 0n,
    maxHtlcOutputCount: 1,
    timelockPegin: 144,
    timelockRefund: 36,
    minVpCommissionBps: 0,
    offchainParams: offchain,
    offchainParamsVersion: 1,
  };
  return { OFFCHAIN_PARAMS: offchain, PEGIN_CONFIG: config };
});

vi.mock("@/clients/eth-contract/protocol-params", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/clients/eth-contract/protocol-params")
    >();
  return {
    ...actual,
    getPegInConfiguration: vi.fn(async () => PEGIN_CONFIG),
    fetchAllOffchainParams: vi.fn(async () => ({
      byVersion: new Map<number, VersionedOffchainParams>([
        [1, OFFCHAIN_PARAMS],
      ]),
      latestVersion: 1,
    })),
  };
});

vi.mock("@/services/providers", () => ({
  fetchAllUniversalChallengers: vi.fn(async () => ({
    byVersion: new Map(),
    latestVersion: 1,
  })),
}));

vi.mock("@/services/vault/vaultRefundService", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/services/vault/vaultRefundService")
    >();
  return {
    ...actual,
    getRefundPreview: vi.fn(async () => ({
      amountSats: 1_000_000n,
      halfHourFeeSatsVb: 5,
    })),
  };
});

vi.mock("@/hooks/deposit/useRefundState", () => ({
  useRefundState: vi.fn(() => ({
    refunding: false,
    refundTxId: null,
    error: null,
    handleRefund: vi.fn(),
  })),
}));

vi.mock("@/clients/eth-contract/chainlink", () => ({
  getTokenPrices: vi.fn(async () => ({
    prices: { BTC: 50_000 },
    metadata: { BTC: { isStale: false, fetchFailed: false } },
  })),
}));

const ACTIVITY: VaultActivity = {
  id: "0xdeadbeef",
  collateral: { amount: "0.01", symbol: "BTC" },
  providers: [{ id: "0xprovider" }],
  displayLabel: "Pending",
  unsignedPrePeginTx: "0x",
  depositorWotsPkHash: "0x",
};

function Wrapper({ children }: { children: ReactNode }) {
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
    [],
  );
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("RefundModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders review content without an outer ProtocolParamsProvider", async () => {
    render(
      <Wrapper>
        <RefundModal
          open
          activity={ACTIVITY}
          onClose={() => {}}
          onSuccess={() => {}}
        />
      </Wrapper>,
    );

    expect(await screen.findByText("Review Refund")).toBeInTheDocument();
  });

  it("derives estimated refund hours from timelockRefund", async () => {
    render(
      <Wrapper>
        <RefundModal
          open
          activity={ACTIVITY}
          onClose={() => {}}
          onSuccess={() => {}}
        />
      </Wrapper>,
    );

    expect(
      await screen.findByText(/approximately 6 hours/i),
    ).toBeInTheDocument();
  });
});
