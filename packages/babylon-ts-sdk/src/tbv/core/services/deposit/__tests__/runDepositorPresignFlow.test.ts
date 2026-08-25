import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BitcoinWallet } from "../../../../../shared/wallets/interfaces";
import {
  DaemonStatus,
  type ClaimerTransactions,
  type DepositorGraphTransactions,
  type GetPeginStatusResponse,
  type RequestDepositorPresignTransactionsResponse,
} from "../../../clients/vault-provider/types";
import type {
  DepositTerms,
  DepositTermsApprover,
} from "../../../deposit-terms";
import type { PeginStatusReader, PresignClient } from "../interfaces";
import {
  runDepositorPresignFlow,
  type PayoutSigningContext,
} from "../runDepositorPresignFlow";

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

const capturedPayoutInputs = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock("../../../managers/PayoutManager", () => {
  return {
    PayoutManager: class MockPayoutManager {
      supportsBatchSigning() {
        return true;
      }
      async signPayoutTransactionsBatch(inputs: unknown[]) {
        capturedPayoutInputs.push(...(inputs as Record<string, unknown>[]));
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
  stripHexPrefix: (s: string) => (s.startsWith("0x") ? s.slice(2) : s),
  deriveBip86ScriptPubKeyHex: (xOnlyPubkey: string) => `0x5120${xOnlyPubkey}`,
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

function createMockStatusReader(statuses: DaemonStatus[]): PeginStatusReader {
  let callIdx = 0;
  return {
    getPeginStatus: vi.fn(
      async (): Promise<GetPeginStatusResponse> => ({
        pegin_txid: VALID_TXID,
        status: statuses[callIdx++] ?? DaemonStatus.PENDING_INGESTION,
        progress: {},
        health_info: "ok",
      }),
    ),
  };
}

function createMockPresignClient(
  response?: Partial<RequestDepositorPresignTransactionsResponse>,
): PresignClient {
  const vpClaimer: ClaimerTransactions = {
    claimer_pubkey: VP_PUBKEY,
    claim_tx: { tx_hex: "deadbeef" },
    assert_tx: { tx_hex: "deadbeef" },
    payout_tx: { tx_hex: "deadbeef" },
    payout_psbt: "mock_psbt",
  };
  const vkClaimer: ClaimerTransactions = {
    claimer_pubkey: VK_PUBKEY,
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
      txs: response?.txs ?? [vpClaimer, vkClaimer],
      depositor_graph: response?.depositor_graph ?? defaultDepositorGraph,
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

/** Capability-stub wallet: has `approveDepositTerms`, so `supportsDepositApproval` is true. */
function createCapabilityWallet(
  onApprove?: (terms: DepositTerms) => void,
): BitcoinWallet & DepositTermsApprover {
  return {
    ...createMockWallet(),
    approveDepositTerms: vi.fn(async (terms: DepositTerms) => {
      onApprove?.(terms);
    }),
    getChangeAddress: vi.fn(async () => "tb1pchange"),
  } as unknown as BitcoinWallet & DepositTermsApprover;
}

const DEPOSIT_TERMS: DepositTerms = {
  vaultCoreVersion: 1,
  protocolFeeRate: 2n,
  timelockPegin: 144,
  timelockAssert: 144,
  timelockRefund: 4320,
  prepeginTxid: "1".repeat(64),
  prepeginMaxFee: 1500n,
  vaultKeeperBtcPubkeys: [VK_PUBKEY],
  universalChallengerBtcPubkeys: [CHALLENGER_PK],
  vaults: [
    {
      htlcVout: 0,
      vaultProviderBtcPubkey: VP_PUBKEY,
      peginAmount: 500_000n,
      commissionFee: 12_500n,
      depositorClaimValue: 20_000n,
      peginMaxFee: 800n,
    },
  ],
};

function createSigningContext(): PayoutSigningContext {
  return {
    // Un-rotated operator set: the registry backfills BIP-86, so these match
    // what local derivation would produce. Threaded through to buildPayoutPsbt,
    // which is mocked here — the values only need to be well-formed.
    vkClaimerPayoutScriptPubKeys: {
      [VK_PUBKEY.toLowerCase()]: `0x5120${VK_PUBKEY}`,
    },
    vpCommissionScriptPubKey: `0x5120${VP_PUBKEY}`,
    vaultCoreVersion: 1,
    peginTxHex: "01000000" + "00".repeat(60),
    vaultProviderBtcPubkey: VP_PUBKEY,
    vaultKeeperBtcPubkeys: [VK_PUBKEY],
    universalChallengerBtcPubkeys: [CHALLENGER_PK],
    depositorBtcPubkey: DEPOSITOR_PK,
    // Production derives both from one on-chain value (deriveTimelockPegin is
    // Number(timelockAssert)), matching btc-vault's P == t2.
    timelockPegin: 144,
    timelockAssert: 144,
    councilMembers: ["c".repeat(64)],
    councilQuorum: 1,
    network: "Testnet4" as never,
    registeredPayoutScriptPubKey: "0x5120" + DEPOSITOR_PK,
    commissionBps: 50,
    protocolFeeRate: 2n,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runDepositorPresignFlow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("skips when VP already past payout signing (ACTIVATED)", async () => {
    const reader = createMockStatusReader([DaemonStatus.ACTIVATED]);
    const presignClient = createMockPresignClient();

    await runDepositorPresignFlow({
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
    expect(presignClient.submitDepositorPresignatures).not.toHaveBeenCalled();
  });

  it("skips when VP is in PENDING_ACKS", async () => {
    const reader = createMockStatusReader([DaemonStatus.PENDING_ACKS]);
    const presignClient = createMockPresignClient();

    await runDepositorPresignFlow({
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

  it("skips when VP is in ACTIVATED_PENDING_BROADCAST (resume past payout)", async () => {
    const reader = createMockStatusReader([
      DaemonStatus.ACTIVATED_PENDING_BROADCAST,
    ]);
    const presignClient = createMockPresignClient();

    await runDepositorPresignFlow({
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
    expect(presignClient.submitDepositorPresignatures).not.toHaveBeenCalled();
  });

  it("fetches presign txs, signs, and submits when VP is ready", async () => {
    const reader = createMockStatusReader([
      DaemonStatus.PENDING_DEPOSITOR_SIGNATURES,
    ]);
    const presignClient = createMockPresignClient();
    const wallet = createMockWallet();

    await runDepositorPresignFlow({
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

    expect(presignClient.submitDepositorPresignatures).toHaveBeenCalledOnce();

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

    const resultPromise = runDepositorPresignFlow({
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

    expect(presignClient.submitDepositorPresignatures).toHaveBeenCalledOnce();
  });

  it("calls onProgress callback", async () => {
    const reader = createMockStatusReader([
      DaemonStatus.PENDING_DEPOSITOR_SIGNATURES,
    ]);
    const presignClient = createMockPresignClient();
    const onProgress = vi.fn();

    await runDepositorPresignFlow({
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
    // Include the depositor as a claimer in the VP response, alongside the
    // required {VP, VK} set the new completeness assertion expects.
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
    const vkClaimer: ClaimerTransactions = {
      claimer_pubkey: VK_PUBKEY,
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
        txs: [vpClaimer, vkClaimer, depositorClaimer],
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

    await runDepositorPresignFlow({
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
    expect(submitCall.signatures[DEPOSITOR_PK].payout_signature).toBe(
      "depositor_payout_sig",
    );
  });

  it("throws when already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      runDepositorPresignFlow({
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

  describe("non-depositor claimer set completeness", () => {
    const vpEntry: ClaimerTransactions = {
      claimer_pubkey: VP_PUBKEY,
      claim_tx: { tx_hex: "deadbeef" },
      assert_tx: { tx_hex: "deadbeef" },
      payout_tx: { tx_hex: "deadbeef" },
      payout_psbt: "mock_psbt",
    };
    const vkEntry: ClaimerTransactions = {
      claimer_pubkey: VK_PUBKEY,
      claim_tx: { tx_hex: "deadbeef" },
      assert_tx: { tx_hex: "deadbeef" },
      payout_tx: { tx_hex: "deadbeef" },
      payout_psbt: "mock_psbt",
    };
    const depositorEntry: ClaimerTransactions = {
      claimer_pubkey: DEPOSITOR_PK,
      claim_tx: { tx_hex: "deadbeef" },
      assert_tx: { tx_hex: "deadbeef" },
      payout_tx: { tx_hex: "deadbeef" },
      payout_psbt: "mock_psbt",
    };
    const unknownEntry: ClaimerTransactions = {
      claimer_pubkey: "1".repeat(64),
      claim_tx: { tx_hex: "deadbeef" },
      assert_tx: { tx_hex: "deadbeef" },
      payout_tx: { tx_hex: "deadbeef" },
      payout_psbt: "mock_psbt",
    };

    function runWith(txs: ClaimerTransactions[]) {
      const reader = createMockStatusReader([
        DaemonStatus.PENDING_DEPOSITOR_SIGNATURES,
      ]);
      const presignClient = createMockPresignClient({ txs });
      const wallet = createMockWallet();
      const promise = runDepositorPresignFlow({
        statusReader: reader,
        presignClient,
        btcWallet: wallet,
        peginTxid: VALID_TXID,
        depositorPk: DEPOSITOR_PK,
        signingContext: createSigningContext(),
      });
      return { promise, presignClient, wallet };
    }

    it("rejects response that omits a registered vault keeper", async () => {
      const { promise, presignClient, wallet } = runWith([vpEntry]);
      await expect(promise).rejects.toThrow(/missing/i);
      expect(presignClient.submitDepositorPresignatures).not.toHaveBeenCalled();
      expect(wallet.signPsbts).not.toHaveBeenCalled();
    });

    it("rejects empty response", async () => {
      const { promise, presignClient, wallet } = runWith([]);
      await expect(promise).rejects.toThrow(/missing/i);
      expect(presignClient.submitDepositorPresignatures).not.toHaveBeenCalled();
      expect(wallet.signPsbts).not.toHaveBeenCalled();
    });

    it("rejects response containing a duplicate claimer entry", async () => {
      const { promise, presignClient, wallet } = runWith([
        vpEntry,
        vkEntry,
        vkEntry,
      ]);
      await expect(promise).rejects.toThrow(/duplicate/i);
      expect(presignClient.submitDepositorPresignatures).not.toHaveBeenCalled();
      expect(wallet.signPsbts).not.toHaveBeenCalled();
    });

    it("rejects response containing an unknown extra claimer before signing", async () => {
      const { promise, presignClient, wallet } = runWith([
        vpEntry,
        vkEntry,
        unknownEntry,
      ]);
      await expect(promise).rejects.toThrow(/unexpected/i);
      expect(presignClient.submitDepositorPresignatures).not.toHaveBeenCalled();
      expect(wallet.signPsbts).not.toHaveBeenCalled();
    });

    it("accepts the happy path with {VP, all VKs} plus the depositor entry", async () => {
      const { promise, presignClient } = runWith([
        vpEntry,
        vkEntry,
        depositorEntry,
      ]);
      await promise;
      expect(presignClient.submitDepositorPresignatures).toHaveBeenCalledOnce();
    });

    it("filters out an uppercase-hex depositor entry consistently with the assertion", async () => {
      // VP returns the depositor's claimer entry as uppercase hex (allowed
      // by the VP-response schema validator) while signing context has it
      // lowercase. Both the assertion and the depositor filter must
      // normalize case identically, so:
      //  - the assertion passes (set still equals {VP, VK})
      //  - the depositor entry is filtered out before Phase 3 signing
      //  - the submitted signatures map contains only the lowercase
      //    depositor key, never the uppercase variant
      const uppercaseDepositorEntry: ClaimerTransactions = {
        ...depositorEntry,
        claimer_pubkey: DEPOSITOR_PK.toUpperCase(),
      };
      const { promise, presignClient } = runWith([
        vpEntry,
        vkEntry,
        uppercaseDepositorEntry,
      ]);
      await promise;

      const submitCall = (
        presignClient.submitDepositorPresignatures as ReturnType<typeof vi.fn>
      ).mock.calls[0][0];
      const keys = Object.keys(submitCall.signatures);
      expect(keys).toContain(DEPOSITOR_PK);
      expect(keys).not.toContain(DEPOSITOR_PK.toUpperCase());
      // {VP, VK, depositor} = 3 keys, no duplicate cased-variant of the depositor
      expect(keys).toHaveLength(3);
    });

    it("rejects [VP, VK, depositor, depositor] with a duplicate depositor entry", async () => {
      // Duplicate detection must run on the full supplied list before the
      // depositor entries are filtered out, otherwise a duplicated
      // depositor entry slips through silently.
      const { promise, presignClient, wallet } = runWith([
        vpEntry,
        vkEntry,
        depositorEntry,
        depositorEntry,
      ]);
      await expect(promise).rejects.toThrow(/duplicate/i);
      expect(presignClient.submitDepositorPresignatures).not.toHaveBeenCalled();
      expect(wallet.signPsbts).not.toHaveBeenCalled();
    });
  });

  it("threads every payout signing-input field from the context", async () => {
    // The batch inputs are built by buildPayoutSigningInput — a hardcoded
    // field there (rate, councilSize, timelock, keys) must fail here.
    capturedPayoutInputs.length = 0;
    const reader = createMockStatusReader([
      DaemonStatus.PENDING_DEPOSITOR_SIGNATURES,
    ]);
    const context = createSigningContext();

    await runDepositorPresignFlow({
      statusReader: reader,
      presignClient: createMockPresignClient(),
      btcWallet: createMockWallet(),
      peginTxid: VALID_TXID,
      depositorPk: DEPOSITOR_PK,
      signingContext: context,
    });

    expect(capturedPayoutInputs.length).toBeGreaterThan(0);
    for (const input of capturedPayoutInputs) {
      expect(input).toMatchObject({
        vaultCoreVersion: context.vaultCoreVersion,
        vaultKeeperBtcPubkeys: context.vaultKeeperBtcPubkeys,
        universalChallengerBtcPubkeys: context.universalChallengerBtcPubkeys,
        timelockPegin: context.timelockPegin,
        registeredPayoutScriptPubKey: context.registeredPayoutScriptPubKey,
        commissionBps: context.commissionBps,
        protocolFeeRate: context.protocolFeeRate,
        councilMembers: context.councilMembers,
        councilQuorum: context.councilQuorum,
      });
    }
  });

  describe("deposit terms approval", () => {
    it("approves the deposit terms before fetching presign transactions", async () => {
      const callLog: string[] = [];
      const wallet = createCapabilityWallet(() => callLog.push("approve"));
      const reader = createMockStatusReader([
        DaemonStatus.PENDING_DEPOSITOR_SIGNATURES,
      ]);
      const basePresignClient = createMockPresignClient();
      const presignClient: PresignClient = {
        ...basePresignClient,
        requestDepositorPresignTransactions: vi.fn(async (request, signal) => {
          callLog.push("presign");
          return basePresignClient.requestDepositorPresignTransactions(
            request,
            signal,
          );
        }),
      };

      await runDepositorPresignFlow({
        statusReader: reader,
        presignClient,
        btcWallet: wallet,
        peginTxid: VALID_TXID,
        depositorPk: DEPOSITOR_PK,
        signingContext: createSigningContext(),
        depositTerms: DEPOSIT_TERMS,
      });

      expect(callLog).toEqual(["approve", "presign"]);
      expect(wallet.approveDepositTerms).toHaveBeenCalledOnce();
      expect(wallet.approveDepositTerms).toHaveBeenCalledWith(DEPOSIT_TERMS);
    });

    it("validates then approves, in that order, when the wallet exposes validateDepositTerms", async () => {
      const callLog: string[] = [];
      const wallet = Object.assign(
        createCapabilityWallet(() => callLog.push("approve")),
        {
          validateDepositTerms: vi.fn(async () => {
            callLog.push("validate");
          }),
        },
      );
      const reader = createMockStatusReader([
        DaemonStatus.PENDING_DEPOSITOR_SIGNATURES,
      ]);

      await runDepositorPresignFlow({
        statusReader: reader,
        presignClient: createMockPresignClient(),
        btcWallet: wallet,
        peginTxid: VALID_TXID,
        depositorPk: DEPOSITOR_PK,
        signingContext: createSigningContext(),
        depositTerms: DEPOSIT_TERMS,
      });

      expect(callLog).toEqual(["validate", "approve"]);
      expect(wallet.validateDepositTerms).toHaveBeenCalledWith(DEPOSIT_TERMS);
    });

    it("stops before the approval ceremony when validateDepositTerms rejects", async () => {
      const wallet = Object.assign(createCapabilityWallet(), {
        validateDepositTerms: vi.fn(async () => {
          throw new Error("Deposit terms outside the device-supported range");
        }),
      });
      const reader = createMockStatusReader([
        DaemonStatus.PENDING_DEPOSITOR_SIGNATURES,
      ]);
      const presignClient = createMockPresignClient();

      await expect(
        runDepositorPresignFlow({
          statusReader: reader,
          presignClient,
          btcWallet: wallet,
          peginTxid: VALID_TXID,
          depositorPk: DEPOSITOR_PK,
          signingContext: createSigningContext(),
          depositTerms: DEPOSIT_TERMS,
        }),
      ).rejects.toThrow(/device-supported range/);

      expect(wallet.approveDepositTerms).not.toHaveBeenCalled();
      expect(
        presignClient.requestDepositorPresignTransactions,
      ).not.toHaveBeenCalled();
    });

    it("throws for capability wallets when no depositTerms is provided", async () => {
      const wallet = createCapabilityWallet();
      const reader = createMockStatusReader([
        DaemonStatus.PENDING_DEPOSITOR_SIGNATURES,
      ]);
      const presignClient = createMockPresignClient();

      await expect(
        runDepositorPresignFlow({
          statusReader: reader,
          presignClient,
          btcWallet: wallet,
          peginTxid: VALID_TXID,
          depositorPk: DEPOSITOR_PK,
          signingContext: createSigningContext(),
        }),
      ).rejects.toThrow(/deposit terms/i);

      expect(wallet.approveDepositTerms).not.toHaveBeenCalled();
      expect(
        presignClient.requestDepositorPresignTransactions,
      ).not.toHaveBeenCalled();
      expect(presignClient.submitDepositorPresignatures).not.toHaveBeenCalled();
    });

    it.each([
      ["vaultCoreVersion", { vaultCoreVersion: 2 }],
      ["timelockPegin", { timelockPegin: 999 }],
      ["timelockAssert", { timelockAssert: 999 }],
    ])(
      "throws when the approved terms and the context disagree on %s",
      async (field, override) => {
        const wallet = createCapabilityWallet();
        const reader = createMockStatusReader([
          DaemonStatus.PENDING_DEPOSITOR_SIGNATURES,
        ]);

        await expect(
          runDepositorPresignFlow({
            statusReader: reader,
            presignClient: createMockPresignClient(),
            btcWallet: wallet,
            peginTxid: VALID_TXID,
            depositorPk: DEPOSITOR_PK,
            signingContext: { ...createSigningContext(), ...override },
            depositTerms: DEPOSIT_TERMS,
          }),
        ).rejects.toThrow(new RegExp(field));

        expect(wallet.approveDepositTerms).not.toHaveBeenCalled();
      },
    );

    it("throws when the approved terms carry different participant keys than the context", async () => {
      // An RFC-006 operation-key rotation bumps only a key EPOCH — every
      // roster/params version stays put — so verifyRegisteredVaultVersions
      // cannot see it. The seam must catch the divergence itself, or an
      // approving wallet authorises a set it does not sign against.
      const wallet = createCapabilityWallet();
      const reader = createMockStatusReader([
        DaemonStatus.PENDING_DEPOSITOR_SIGNATURES,
      ]);
      const presignClient = createMockPresignClient();

      await expect(
        runDepositorPresignFlow({
          statusReader: reader,
          presignClient,
          btcWallet: wallet,
          peginTxid: VALID_TXID,
          depositorPk: DEPOSITOR_PK,
          signingContext: {
            ...createSigningContext(),
            vaultKeeperBtcPubkeys: ["ab".repeat(32)],
          },
          depositTerms: DEPOSIT_TERMS,
        }),
      ).rejects.toThrow(/vaultKeeperBtcPubkeys/);

      expect(wallet.approveDepositTerms).not.toHaveBeenCalled();
    });

    it("throws when no approved vault group names the signing context's vault provider", async () => {
      const wallet = createCapabilityWallet();
      const reader = createMockStatusReader([
        DaemonStatus.PENDING_DEPOSITOR_SIGNATURES,
      ]);
      const presignClient = createMockPresignClient();

      await expect(
        runDepositorPresignFlow({
          statusReader: reader,
          presignClient,
          btcWallet: wallet,
          peginTxid: VALID_TXID,
          depositorPk: DEPOSITOR_PK,
          signingContext: {
            ...createSigningContext(),
            vaultProviderBtcPubkey: "cd".repeat(32),
          },
          depositTerms: DEPOSIT_TERMS,
        }),
      ).rejects.toThrow(/vaultProviderBtcPubkey/);

      expect(wallet.approveDepositTerms).not.toHaveBeenCalled();
    });

    it("throws when depositTerms.protocolFeeRate diverges from the context's version-locked rate", async () => {
      // The approved terms and the payout bound must share one graph-build
      // rate; divergence means a params-version drift bug, not a user error.
      const wallet = createMockWallet();
      const reader = createMockStatusReader([
        DaemonStatus.PENDING_DEPOSITOR_SIGNATURES,
      ]);
      const presignClient = createMockPresignClient();

      await expect(
        runDepositorPresignFlow({
          statusReader: reader,
          presignClient,
          btcWallet: wallet,
          peginTxid: VALID_TXID,
          depositorPk: DEPOSITOR_PK,
          signingContext: { ...createSigningContext(), protocolFeeRate: 3n },
          depositTerms: DEPOSIT_TERMS, // protocolFeeRate: 2n
        }),
      ).rejects.toThrow(/protocolFeeRate/);

      expect(
        presignClient.requestDepositorPresignTransactions,
      ).not.toHaveBeenCalled();
    });

    it("skips approval entirely when the VP is already past payout signing", async () => {
      const wallet = createCapabilityWallet();
      const reader = createMockStatusReader([DaemonStatus.PENDING_ACKS]);
      const presignClient = createMockPresignClient();

      // No depositTerms: the POST_PAYOUT early-return must win before the
      // capability guard, or a resumed Ledger deposit hard-fails for nothing.
      await runDepositorPresignFlow({
        statusReader: reader,
        presignClient,
        btcWallet: wallet,
        peginTxid: VALID_TXID,
        depositorPk: DEPOSITOR_PK,
        signingContext: createSigningContext(),
      });

      expect(wallet.approveDepositTerms).not.toHaveBeenCalled();
      expect(
        presignClient.requestDepositorPresignTransactions,
      ).not.toHaveBeenCalled();
    });

    it("ignores depositTerms for non-capability wallets", async () => {
      const wallet = createMockWallet();
      const reader = createMockStatusReader([
        DaemonStatus.PENDING_DEPOSITOR_SIGNATURES,
      ]);
      const presignClient = createMockPresignClient();

      await runDepositorPresignFlow({
        statusReader: reader,
        presignClient,
        btcWallet: wallet,
        peginTxid: VALID_TXID,
        depositorPk: DEPOSITOR_PK,
        signingContext: createSigningContext(),
        depositTerms: DEPOSIT_TERMS,
      });

      // The proof is the flow completing above without throwing — it would
      // throw a TypeError if src tried to call the absent method.
      expect(presignClient.submitDepositorPresignatures).toHaveBeenCalledOnce();
    });
  });
});
