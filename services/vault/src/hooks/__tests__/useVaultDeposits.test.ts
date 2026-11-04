import { renderHook } from "@testing-library/react";
import type { Hex } from "viem";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

import { FAST_POLL_INTERVAL, NORMAL_POLL_INTERVAL } from "@/constants";

import {
  ContractStatus,
  LocalStorageStatus,
} from "../../models/peginStateMachine";
import type { RemovePendingPeginsResult } from "../../storage/peginStorage";
import { useVaultDeposits } from "../useVaultDeposits";

vi.mock("../useVaults", () => ({
  useVaults: vi.fn(),
}));
const mockUseActiveVaultChainCheck = vi.hoisted(() => vi.fn());
vi.mock("../useActiveVaultChainCheck", () => ({
  useActiveVaultChainCheck: mockUseActiveVaultChainCheck,
}));
const mockUseChainExpiryCheck = vi.hoisted(() => vi.fn());
vi.mock("../useChainExpiryCheck", () => ({
  useChainExpiryCheck: mockUseChainExpiryCheck,
}));
vi.mock("../../storage/usePeginStorage", () => ({
  usePeginStorage: vi.fn(() => ({
    allActivities: [],
    pendingPegins: [],
    addPendingPegin: vi.fn(),
    removePendingPegins: vi.fn(),
  })),
}));
vi.mock("../../storage/peginStorage", async () => {
  const actual = await vi.importActual<
    typeof import("../../storage/peginStorage")
  >("../../storage/peginStorage");
  return {
    PendingPeginStorageReadError: actual.PendingPeginStorageReadError,
    getPendingPegins: vi.fn(() => []),
  };
});

const ADDRESS = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" as const;

let useVaultsMock: Mock;
let setIntervalSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  vi.clearAllMocks();
  const mod = await import("../useVaults");
  useVaultsMock = vi.mocked(mod.useVaults) as unknown as Mock;
  useVaultsMock.mockReturnValue({
    data: undefined,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  });
  mockUseActiveVaultChainCheck.mockReturnValue({
    statuses: new Map(),
    pendingIds: new Set(),
  });
  mockUseChainExpiryCheck.mockReturnValue(new Map());
  setIntervalSpy = vi.spyOn(globalThis, "setInterval");
});

afterEach(() => {
  setIntervalSpy.mockRestore();
});

describe("useVaultDeposits", () => {
  it("delegates polling to React Query (no manual setInterval timer)", () => {
    renderHook(() => useVaultDeposits(ADDRESS));
    // Hook used to spawn a manual setInterval that ran alongside React
    // Query, bypassing tab-visibility pause and dedup. Confirm that
    // window-level timer is gone.
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });

  it("starts polling at NORMAL_POLL_INTERVAL when no Processing activity exists", () => {
    renderHook(() => useVaultDeposits(ADDRESS));
    expect(useVaultsMock).toHaveBeenLastCalledWith(ADDRESS, {
      poll: true,
      interval: NORMAL_POLL_INTERVAL,
    });
  });

  it("does not enable polling when no wallet is connected", () => {
    renderHook(() => useVaultDeposits(undefined));
    // Hook still calls useVaults so React Query can manage the cache;
    // the underlying query is gated by `enabled: !!depositorAddress`.
    expect(useVaultsMock).toHaveBeenLastCalledWith(undefined, {
      poll: true,
      interval: NORMAL_POLL_INTERVAL,
    });
    // Importantly, no setInterval was scheduled regardless.
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });

  it("exposes the indexed vault ids when the indexer returned every row", () => {
    useVaultsMock.mockReturnValue({
      data: { vaults: [], droppedCount: 0 },
      status: "success",
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useVaultDeposits(ADDRESS));

    expect(result.current.indexedVaultIds).toEqual(new Set());
  });

  it("lowercases the indexed vault ids so a mixed-case row still matches", () => {
    useVaultsMock.mockReturnValue({
      data: {
        vaults: [{ id: "0xAbCdEf", amount: 0n, status: 0, isInUse: false }],
        droppedCount: 0,
      },
      status: "success",
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useVaultDeposits(ADDRESS));

    expect(result.current.indexedVaultIds).toEqual(new Set(["0xabcdef"]));
  });

  it("withholds the indexed vault ids when the fetch dropped a row", () => {
    useVaultsMock.mockReturnValue({
      data: { vaults: [], droppedCount: 1 },
      status: "success",
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useVaultDeposits(ADDRESS));

    expect(result.current.indexedVaultIds).toBeNull();
  });

  it("replaces an indexer ACTIVE with the Verified status the chain still reports", async () => {
    useVaultsMock.mockReturnValue({
      data: {
        vaults: [
          {
            id: "0xAbCdEf",
            amount: 0n,
            status: ContractStatus.ACTIVE,
            isInUse: false,
          },
          {
            id: "0x123456",
            amount: 0n,
            status: ContractStatus.ACTIVE,
            isInUse: false,
          },
        ],
        droppedCount: 0,
      },
      status: "success",
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseActiveVaultChainCheck.mockReturnValue({
      statuses: new Map([["0xabcdef", ContractStatus.VERIFIED]]),
      pendingIds: new Set(),
    });
    const { usePeginStorage } = await import("../../storage/usePeginStorage");

    renderHook(() => useVaultDeposits(ADDRESS));

    expect(mockUseActiveVaultChainCheck).toHaveBeenLastCalledWith([
      "0xAbCdEf",
      "0x123456",
    ]);
    const { confirmedPegins } = vi.mocked(usePeginStorage).mock.lastCall![0];
    expect(
      confirmedPegins.map(({ id, contractStatus }) => ({ id, contractStatus })),
    ).toEqual([
      { id: "0xAbCdEf", contractStatus: ContractStatus.VERIFIED },
      { id: "0x123456", contractStatus: ContractStatus.ACTIVE },
    ]);
  });

  function mockIndexedVaults(
    vaults: Array<{ id: string; status: ContractStatus }>,
  ) {
    useVaultsMock.mockReturnValue({
      data: {
        vaults: vaults.map((vault) => ({
          ...vault,
          amount: 0n,
          isInUse: false,
        })),
        droppedCount: 0,
      },
      status: "success",
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
  }

  it("reads an indexer-VERIFIED vault past its deadline as EXPIRED, unreported, with the reason", async () => {
    mockIndexedVaults([{ id: "0xAbCdEf", status: ContractStatus.VERIFIED }]);
    mockUseChainExpiryCheck.mockReturnValue(
      new Map([
        ["0xabcdef", { state: "unreported", reason: "activation_timeout" }],
      ]),
    );
    const { usePeginStorage } = await import("../../storage/usePeginStorage");

    renderHook(() => useVaultDeposits(ADDRESS));

    const [activity] =
      vi.mocked(usePeginStorage).mock.lastCall![0].confirmedPegins;
    expect(activity.contractStatus).toBe(ContractStatus.EXPIRED);
    expect(activity.expirationReason).toBe("activation_timeout");
    expect(activity.expiryUnreported).toBe(true);
  });

  it("reads an indexer-PENDING vault the registry records Expired as EXPIRED, not unreported", async () => {
    mockIndexedVaults([{ id: "0xAbCdEf", status: ContractStatus.PENDING }]);
    mockUseChainExpiryCheck.mockReturnValue(
      new Map([["0xabcdef", { state: "reported", reason: undefined }]]),
    );
    const { usePeginStorage } = await import("../../storage/usePeginStorage");

    renderHook(() => useVaultDeposits(ADDRESS));

    const [activity] =
      vi.mocked(usePeginStorage).mock.lastCall![0].confirmedPegins;
    expect(activity.contractStatus).toBe(ContractStatus.EXPIRED);
    expect(activity.expirationReason).toBeUndefined();
    expect(activity.expiryUnreported).toBeUndefined();
  });

  it("keeps the activation timeout on an indexer-PENDING vault that was verified and is reported, so its artifact download stays", async () => {
    mockIndexedVaults([{ id: "0xAbCdEf", status: ContractStatus.PENDING }]);
    mockUseChainExpiryCheck.mockReturnValue(
      new Map([
        ["0xabcdef", { state: "reported", reason: "activation_timeout" }],
      ]),
    );
    const { usePeginStorage } = await import("../../storage/usePeginStorage");

    renderHook(() => useVaultDeposits(ADDRESS));

    const [activity] =
      vi.mocked(usePeginStorage).mock.lastCall![0].confirmedPegins;
    expect(activity.contractStatus).toBe(ContractStatus.EXPIRED);
    expect(activity.expirationReason).toBe("activation_timeout");
    expect(activity.expiryUnreported).toBeUndefined();
  });

  it("reads an indexer-VERIFIED vault the registry records Redeemed as REDEEMED, keeping its reason for the artifact download", async () => {
    mockIndexedVaults([{ id: "0xAbCdEf", status: ContractStatus.VERIFIED }]);
    mockUseChainExpiryCheck.mockReturnValue(
      new Map([
        ["0xabcdef", { state: "redeemed", reason: "activation_timeout" }],
      ]),
    );
    const { usePeginStorage } = await import("../../storage/usePeginStorage");

    renderHook(() => useVaultDeposits(ADDRESS));

    const [activity] =
      vi.mocked(usePeginStorage).mock.lastCall![0].confirmedPegins;
    expect(activity.contractStatus).toBe(ContractStatus.REDEEMED);
    expect(activity.expirationReason).toBe("activation_timeout");
    expect(activity.expiryUnreported).toBeUndefined();
  });

  it("keeps the indexer's status for a vault the chain has not expired", async () => {
    mockIndexedVaults([{ id: "0xAbCdEf", status: ContractStatus.VERIFIED }]);
    const { usePeginStorage } = await import("../../storage/usePeginStorage");

    renderHook(() => useVaultDeposits(ADDRESS));

    const [activity] =
      vi.mocked(usePeginStorage).mock.lastCall![0].confirmedPegins;
    expect(activity.contractStatus).toBe(ContractStatus.VERIFIED);
    expect(activity.expiryUnreported).toBeUndefined();
  });

  it("checks expiry for PENDING and VERIFIED vaults only", () => {
    mockIndexedVaults([
      { id: "0xaaaa", status: ContractStatus.PENDING },
      { id: "0xbbbb", status: ContractStatus.VERIFIED },
      { id: "0xcccc", status: ContractStatus.ACTIVE },
      { id: "0xdddd", status: ContractStatus.EXPIRED },
    ]);

    renderHook(() => useVaultDeposits(ADDRESS));

    expect(mockUseChainExpiryCheck).toHaveBeenLastCalledWith([
      "0xaaaa",
      "0xbbbb",
    ]);
  });

  it("checks expiry for an indexer-ACTIVE vault the chain still reports Verified", () => {
    mockIndexedVaults([{ id: "0xAbCdEf", status: ContractStatus.ACTIVE }]);
    mockUseActiveVaultChainCheck.mockReturnValue({
      statuses: new Map([["0xabcdef", ContractStatus.VERIFIED]]),
      pendingIds: new Set(),
    });

    renderHook(() => useVaultDeposits(ADDRESS));

    expect(mockUseChainExpiryCheck).toHaveBeenLastCalledWith(["0xAbCdEf"]);
  });

  it("still knows every indexed vault id when a row reads expired", () => {
    mockIndexedVaults([{ id: "0xAbCdEf", status: ContractStatus.VERIFIED }]);
    mockUseChainExpiryCheck.mockReturnValue(
      new Map([
        ["0xabcdef", { state: "unreported", reason: "activation_timeout" }],
      ]),
    );

    const { result } = renderHook(() => useVaultDeposits(ADDRESS));

    expect(result.current.indexedVaultIds).toEqual(new Set(["0xabcdef"]));
  });

  it("holds back an indexer-ACTIVE vault whose registry read has not settled", async () => {
    useVaultsMock.mockReturnValue({
      data: {
        vaults: [
          {
            id: "0xAbCdEf",
            amount: 0n,
            status: ContractStatus.ACTIVE,
            isInUse: false,
          },
        ],
        droppedCount: 0,
      },
      status: "success",
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseActiveVaultChainCheck.mockReturnValue({
      statuses: new Map(),
      pendingIds: new Set(["0xabcdef"]),
    });
    const { usePeginStorage } = await import("../../storage/usePeginStorage");

    const { result } = renderHook(() => useVaultDeposits(ADDRESS));

    expect(
      vi.mocked(usePeginStorage).mock.lastCall![0].confirmedPegins,
    ).toEqual([]);
    expect(result.current.indexedVaultIds).toBeNull();
  });

  it("keeps a vault's last status while its new registry read has not settled", async () => {
    const verifiedVault = {
      id: "0xAbCdEf",
      amount: 0n,
      status: ContractStatus.VERIFIED,
      isInUse: false,
    };
    useVaultsMock.mockReturnValue({
      data: { vaults: [verifiedVault], droppedCount: 0 },
      status: "success",
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    const { usePeginStorage } = await import("../../storage/usePeginStorage");
    const { rerender } = renderHook(() => useVaultDeposits(ADDRESS));

    useVaultsMock.mockReturnValue({
      data: {
        vaults: [{ ...verifiedVault, status: ContractStatus.ACTIVE }],
        droppedCount: 0,
      },
      status: "success",
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseActiveVaultChainCheck.mockReturnValue({
      statuses: new Map(),
      pendingIds: new Set(["0xabcdef"]),
    });
    rerender();

    const { confirmedPegins } = vi.mocked(usePeginStorage).mock.lastCall![0];
    expect(confirmedPegins.map(({ contractStatus }) => contractStatus)).toEqual(
      [ContractStatus.VERIFIED],
    );
  });

  it("keeps fast polling off when the stored records cannot be read", async () => {
    const { getPendingPegins, PendingPeginStorageReadError } = await import(
      "../../storage/peginStorage"
    );
    vi.mocked(getPendingPegins).mockImplementationOnce(() => {
      throw new PendingPeginStorageReadError(
        ADDRESS,
        '[{"id":',
        new SyntaxError("Unexpected end of JSON input"),
      );
    });
    useVaultsMock.mockReturnValue({
      data: {
        vaults: [{ id: "0xabcdef", amount: 0n, status: 0, isInUse: false }],
        droppedCount: 0,
      },
      status: "success",
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    expect(() => renderHook(() => useVaultDeposits(ADDRESS))).not.toThrow();
    expect(useVaultsMock).toHaveBeenLastCalledWith(ADDRESS, {
      poll: true,
      interval: NORMAL_POLL_INTERVAL,
    });
  });

  it("propagates a storage failure that is not the typed read error", async () => {
    const { getPendingPegins } = await import("../../storage/peginStorage");
    vi.mocked(getPendingPegins).mockImplementationOnce(() => {
      throw new Error("boom");
    });
    useVaultsMock.mockReturnValue({
      data: {
        vaults: [{ id: "0xabcdef", amount: 0n, status: 0, isInUse: false }],
        droppedCount: 0,
      },
      status: "success",
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    expect(() => renderHook(() => useVaultDeposits(ADDRESS))).toThrow("boom");
  });

  it("exports the FAST/NORMAL interval constants used as polling cadences", () => {
    // Sanity check that the constants the hook depends on are wired
    // through. If FAST_POLL_INTERVAL ever drops below 1s or
    // NORMAL_POLL_INTERVAL above 5min the polling story changes
    // materially — surface either as a test signal.
    expect(FAST_POLL_INTERVAL).toBeGreaterThanOrEqual(1_000);
    expect(NORMAL_POLL_INTERVAL).toBeLessThanOrEqual(5 * 60_000);
  });

  describe("polling after this device refunded", () => {
    const REFUNDED_ID = "0xabcdef" as Hex;

    async function renderRefundedVault(status: ContractStatus) {
      const storage = await import("../../storage/peginStorage");
      vi.mocked(storage.getPendingPegins).mockReturnValue([
        {
          id: REFUNDED_ID,
          timestamp: 0,
          status: LocalStorageStatus.REFUND_BROADCAST,
          refundBroadcastAt: Date.now(),
          peginTxHash: "0xprepegin" as Hex,
          unsignedTxHex: "",
        },
      ]);
      useVaultsMock.mockReturnValue({
        data: {
          vaults: [{ id: REFUNDED_ID, amount: 0n, status, isInUse: false }],
          droppedCount: 0,
        },
        status: "success",
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      renderHook(() => useVaultDeposits(ADDRESS));
    }

    afterEach(async () => {
      const storage = await import("../../storage/peginStorage");
      vi.mocked(storage.getPendingPegins).mockReturnValue([]);
    });

    it("polls fast while an expired vault's refund is within its TTL", async () => {
      await renderRefundedVault(ContractStatus.EXPIRED);

      expect(useVaultsMock).toHaveBeenLastCalledWith(ADDRESS, {
        poll: true,
        interval: FAST_POLL_INTERVAL,
      });
    });

    it.each([
      ["VERIFIED", ContractStatus.VERIFIED],
      ["PENDING", ContractStatus.PENDING],
    ])(
      "keeps the normal poll on a refunded vault reading %s, whose Refunding has no TTL",
      async (_name, status) => {
        await renderRefundedVault(status);

        expect(useVaultsMock).toHaveBeenLastCalledWith(ADDRESS, {
          poll: true,
          interval: NORMAL_POLL_INTERVAL,
        });
      },
    );
  });

  it("lowercases the stored record ids so a mixed-case record still matches", async () => {
    const mod = await import("../../storage/usePeginStorage");
    vi.mocked(mod.usePeginStorage).mockReturnValue({
      allActivities: [],
      storageReadError: null,
      pendingPegins: [
        {
          id: "0xAbCdEf" as Hex,
          timestamp: 0,
          status: LocalStorageStatus.PENDING,
          peginTxHash: "0xprepegin" as Hex,
          unsignedTxHex: "0xdeadbeef",
        },
      ],
      addPendingPegin: vi.fn(),
      updatePendingPeginStatus: vi.fn(),
      removePendingPegin: vi.fn(() => true),
      removePendingPegins: vi.fn((): RemovePendingPeginsResult => "removed"),
      markRefundBroadcast: vi.fn(),
    });

    const { result } = renderHook(() => useVaultDeposits(ADDRESS));

    expect(result.current.localRecordStatuses.get("0xabcdef")).toBe(
      LocalStorageStatus.PENDING,
    );
  });
});
