import { OnChainBtcVaultStatus } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { zeroAddress } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ethClient } from "@/clients/eth-contract/client";
import { getVaultRegistryReader } from "@/clients/eth-contract/sdk-readers";
import {
  ContractStatus,
  PEGIN_DISPLAY_LABELS,
} from "@/models/peginStateMachine";
import type { VaultActivity } from "@/types/activity";

import {
  getActivationDeadlineSuspects,
  useActivationDeadlineGate,
} from "../useActivationDeadlineGate";

vi.mock("@/clients/eth-contract/client", () => ({
  ethClient: { getPublicClient: vi.fn() },
}));
vi.mock("@/clients/eth-contract/sdk-readers", () => ({
  getVaultRegistryReader: vi.fn(),
}));

const mockGetBlockNumber = vi.fn();
const mockGetVaultBasicInfo = vi.fn();

const TIMEOUT = 100n; // blocks
// 12s slots → 100 blocks ≈ 1200s. Anchor "now" 2000s after creation so the
// cheap estimate is well past the window; 60s after creation so it is well
// within it.
const CREATED_MS = 1_000_000;
const NOW_PAST_MS = CREATED_MS + 2_000_000;
const NOW_WITHIN_MS = CREATED_MS + 60_000;

// On-chain blocks for Tier-2: createdAt 1000 + timeout 100 → deadline block 1100.
const CREATED_AT_BLOCK = 1_000n;
const BLOCK_PAST_DEADLINE = 2_000n; // > 1100 → expired
const BLOCK_WITHIN_WINDOW = 1_050n; // <= 1100 → not expired
// A non-zero registered depositor so the zero-record guard doesn't skip it.
const REGISTERED_DEPOSITOR = "0x00000000000000000000000000000000000000a1";

function makeActivity(overrides: Partial<VaultActivity> = {}): VaultActivity {
  return {
    id: `0x${"11".repeat(32)}`,
    collateral: { amount: "1", symbol: "BTC" },
    providers: [],
    displayLabel: PEGIN_DISPLAY_LABELS.READY_TO_ACTIVATE,
    unsignedPrePeginTx: "00",
    depositorWotsPkHash: `0x${"00".repeat(32)}`,
    contractStatus: ContractStatus.VERIFIED,
    timestamp: CREATED_MS,
    ...overrides,
  };
}

function makeBasicInfo(overrides: Record<string, unknown> = {}) {
  return {
    depositor: REGISTERED_DEPOSITOR,
    createdAt: CREATED_AT_BLOCK,
    status: OnChainBtcVaultStatus.VERIFIED,
    ...overrides,
  };
}

function queryWrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(ethClient.getPublicClient).mockReturnValue({
    getBlockNumber: mockGetBlockNumber,
  } as unknown as ReturnType<typeof ethClient.getPublicClient>);
  vi.mocked(getVaultRegistryReader).mockReturnValue({
    getVaultBasicInfo: mockGetVaultBasicInfo,
  } as unknown as ReturnType<typeof getVaultRegistryReader>);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("getActivationDeadlineSuspects", () => {
  it("flags a VERIFIED vault whose estimate is past the window", () => {
    const suspects = getActivationDeadlineSuspects(
      [makeActivity()],
      TIMEOUT,
      NOW_PAST_MS,
    );
    expect(suspects).toEqual([makeActivity().id]);
  });

  it("does not flag a VERIFIED vault still well within the window", () => {
    expect(
      getActivationDeadlineSuspects([makeActivity()], TIMEOUT, NOW_WITHIN_MS),
    ).toEqual([]);
  });

  it("ignores non-VERIFIED vaults even if the estimate is past the window", () => {
    expect(
      getActivationDeadlineSuspects(
        [makeActivity({ contractStatus: ContractStatus.ACTIVE })],
        TIMEOUT,
        NOW_PAST_MS,
      ),
    ).toEqual([]);
  });

  it("does not flag a vault with no indexer timestamp (fail-safe)", () => {
    expect(
      getActivationDeadlineSuspects(
        [makeActivity({ timestamp: undefined })],
        TIMEOUT,
        NOW_PAST_MS,
      ),
    ).toEqual([]);
  });
});

describe("useActivationDeadlineGate (Tier-2 on-chain confirm)", () => {
  it("gates a suspect confirmed past the deadline on chain", async () => {
    mockGetBlockNumber.mockResolvedValue(BLOCK_PAST_DEADLINE);
    mockGetVaultBasicInfo.mockResolvedValue(makeBasicInfo());
    const activity = makeActivity();

    const { result } = renderHook(
      () => useActivationDeadlineGate([activity], TIMEOUT),
      { wrapper: queryWrapper },
    );

    await waitFor(() =>
      expect(result.current.has(activity.id.toLowerCase())).toBe(true),
    );
  });

  it("does not gate when the chain no longer reports VERIFIED", async () => {
    // Stale indexer VERIFIED row, but on chain the vault is already ACTIVE.
    mockGetBlockNumber.mockResolvedValue(BLOCK_PAST_DEADLINE);
    mockGetVaultBasicInfo.mockResolvedValue(
      makeBasicInfo({ status: OnChainBtcVaultStatus.ACTIVE }),
    );
    const activity = makeActivity();

    const { result } = renderHook(
      () => useActivationDeadlineGate([activity], TIMEOUT),
      { wrapper: queryWrapper },
    );

    await waitFor(() => expect(mockGetVaultBasicInfo).toHaveBeenCalled());
    expect(result.current.has(activity.id.toLowerCase())).toBe(false);
  });

  it("does not gate a suspect still within the window on chain", async () => {
    mockGetBlockNumber.mockResolvedValue(BLOCK_WITHIN_WINDOW);
    mockGetVaultBasicInfo.mockResolvedValue(makeBasicInfo());
    const activity = makeActivity();

    const { result } = renderHook(
      () => useActivationDeadlineGate([activity], TIMEOUT),
      { wrapper: queryWrapper },
    );

    await waitFor(() => expect(mockGetVaultBasicInfo).toHaveBeenCalled());
    expect(result.current.has(activity.id.toLowerCase())).toBe(false);
  });

  it("fails open (gates nothing) when the chain read throws", async () => {
    mockGetBlockNumber.mockResolvedValue(BLOCK_PAST_DEADLINE);
    mockGetVaultBasicInfo.mockRejectedValue(new Error("rpc down"));
    const activity = makeActivity();

    const { result } = renderHook(
      () => useActivationDeadlineGate([activity], TIMEOUT),
      { wrapper: queryWrapper },
    );

    await waitFor(() => expect(mockGetVaultBasicInfo).toHaveBeenCalled());
    expect(result.current.size).toBe(0);
  });

  it("does not gate an unregistered (zero-address) record", async () => {
    mockGetBlockNumber.mockResolvedValue(BLOCK_PAST_DEADLINE);
    mockGetVaultBasicInfo.mockResolvedValue(
      makeBasicInfo({ depositor: zeroAddress, createdAt: 0n }),
    );
    const activity = makeActivity();

    const { result } = renderHook(
      () => useActivationDeadlineGate([activity], TIMEOUT),
      { wrapper: queryWrapper },
    );

    await waitFor(() => expect(mockGetVaultBasicInfo).toHaveBeenCalled());
    expect(result.current.has(activity.id.toLowerCase())).toBe(false);
  });

  it("skips the chain read entirely when there are no Tier-1 suspects", () => {
    const within = makeActivity({ timestamp: Date.now() });

    const { result } = renderHook(
      () => useActivationDeadlineGate([within], TIMEOUT),
      { wrapper: queryWrapper },
    );

    expect(result.current.size).toBe(0);
    expect(mockGetVaultBasicInfo).not.toHaveBeenCalled();
  });
});
