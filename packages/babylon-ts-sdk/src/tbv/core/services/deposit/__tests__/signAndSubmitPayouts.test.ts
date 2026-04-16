import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BitcoinWallet } from "../../../../../shared/wallets/interfaces";
import {
  DaemonStatus,
  type ClaimerTransactions,
  type DepositorGraphTransactions,
  type GetPeginStatusResponse,
  type RequestDepositorPresignTransactionsResponse,
} from "../../../clients/vault-provider/types";
import type { PeginStatusReader, PresignClient } from "../interfaces";
import { pollAndSignPayouts, type PayoutSigningContext } from "../signAndSubmitPayouts";

// ---------------------------------------------------------------------------
// Mocks — we test the orchestration, not PSBT internals or PayoutManager
// ---------------------------------------------------------------------------

vi.mock("../signDepositorGraph", () => ({
  signDepositorGraph: vi.fn(async () => ({
    payout_signatures: { payout_signature: "depositor_payout_sig" },
    per_challenger: {
      ["c".repeat(64)]: { nopayout_signature: "depositor_nopayout_sig" },
    },
  })),
}));

vi.mock("../../../managers/PayoutManager", () => {
  return {
    PayoutManager: class MockPayoutManager {
      supportsBatchSigning() {
        return true;
      }
      async signPayoutTransactionsBatch(inputs: unknown[]) {
        return (inputs as unknown[]).map(() => ({
          payoutSignature: "mock_payout_sig",
        }));
      }
      async signPayoutTransaction() {
        return { signature: "mock_payout_sig" };
      }
    },
  };
});

vi.mock("../../../primitives/utils/bitcoin", () => ({
  processPublicKeyToXOnly: (pk: string) =>
    pk.startsWith("0x") ? pk.slice(2) : pk.length === 66 ? pk.slice(2) : pk,
  stripHexPrefix: (s: string) =>
    s.startsWith("0x") ? s.slice(2) : s,
}));

vi.mock("bitcoinjs-lib", () => ({
  payments: {
    p2tr: ({ internalPubkey }: { internalPubkey: Buffer }) => ({
      output: Buffer.from("5120" + internalPubkey.toString("hex"), "hex"),
    }),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_TXID = "a".repeat(64);
const DEPOSITOR_PK = "d".repeat(64);
const VP_PUBKEY = "e".repeat(64);
const VK_PUBKEY = "f".repeat(64);
const CHALLENGER_PK = "c".repeat(64);

function createMockStatusReader(
  statuses: DaemonStatus[],
): PeginStatusReader {
  let callIdx = 0;
  return {
    getPeginStatus: vi.fn(
      async (): Promise<GetPeginStatusResponse> => ({
        pegin_txid: VALID_TXID,
        status:
          statuses[callIdx++] ?? DaemonStatus.PENDING_INGESTION,
        progress: {},
        health_info: "ok",
      }),
    ),
  };
}

function createMockPresignClient(
  response?: Partial<RequestDepositorPresignTransactionsResponse>,
): PresignClient {
  const defaultClaimer: ClaimerTransactions = {
    claimer_pubkey: VP_PUBKEY,
    claim_tx: { tx_hex: "deadbeef" },
    assert_tx: { tx_hex: "deadbeef" },
    payout_tx: { tx_hex: "deadbeef" },
    payout_psbt: "mock_psbt",
  };

  const defaultDepositorGraph: DepositorGraphTransactions = {
    claim_tx: { tx_hex: "deadbeef" },
    assert_tx: { tx_hex: "deadbeef" },
    payout_tx: { tx_hex: "deadbeef" },
    payout_psbt: "mock_psbt",
    challenger_presign_data: [
      {
        challenger_pubkey: CHALLENGER_PK,
        challenge_assert_x_tx: { tx_hex: "deadbeef" },
        challenge_assert_y_tx: { tx_hex: "deadbeef" },
        nopayout_tx: { tx_hex: "deadbeef" },
        nopayout_psbt: "mock_nopayout_psbt",
        challenge_assert_connectors: [],
        output_label_hashes: [],
      },
    ],
    offchain_params_version: 1,
  };

  return {
    requestDepositorPresignTransactions: vi.fn(async () => ({
      txs: [defaultClaimer, ...(response?.txs?.slice(1) ?? [])],
      depositor_graph:
        response?.depositor_graph ?? defaultDepositorGraph,
    })),
    submitDepositorPresignatures: vi.fn(async () => {}),
  };
}

function createMockWallet(): BitcoinWallet {
  return {
    getPublicKeyHex: vi.fn(async () => "w".repeat(64)),
    signPsbt: vi.fn(async (hex: string) => `signed_${hex}`),
    signPsbts: vi.fn(async (hexes: string[]) =>
      hexes.map((h) => `signed_${h}`),
    ),
  } as unknown as BitcoinWallet;
}

function createSigningContext(): PayoutSigningContext {
  return {
    peginTxHex: "01000000" + "00".repeat(60),
    vaultProviderBtcPubkey: VP_PUBKEY,
    vaultKeeperBtcPubkeys: [VK_PUBKEY],
    universalChallengerBtcPubkeys: [CHALLENGER_PK],
    depositorBtcPubkey: DEPOSITOR_PK,
    timelockPegin: 100,
    network: "Testnet4" as never,
    registeredPayoutScriptPubKey: "0x5120" + DEPOSITOR_PK,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("pollAndSignPayouts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("skips when VP already past payout signing (ACTIVATED)", async () => {
    const reader = createMockStatusReader([DaemonStatus.ACTIVATED]);
    const presignClient = createMockPresignClient();

    await pollAndSignPayouts({
      statusReader: reader,
      presignClient,
      btcWallet: createMockWallet(),
      peginTxid: VALID_TXID,
      depositorPk: DEPOSITOR_PK,
      signingContext: createSigningContext(),
    });

    expect(
      presignClient.requestDepositorPresignTransactions,
    ).not.toHaveBeenCalled();
    expect(
      presignClient.submitDepositorPresignatures,
    ).not.toHaveBeenCalled();
  });

  it("skips when VP is in PENDING_ACKS", async () => {
    const reader = createMockStatusReader([DaemonStatus.PENDING_ACKS]);
    const presignClient = createMockPresignClient();

    await pollAndSignPayouts({
      statusReader: reader,
      presignClient,
      btcWallet: createMockWallet(),
      peginTxid: VALID_TXID,
      depositorPk: DEPOSITOR_PK,
      signingContext: createSigningContext(),
    });

    expect(
      presignClient.requestDepositorPresignTransactions,
    ).not.toHaveBeenCalled();
  });

  it("fetches presign txs, signs, and submits when VP is ready", async () => {
    const reader = createMockStatusReader([
      DaemonStatus.PENDING_DEPOSITOR_SIGNATURES,
    ]);
    const presignClient = createMockPresignClient();
    const wallet = createMockWallet();

    await pollAndSignPayouts({
      statusReader: reader,
      presignClient,
      btcWallet: wallet,
      peginTxid: VALID_TXID,
      depositorPk: DEPOSITOR_PK,
      signingContext: createSigningContext(),
    });

    expect(
      presignClient.requestDepositorPresignTransactions,
    ).toHaveBeenCalledWith(
      { pegin_txid: VALID_TXID, depositor_pk: DEPOSITOR_PK },
      undefined, // signal
    );

    expect(
      presignClient.submitDepositorPresignatures,
    ).toHaveBeenCalledOnce();

    // Verify the submission includes depositor's own claimer signatures
    const submitCall = (
      presignClient.submitDepositorPresignatures as ReturnType<typeof vi.fn>
    ).mock.calls[0][0];
    expect(submitCall.pegin_txid).toBe(VALID_TXID);
    expect(submitCall.depositor_pk).toBe(DEPOSITOR_PK);
    expect(submitCall.depositor_claimer_presignatures).toBeDefined();
    expect(
      submitCall.depositor_claimer_presignatures.payout_signatures
        .payout_signature,
    ).toBe("depositor_payout_sig");
  });

  it("polls until VP reaches PENDING_DEPOSITOR_SIGNATURES", async () => {
    const reader = createMockStatusReader([
      DaemonStatus.PENDING_INGESTION,
      DaemonStatus.PENDING_DEPOSITOR_SIGNATURES,
    ]);
    const presignClient = createMockPresignClient();

    const resultPromise = pollAndSignPayouts({
      statusReader: reader,
      presignClient,
      btcWallet: createMockWallet(),
      peginTxid: VALID_TXID,
      depositorPk: DEPOSITOR_PK,
      signingContext: createSigningContext(),
    });

    // Advance past the default poll interval (10s)
    await vi.advanceTimersByTimeAsync(15_000);
    await resultPromise;

    expect(
      presignClient.submitDepositorPresignatures,
    ).toHaveBeenCalledOnce();
  });

  it("calls onProgress callback", async () => {
    const reader = createMockStatusReader([
      DaemonStatus.PENDING_DEPOSITOR_SIGNATURES,
    ]);
    const presignClient = createMockPresignClient();
    const onProgress = vi.fn();

    await pollAndSignPayouts({
      statusReader: reader,
      presignClient,
      btcWallet: createMockWallet(),
      peginTxid: VALID_TXID,
      depositorPk: DEPOSITOR_PK,
      signingContext: createSigningContext(),
      onProgress,
    });

    // Progress should be called at least for start (0, N) and end (N, N)
    expect(onProgress).toHaveBeenCalled();
    const lastCall = onProgress.mock.calls[onProgress.mock.calls.length - 1];
    expect(lastCall[0]).toBe(lastCall[1]); // completed === total
  });

  it("filters out depositor's own claimer entry from PayoutManager signing", async () => {
    // Include the depositor as a claimer in the VP response
    const depositorClaimer: ClaimerTransactions = {
      claimer_pubkey: DEPOSITOR_PK,
      claim_tx: { tx_hex: "deadbeef" },
      assert_tx: { tx_hex: "deadbeef" },
      payout_tx: { tx_hex: "deadbeef" },
      payout_psbt: "mock_psbt",
    };
    const vpClaimer: ClaimerTransactions = {
      claimer_pubkey: VP_PUBKEY,
      claim_tx: { tx_hex: "deadbeef" },
      assert_tx: { tx_hex: "deadbeef" },
      payout_tx: { tx_hex: "deadbeef" },
      payout_psbt: "mock_psbt",
    };

    const reader = createMockStatusReader([
      DaemonStatus.PENDING_DEPOSITOR_SIGNATURES,
    ]);
    const presignClient: PresignClient = {
      requestDepositorPresignTransactions: vi.fn(async () => ({
        txs: [vpClaimer, depositorClaimer],
        depositor_graph: {
          claim_tx: { tx_hex: "deadbeef" },
          assert_tx: { tx_hex: "deadbeef" },
          payout_tx: { tx_hex: "deadbeef" },
          payout_psbt: "mock_psbt",
          challenger_presign_data: [],
          offchain_params_version: 1,
        },
      })),
      submitDepositorPresignatures: vi.fn(async () => {}),
    };

    await pollAndSignPayouts({
      statusReader: reader,
      presignClient,
      btcWallet: createMockWallet(),
      peginTxid: VALID_TXID,
      depositorPk: DEPOSITOR_PK,
      signingContext: createSigningContext(),
    });

    // Submission should have depositor's key in signatures (from signDepositorGraph)
    const submitCall = (
      presignClient.submitDepositorPresignatures as ReturnType<typeof vi.fn>
    ).mock.calls[0][0];
    expect(submitCall.signatures[DEPOSITOR_PK]).toBeDefined();
    expect(
      submitCall.signatures[DEPOSITOR_PK].payout_signature,
    ).toBe("depositor_payout_sig");
  });

  it("throws when already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      pollAndSignPayouts({
        statusReader: createMockStatusReader([]),
        presignClient: createMockPresignClient(),
        btcWallet: createMockWallet(),
        peginTxid: VALID_TXID,
        depositorPk: DEPOSITOR_PK,
        signingContext: createSigningContext(),
        signal: controller.signal,
      }),
    ).rejects.toThrow();
  });
});
