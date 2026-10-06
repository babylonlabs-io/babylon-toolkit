/**
 * useClaimExpiredVault — the pre-checks that run immediately before the
 * expired-vault redeem uses the secret, and the write they guard.
 */

import { OnChainBtcVaultStatus } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getWalletClient, switchChain } from "wagmi/actions";

import { COPY } from "@/copy";
import { LocalStorageStatus } from "@/models/peginStateMachine";
import type { VaultActivity } from "@/types/activity";

import { useClaimExpiredVault } from "../useClaimExpiredVault";

// secret = 32-byte 0x...01, hashlock = sha256 of that preimage.
const SECRET =
  "0x0000000000000000000000000000000000000000000000000000000000000001";
const HASHLOCK =
  "0xec4916dd28fc4c10d78e287ca5d9cc51ee1ae73cbfde08c6b37324cbfaac8bc5";
const VAULT_ID = `0x${"11".repeat(32)}` as Hex;
const PRE_PEGIN_TX = `0x${"ab".repeat(32)}`;
const PEGIN_TX = `0x${"cd".repeat(32)}`;
// The on-chain signed PegIn; only it hashes to PEGIN_TX.
const SIGNED_PEGIN = "0x0200";
const OTHER_TX = `0x${"ef".repeat(32)}`;
const DEPOSITOR_ETH = "0x000000000000000000000000000000000000dEaD";
const CLAIM_EXPIRED_UNTIL = 300_000n;

const gateMock = vi.hoisted(() => ({
  value: { protocol: null as string | null, aave: null as string | null },
}));
vi.mock("@/hooks/useProtocolGate", () => ({
  useProtocolGateState: () => gateMock.value,
}));

const mockSetOptimisticStatus = vi.hoisted(() => vi.fn());
vi.mock("@/context/deposit/PeginPollingContext", () => ({
  usePeginPolling: () => ({ setOptimisticStatus: mockSetOptimisticStatus }),
}));

const mockGetVaultData = vi.hoisted(() => vi.fn());
vi.mock("@/clients/eth-contract/sdk-readers", () => ({
  getVaultRegistryReader: () => ({ getVaultData: mockGetVaultData }),
}));

const mockGetOnChainPauseState = vi.hoisted(() => vi.fn());
vi.mock("@/clients/eth-contract/pause-state/query", () => ({
  getOnChainPauseState: mockGetOnChainPauseState,
}));

const mockGetBlockNumber = vi.hoisted(() => vi.fn());
vi.mock("@/clients/eth-contract/client", () => ({
  ethClient: {
    getPublicClient: () => ({ getBlockNumber: mockGetBlockNumber }),
  },
}));

const mockFetchHtlcSpend = vi.hoisted(() => vi.fn());
const mockPeginWitnessRevealsSecret = vi.hoisted(() => vi.fn());
// Keep the real spender attribution: it is the check under test. The witness
// proof is unit-tested on real transactions in clients/btc; here it is a seam.
vi.mock("@/clients/btc/outspend", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/clients/btc/outspend")>()),
  fetchHtlcSpend: mockFetchHtlcSpend,
  peginWitnessRevealsSecret: mockPeginWitnessRevealsSecret,
}));

const PEGIN_TX_HEX = "02000000deadbeef";
const mockGetTxHex = vi.hoisted(() => vi.fn());
vi.mock("@babylonlabs-io/ts-sdk/tbv/core/clients", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@babylonlabs-io/ts-sdk/tbv/core/clients")
  >()),
  getTxHex: mockGetTxHex,
}));
vi.mock("@/clients/btc/config", () => ({
  getMempoolApiUrl: () => "https://mempool.test/api",
}));

// The PegIn txid is derived from the on-chain signed PegIn — keyed on its
// input, so hashing any other field fails the happy path.
vi.mock("@babylonlabs-io/ts-sdk/tbv/core/utils", () => ({
  calculateBtcTxHash: (tx: string) =>
    tx === SIGNED_PEGIN ? PEGIN_TX : `0x${"00".repeat(32)}`,
}));

const mockClaimExpiredVaultWithSecret = vi.hoisted(() => vi.fn());
vi.mock("@/services/vault/vaultActivationService", () => ({
  claimExpiredVaultWithSecret: mockClaimExpiredVaultWithSecret,
}));

const mockWalletClient = vi.hoisted(() => ({ account: "wallet" }));
vi.mock("wagmi/actions", () => ({
  switchChain: vi.fn().mockResolvedValue(undefined),
  getWalletClient: vi.fn().mockResolvedValue(mockWalletClient),
}));
vi.mock("@babylonlabs-io/wallet-connector", () => ({
  getSharedWagmiConfig: () => ({}),
}));
vi.mock("@/config/network", () => ({
  getETHChain: () => ({ id: 11155111 }),
}));

const mockLoggerError = vi.hoisted(() => vi.fn());
vi.mock("@/infrastructure", () => ({
  logger: { error: mockLoggerError, event: vi.fn(), warn: vi.fn() },
}));

function vaultData(
  overrides: {
    status?: number;
    verifiedAt?: bigint;
    hashlock?: string;
  } = {},
) {
  return {
    basic: { status: overrides.status ?? OnChainBtcVaultStatus.EXPIRED },
    protocol: {
      verifiedAt: overrides.verifiedAt ?? 1_000n,
      claimExpiredUntil: CLAIM_EXPIRED_UNTIL,
      hashlock: overrides.hashlock ?? HASHLOCK,
      prePeginTxHash: PRE_PEGIN_TX,
      htlcVout: 0,
      depositorSignedPeginTx: SIGNED_PEGIN,
    },
  };
}

const ACTIVITY = { id: VAULT_ID } as VaultActivity;

function renderClaim() {
  const queryClient = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(
    () =>
      useClaimExpiredVault({
        activity: ACTIVITY,
        depositorEthAddress: DEPOSITOR_ETH,
      }),
    { wrapper },
  );
}

async function claim(
  result: ReturnType<typeof renderClaim>["result"],
  secret = SECRET,
) {
  await act(async () => {
    await result.current.handleClaim(secret);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  gateMock.value = { protocol: null, aave: null };
  mockGetVaultData.mockResolvedValue(vaultData());
  mockGetOnChainPauseState.mockResolvedValue(null);
  mockGetBlockNumber.mockResolvedValue(CLAIM_EXPIRED_UNTIL - 100n);
  mockFetchHtlcSpend.mockResolvedValue({
    spent: true,
    confirmed: true,
    spendingTxid: PEGIN_TX.slice(2),
  });
  mockGetTxHex.mockResolvedValue(PEGIN_TX_HEX);
  mockPeginWitnessRevealsSecret.mockReturnValue(true);
  mockClaimExpiredVaultWithSecret.mockResolvedValue({
    transactionHash: `0x${"99".repeat(32)}`,
    receipt: { status: "success" },
  });
});

describe("useClaimExpiredVault", () => {
  it("redeems with the on-chain hashlock once every pre-check passes", async () => {
    const { result } = renderClaim();

    await claim(result);

    expect(mockClaimExpiredVaultWithSecret).toHaveBeenCalledWith({
      vaultId: VAULT_ID,
      secret: SECRET,
      hashlock: HASHLOCK,
      walletClient: mockWalletClient,
    });
    expect(mockFetchHtlcSpend).toHaveBeenCalledWith(
      PRE_PEGIN_TX,
      0,
      "https://mempool.test/api",
    );
    // The PegIn is fetched by the on-chain txid and proven against the
    // on-chain HTLC outpoint and hashlock.
    expect(mockGetTxHex).toHaveBeenCalledWith(
      PEGIN_TX.slice(2),
      "https://mempool.test/api",
    );
    expect(mockPeginWitnessRevealsSecret).toHaveBeenCalledWith(PEGIN_TX_HEX, {
      peginTxid: PEGIN_TX,
      prePeginTxHash: PRE_PEGIN_TX,
      htlcVout: 0,
      hashlock: HASHLOCK,
    });
    expect(result.current.claimed).toBe(true);
    expect(result.current.error).toBeNull();
    expect(mockSetOptimisticStatus).toHaveBeenCalledWith(
      VAULT_ID,
      LocalStorageStatus.CLAIM_EXPIRED_SUBMITTED,
    );
  });

  it("refuses, retryably, when the PegIn's witness does not prove the secret is already public", async () => {
    mockPeginWitnessRevealsSecret.mockReturnValue(false);
    const { result } = renderClaim();

    await claim(result);

    expect(result.current.error).toBe(
      COPY.deposit.claimExpired.errors.peginProofFailed,
    );
    expect(result.current.errorTerminal).toBe(false);
    expect(mockClaimExpiredVaultWithSecret).not.toHaveBeenCalled();
  });

  it("refuses, retryably, when the PegIn cannot be read from Bitcoin", async () => {
    mockGetTxHex.mockRejectedValue(new Error("Mempool API error (404)"));
    const { result } = renderClaim();

    await claim(result);

    expect(result.current.error).toBe(
      COPY.deposit.claimExpired.errors.peginProofUnavailable,
    );
    expect(result.current.errorTerminal).toBe(false);
    expect(mockPeginWitnessRevealsSecret).not.toHaveBeenCalled();
    expect(mockClaimExpiredVaultWithSecret).not.toHaveBeenCalled();
  });

  it("refuses while the cached gate shows the protocol paused, before any read", async () => {
    gateMock.value = { protocol: "paused", aave: null };
    const { result } = renderClaim();

    await claim(result);

    expect(result.current.error).toBe(COPY.pegin.claimExpiredPaused);
    expect(mockGetVaultData).not.toHaveBeenCalled();
    expect(mockClaimExpiredVaultWithSecret).not.toHaveBeenCalled();
  });

  it("refuses when the fresh pause read shows the protocol paused", async () => {
    mockGetOnChainPauseState.mockResolvedValue({
      protocol: "paused",
      aave: null,
    });
    const { result } = renderClaim();

    await claim(result);

    expect(result.current.error).toBe(COPY.pegin.claimExpiredPaused);
    expect(mockClaimExpiredVaultWithSecret).not.toHaveBeenCalled();
  });

  it("reports an already-redeemed vault as terminal without writing", async () => {
    mockGetVaultData.mockResolvedValue(
      vaultData({ status: OnChainBtcVaultStatus.REDEEMED }),
    );
    const { result } = renderClaim();

    await claim(result);

    expect(result.current.error).toBe(
      COPY.deposit.claimExpired.errors.alreadyRedeemed,
    );
    expect(result.current.errorTerminal).toBe(true);
    expect(mockClaimExpiredVaultWithSecret).not.toHaveBeenCalled();
  });

  it("refuses a vault the chain does not report as Expired", async () => {
    mockGetVaultData.mockResolvedValue(
      vaultData({ status: OnChainBtcVaultStatus.VERIFIED }),
    );
    const { result } = renderClaim();

    await claim(result);

    expect(result.current.error).toBe(
      COPY.deposit.claimExpired.errors.notRedeemable,
    );
    expect(result.current.errorTerminal).toBe(true);
    expect(mockClaimExpiredVaultWithSecret).not.toHaveBeenCalled();
  });

  it("refuses a vault that expired without verification", async () => {
    mockGetVaultData.mockResolvedValue(vaultData({ verifiedAt: 0n }));
    const { result } = renderClaim();

    await claim(result);

    expect(result.current.error).toBe(
      COPY.deposit.claimExpired.errors.notVerified,
    );
    expect(mockClaimExpiredVaultWithSecret).not.toHaveBeenCalled();
  });

  it("refuses on the click, before any wallet prompt, once the head is past claimExpiredUntil", async () => {
    // Only the first read is late; a later read would be in time.
    mockGetBlockNumber.mockResolvedValueOnce(CLAIM_EXPIRED_UNTIL + 1n);
    const { result } = renderClaim();

    await claim(result);

    expect(result.current.error).toBe(
      COPY.deposit.claimExpired.errors.windowClosed,
    );
    expect(result.current.errorTerminal).toBe(true);
    expect(switchChain).not.toHaveBeenCalled();
    expect(mockClaimExpiredVaultWithSecret).not.toHaveBeenCalled();
  });

  it("refuses on the click once the head reaches claimExpiredUntil, since the redeem would be mined after it", async () => {
    mockGetBlockNumber.mockResolvedValueOnce(CLAIM_EXPIRED_UNTIL);
    const { result } = renderClaim();

    await claim(result);

    expect(result.current.error).toBe(
      COPY.deposit.claimExpired.errors.windowClosed,
    );
    expect(switchChain).not.toHaveBeenCalled();
    expect(mockClaimExpiredVaultWithSecret).not.toHaveBeenCalled();
  });

  it("refuses when the head reaches claimExpiredUntil while the wallet prompts", async () => {
    // The first read is in time; the re-read just before the write is not.
    mockGetBlockNumber
      .mockResolvedValueOnce(CLAIM_EXPIRED_UNTIL - 10n)
      .mockResolvedValueOnce(CLAIM_EXPIRED_UNTIL);
    const { result } = renderClaim();

    await claim(result);

    expect(result.current.error).toBe(
      COPY.deposit.claimExpired.errors.windowClosed,
    );
    // The late read is the one taken after the wallet client was obtained.
    expect(mockGetBlockNumber.mock.invocationCallOrder[1]).toBeGreaterThan(
      vi.mocked(getWalletClient).mock.invocationCallOrder[0],
    );
    expect(mockClaimExpiredVaultWithSecret).not.toHaveBeenCalled();
  });

  it("says the vault record is not readable yet when the node returns an empty record", async () => {
    mockGetVaultData.mockRejectedValue(
      new Error(`Vault ${VAULT_ID} not found on-chain`),
    );
    const { result } = renderClaim();

    await claim(result);

    expect(result.current.error).toBe(
      COPY.deposit.claimExpired.errors.vaultRecordUnavailable,
    );
    expect(mockClaimExpiredVaultWithSecret).not.toHaveBeenCalled();
  });

  it("still redeems one block before claimExpiredUntil", async () => {
    mockGetBlockNumber.mockResolvedValue(CLAIM_EXPIRED_UNTIL - 1n);
    const { result } = renderClaim();

    await claim(result);

    expect(mockClaimExpiredVaultWithSecret).toHaveBeenCalledOnce();
  });

  it("refuses, retryably, when the head cannot be read on the click", async () => {
    mockGetBlockNumber.mockRejectedValue(new Error("rpc down"));
    const { result } = renderClaim();

    await claim(result);

    expect(result.current.error).toBe(
      COPY.deposit.claimExpired.errors.windowUnavailable,
    );
    expect(result.current.errorTerminal).toBe(false);
    expect(switchChain).not.toHaveBeenCalled();
    expect(mockClaimExpiredVaultWithSecret).not.toHaveBeenCalled();
  });

  it("refuses, retryably, when the head cannot be re-read before the write", async () => {
    mockGetBlockNumber
      .mockResolvedValueOnce(CLAIM_EXPIRED_UNTIL - 10n)
      .mockRejectedValueOnce(new Error("rpc down"));
    const { result } = renderClaim();

    await claim(result);

    expect(result.current.error).toBe(
      COPY.deposit.claimExpired.errors.windowUnavailable,
    );
    expect(result.current.errorTerminal).toBe(false);
    expect(mockClaimExpiredVaultWithSecret).not.toHaveBeenCalled();
  });

  it("refuses while the HTLC is unspent, so the secret cannot race the refund", async () => {
    mockFetchHtlcSpend.mockResolvedValue({ spent: false, confirmed: false });
    const { result } = renderClaim();

    await claim(result);

    expect(result.current.error).toBe(
      COPY.deposit.claimExpired.errors.notSpentByPegin,
    );
    // A PegIn may still appear, so Retry stays available.
    expect(result.current.errorTerminal).toBe(false);
    expect(mockClaimExpiredVaultWithSecret).not.toHaveBeenCalled();
  });

  it("refuses for good when a confirmed transaction other than the PegIn spent the HTLC", async () => {
    mockFetchHtlcSpend.mockResolvedValue({
      spent: true,
      confirmed: true,
      spendingTxid: OTHER_TX.slice(2),
    });
    const { result } = renderClaim();

    await claim(result);

    expect(result.current.error).toBe(
      COPY.deposit.claimExpired.errors.spentByOther,
    );
    expect(result.current.errorTerminal).toBe(true);
    expect(mockClaimExpiredVaultWithSecret).not.toHaveBeenCalled();
  });

  it("refuses, retryably, while the competing spend is unconfirmed", async () => {
    mockFetchHtlcSpend.mockResolvedValue({
      spent: true,
      confirmed: false,
      spendingTxid: OTHER_TX.slice(2),
    });
    const { result } = renderClaim();

    await claim(result);

    expect(result.current.error).toBe(
      COPY.deposit.claimExpired.errors.spentByOtherUnconfirmed,
    );
    expect(result.current.errorTerminal).toBe(false);
    expect(mockClaimExpiredVaultWithSecret).not.toHaveBeenCalled();
  });

  it("refuses, retryably, when the Bitcoin spend cannot be read", async () => {
    mockFetchHtlcSpend.mockRejectedValue(new Error("429"));
    const { result } = renderClaim();

    await claim(result);

    expect(result.current.error).toBe(
      COPY.deposit.claimExpired.errors.spendUnavailable,
    );
    expect(result.current.errorTerminal).toBe(false);
    expect(mockClaimExpiredVaultWithSecret).not.toHaveBeenCalled();
  });

  it("refuses, retryably, a confirmed spend whose transaction is not reported", async () => {
    mockFetchHtlcSpend.mockResolvedValue({ spent: true, confirmed: true });
    const { result } = renderClaim();

    await claim(result);

    expect(result.current.error).toBe(
      COPY.deposit.claimExpired.errors.spenderUnknown,
    );
    expect(result.current.errorTerminal).toBe(false);
    expect(mockClaimExpiredVaultWithSecret).not.toHaveBeenCalled();
  });

  it("refuses a secret that does not match the on-chain hashlock, naming the wallet as the cause", async () => {
    const { result } = renderClaim();

    await claim(result, `0x${"22".repeat(32)}`);

    expect(result.current.error).toBe(
      COPY.deposit.claimExpired.errors.secretMismatch,
    );
    expect(mockClaimExpiredVaultWithSecret).not.toHaveBeenCalled();
  });

  it("reports a failed write as retryable and records no optimistic status", async () => {
    mockClaimExpiredVaultWithSecret.mockRejectedValue(
      new Error("The grace window to redeem this expired BTCVault has closed."),
    );
    const { result } = renderClaim();

    await claim(result);

    expect(result.current.claimed).toBe(false);
    expect(result.current.errorTerminal).toBe(false);
    expect(mockSetOptimisticStatus).not.toHaveBeenCalled();
    expect(mockLoggerError).toHaveBeenCalledOnce();
  });
});
