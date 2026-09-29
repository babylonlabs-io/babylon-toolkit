/**
 * useRefundState — the refund handler asks for the Bitcoin wallet before it
 * signs or broadcasts anything. Issue #2232: an Ethereum-only session reaches
 * this handler with a confirmed Ethereum wallet and no Bitcoin wallet.
 */

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";
import { useRefundState } from "@/hooks/deposit/useRefundState";
import { buildAndBroadcastRefundTransaction } from "@/services/vault/vaultRefundService";
import type { VaultActivity } from "@/types/activity";

const BTC_ADDRESS = "bc1qtest";

const btcWallet = vi.hoisted(() => ({
  connected: false,
  open: vi.fn(),
  getPublicKeyHex: vi.fn(async () => `02${"ab".repeat(32)}`),
}));

// useBTCWallet is one hook behind two module paths: @/context/wallet
// re-exports it from the connector. useBtcAction imports it from the package
// and useBtcWalletUnlock from the barrel, so each path below carries only the
// members its own consumer reads.
vi.mock("@babylonlabs-io/wallet-connector", () => ({
  useBTCWallet: () => ({
    connected: btcWallet.connected,
    loading: false,
    locked: false,
  }),
  // The Ethereum session is confirmed in both cases; only the Bitcoin wallet
  // varies.
  useWalletConnect: () => ({ connected: true, open: btcWallet.open }),
  // The BTC connector only carries a wallet once the Bitcoin wallet connects.
  // The chain is honoured so a handler asking for the wrong one gets nothing.
  useChainConnector: (chain: string) =>
    chain === "BTC" && btcWallet.connected
      ? {
          connectedWallet: {
            id: "test-btc-wallet",
            provider: { getPublicKeyHex: btcWallet.getPublicKeyHex },
            account: { address: BTC_ADDRESS },
          },
        }
      : undefined,
  isUserRejectionMessage: () => false,
}));

vi.mock("@/context/wallet", () => ({
  useBTCWallet: () => ({ reconnect: vi.fn() }),
  useETHWallet: () => ({
    address: "0x1111111111111111111111111111111111111111",
  }),
}));

vi.mock("@/context/deposit/PeginPollingContext", () => ({
  usePeginPolling: () => ({
    setOptimisticStatus: vi.fn(),
    addConfirmedRefund: vi.fn(),
  }),
}));

vi.mock("@/storage/usePeginStorage", () => ({
  usePeginStorage: () => ({
    pendingPegins: [],
    addPendingPegin: vi.fn(),
    markRefundBroadcast: vi.fn(),
  }),
}));

const livenessMocks = vi.hoisted(() => ({
  shouldProbeWalletLiveness: vi.fn(() => false),
  verifyBtcWalletLiveness: vi.fn(async () => {}),
}));

vi.mock("@/utils/btc", () => ({
  shouldProbeWalletLiveness: livenessMocks.shouldProbeWalletLiveness,
  verifyBtcWalletLiveness: livenessMocks.verifyBtcWalletLiveness,
}));

// Keep the real RefundAlreadySettledError: the handler narrows the failure
// with `instanceof`.
vi.mock("@/services/vault/vaultRefundService", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/services/vault/vaultRefundService")
    >();
  return {
    ...actual,
    buildAndBroadcastRefundTransaction: vi.fn(async () => "refund-txid"),
  };
});

const ACTIVITY: VaultActivity = {
  id: `0x${"11".repeat(32)}`,
  collateral: { amount: "0.01", symbol: "BTC" },
  providers: [{ id: "0xprovider" }],
  displayLabel: "Pending",
  peginTxHash: `0x${"22".repeat(32)}`,
  unsignedPrePeginTx: "0x",
  depositorWotsPkHash: `0x${"33".repeat(32)}`,
};

const FEE_RATE_SATS_VB = 5;

beforeEach(() => {
  btcWallet.connected = false;
  vi.clearAllMocks();
});

describe("useRefundState requires the Bitcoin wallet first", () => {
  it("opens the Bitcoin connection and reports the wallet error with no Bitcoin wallet", async () => {
    const { result } = renderHook(() => useRefundState({ activity: ACTIVITY }));

    await act(async () => {
      await result.current.handleRefund(FEE_RATE_SATS_VB);
    });

    expect(btcWallet.open).toHaveBeenCalledWith("BTC");
    expect(result.current.error).toBe(COPY.wallet.btcAction.error);
    expect(buildAndBroadcastRefundTransaction).not.toHaveBeenCalled();
  });

  it("broadcasts the refund once with the fee rate it was given", async () => {
    btcWallet.connected = true;
    const { result } = renderHook(() => useRefundState({ activity: ACTIVITY }));

    await act(async () => {
      await result.current.handleRefund(FEE_RATE_SATS_VB);
    });

    expect(btcWallet.open).not.toHaveBeenCalled();
    expect(buildAndBroadcastRefundTransaction).toHaveBeenCalledOnce();
    expect(buildAndBroadcastRefundTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        vaultId: ACTIVITY.id,
        feeRate: FEE_RATE_SATS_VB,
      }),
    );
  });

  // The wallet can switch account or lock between connect and Confirm, so the
  // liveness check stands between the guard and the broadcast. Without these
  // assertions, deleting it from the handler, or moving it after the
  // broadcast, leaves the tests green.
  it("checks the wallet is still live before it broadcasts", async () => {
    btcWallet.connected = true;
    const { result } = renderHook(() => useRefundState({ activity: ACTIVITY }));

    await act(async () => {
      await result.current.handleRefund(FEE_RATE_SATS_VB);
    });

    expect(livenessMocks.verifyBtcWalletLiveness).toHaveBeenCalledWith(
      expect.objectContaining({ getPublicKeyHex: btcWallet.getPublicKeyHex }),
      BTC_ADDRESS,
      { probeConnection: false },
    );
    expect(
      livenessMocks.verifyBtcWalletLiveness.mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(buildAndBroadcastRefundTransaction).mock.invocationCallOrder[0],
    );
  });

  // The wallet id decides whether the check probes the connection, so the
  // handler must pass it through rather than settle the question itself.
  it("decides the liveness probe from the connected wallet id", async () => {
    btcWallet.connected = true;
    const { result } = renderHook(() => useRefundState({ activity: ACTIVITY }));

    await act(async () => {
      await result.current.handleRefund(FEE_RATE_SATS_VB);
    });

    expect(livenessMocks.shouldProbeWalletLiveness).toHaveBeenCalledWith(
      "test-btc-wallet",
    );
  });

  it("reports the broadcast txid and stops refunding on success", async () => {
    btcWallet.connected = true;
    const { result } = renderHook(() => useRefundState({ activity: ACTIVITY }));

    await act(async () => {
      await result.current.handleRefund(FEE_RATE_SATS_VB);
    });

    expect(result.current.refundTxId).toBe("refund-txid");
    expect(result.current.refunding).toBe(false);
    expect(result.current.error).toBeNull();
  });
});
