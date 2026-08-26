import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";
import { useReclaimState } from "@/hooks/deposit/useReclaimState";
import {
  ReclaimAlreadySettledError,
  getReclaimPreview,
} from "@/services/vault/vaultReclaimService";
import type { VaultActivity } from "@/types/activity";

import { ReclaimModal } from "../index";

// The shared v3 shell renders the app top bar, whose graph reaches
// wallet-connector and can't be transformed here. This suite is about the
// reclaim content inside it.
vi.mock("@/components/shared/V3ModalShell", () => ({
  V3ModalShell: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
}));

vi.mock("@/services/vault/vaultReclaimService", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/services/vault/vaultReclaimService")
    >();
  return { ...actual, getReclaimPreview: vi.fn() };
});

vi.mock("@/hooks/deposit/useReclaimState", () => ({
  useReclaimState: vi.fn(),
}));

vi.mock("@/clients/eth-contract/chainlink", () => ({
  getTokenPrices: vi.fn(async () => ({
    prices: { BTC: 50_000 },
    metadata: { BTC: { isStale: false, fetchFailed: false } },
  })),
}));

// The review screen reads the BTC wallet-lock state to gate confirm; the real
// module's graph reaches wallet-connector and can't be transformed here.
const mockBtcWalletState = vi.hoisted(() => ({ locked: false }));
vi.mock("@/context/wallet", () => ({
  useBTCWallet: () => mockBtcWalletState,
}));

const ACTIVITY = {
  id: "0xvault",
  collateral: { amount: "0.6", symbol: "BTC" },
  providers: [],
} as unknown as VaultActivity;

function renderModal(onBroadcast = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const result = render(
    <QueryClientProvider client={client}>
      <ReclaimModal
        open
        activity={ACTIVITY}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        onBroadcast={onBroadcast}
      />
    </QueryClientProvider>,
  );
  return { ...result, onBroadcast };
}

function mockReclaimState(overrides: Record<string, unknown> = {}) {
  vi.mocked(useReclaimState).mockReturnValue({
    reclaiming: false,
    reclaimTxId: null,
    alreadySettled: false,
    error: null,
    handleReclaim: vi.fn(),
    ...overrides,
  } as ReturnType<typeof useReclaimState>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockReclaimState();
  vi.mocked(getReclaimPreview).mockResolvedValue({
    reclaimableSats: 33_000n,
    halfHourFeeSatsVb: 5,
    peginTxid: "abc",
  });
});

describe("ReclaimModal", () => {
  it("shows the review screen once the preview resolves", async () => {
    renderModal();

    expect(
      await screen.findByText(COPY.reclaim.review.heading),
    ).toBeInTheDocument();
    expect(
      screen.getByText(COPY.reclaim.review.description),
    ).toBeInTheDocument();
  });

  it("shows the reserve amount in whole sats", async () => {
    renderModal();

    expect(await screen.findByText("33,000 sats")).toBeInTheDocument();
  });

  it("shows the success screen once a reclaim txid exists", async () => {
    mockReclaimState({ reclaimTxId: "deadbeef" });
    renderModal();

    expect(
      await screen.findByText(COPY.reclaim.success.heading),
    ).toBeInTheDocument();
  });

  it("shows the already-settled screen when the sweep raced another device", async () => {
    mockReclaimState({ alreadySettled: true });
    renderModal();

    expect(
      await screen.findByText(COPY.reclaim.alreadySettled.heading),
    ).toBeInTheDocument();
  });

  it("shows the already-settled screen when the preview finds the reserve spent", async () => {
    vi.mocked(getReclaimPreview).mockRejectedValue(
      new ReclaimAlreadySettledError(),
    );
    renderModal();

    expect(
      await screen.findByText(COPY.reclaim.alreadySettled.heading),
    ).toBeInTheDocument();
  });

  it("marks the vault in flight only after this session broadcast a sweep", async () => {
    mockReclaimState({ reclaimTxId: "deadbeef" });
    const { onBroadcast } = renderModal();

    fireEvent.click(await screen.findByTestId("reclaim-done-button"));

    expect(onBroadcast).toHaveBeenCalledWith(ACTIVITY.id);
  });

  it("does not mark the vault in flight when the reserve was already spent", async () => {
    // Someone else's sweep — claiming it as this session's in-flight reclaim
    // would make the row show "Reclaiming" for work it did not do.
    mockReclaimState({ alreadySettled: true });
    const { onBroadcast } = renderModal();

    await screen.findByText(COPY.reclaim.alreadySettled.heading);
    fireEvent.click(screen.getByText(COPY.reclaim.alreadySettled.doneButton));

    expect(onBroadcast).not.toHaveBeenCalled();
  });

  it("surfaces a preview failure on the review screen rather than blocking it", async () => {
    vi.mocked(getReclaimPreview).mockRejectedValue(new Error("indexer down"));
    renderModal();

    await waitFor(() => {
      expect(screen.getByText("indexer down")).toBeInTheDocument();
    });
  });
});
