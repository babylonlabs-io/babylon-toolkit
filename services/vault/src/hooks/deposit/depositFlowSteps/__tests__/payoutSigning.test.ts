import { beforeEach, describe, expect, it, vi } from "vitest";

import { LocalStorageStatus } from "@/models/peginStateMachine";
import { DepositorBtcKeyMismatchError } from "@/utils/errors/depositorWalletMismatch";

import { payoutSigningStep, signAndSubmitPayouts } from "../payoutSigning";
import { DepositFlowStep } from "../types";

const {
  mockPrepareSigningContext,
  mockEnsureAuthenticatedVpClient,
  mockRunDepositorPresignFlow,
  mockUpdatePendingPeginStatus,
  mockRecordSignedGraphFingerprint,
  mockLoggerWarn,
} = vi.hoisted(() => ({
  mockPrepareSigningContext: vi.fn(),
  mockEnsureAuthenticatedVpClient: vi.fn(),
  mockRunDepositorPresignFlow: vi.fn(),
  mockUpdatePendingPeginStatus: vi.fn(),
  mockRecordSignedGraphFingerprint: vi.fn(),
  mockLoggerWarn: vi.fn(),
}));

vi.mock("@babylonlabs-io/ts-sdk/tbv/core", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@babylonlabs-io/ts-sdk/tbv/core")>();
  return {
    canonicalizeBtcPubkey: actual.canonicalizeBtcPubkey,
    stripHexPrefix: actual.stripHexPrefix,
  };
});

vi.mock("@babylonlabs-io/ts-sdk/tbv/core/services", () => ({
  runDepositorPresignFlow: (...args: unknown[]) =>
    mockRunDepositorPresignFlow(...args),
}));

vi.mock("@/services/vault/vaultPayoutSignatureService", () => ({
  prepareSigningContext: (...args: unknown[]) =>
    mockPrepareSigningContext(...args),
}));

vi.mock("../ensureAuthenticatedVpClient", () => ({
  ensureAuthenticatedVpClient: (...args: unknown[]) =>
    mockEnsureAuthenticatedVpClient(...args),
}));

const mockAssertVaultCoreVersionSupported = vi.hoisted(() => vi.fn());
mockAssertVaultCoreVersionSupported.mockResolvedValue(undefined);
vi.mock("@/utils/vaultCoreVersionSupport", () => ({
  assertVaultCoreVersionSupported: mockAssertVaultCoreVersionSupported,
}));

vi.mock("@/storage/peginStorage", () => ({
  updatePendingPeginStatus: (...args: unknown[]) =>
    mockUpdatePendingPeginStatus(...args),
  recordSignedGraphFingerprint: (...args: unknown[]) =>
    mockRecordSignedGraphFingerprint(...args),
}));

vi.mock("@/infrastructure", () => ({
  logger: { warn: (...args: unknown[]) => mockLoggerWarn(...args) },
}));

vi.mock("@/models/peginStateMachine", () => ({
  LocalStorageStatus: { PAYOUT_SIGNED: "payout_signed" },
}));

describe("payoutSigningStep", () => {
  it("maps the auth-anchor phase to SIGN_AUTH_ANCHOR", () => {
    expect(payoutSigningStep("auth")).toBe(DepositFlowStep.SIGN_AUTH_ANCHOR);
  });

  it("maps the claimer phase to SIGN_PAYOUTS", () => {
    expect(payoutSigningStep("claimers")).toBe(DepositFlowStep.SIGN_PAYOUTS);
  });

  it("maps the depositor-graph phase to SIGN_DEPOSITOR_GRAPH", () => {
    expect(payoutSigningStep("graph")).toBe(
      DepositFlowStep.SIGN_DEPOSITOR_GRAPH,
    );
  });
});

describe("signAndSubmitPayouts", () => {
  // Opaque markers — identity is the point. The SigningContext is built by
  // prepareSigningContext from on-chain reads and must reach the SDK presign
  // flow byte-for-byte unchanged; rpcClient is the authenticated VP channel.
  const preparedContext = { marker: "signing-context" };
  const vaultProviderAddress = "0xVaultProvider";
  const rpcClient = { marker: "rpc-client" };
  const DEPOSITOR_BTC_PUBKEY = "c".repeat(64);
  const SIGNED_GRAPH_FINGERPRINT = "3f".repeat(32);

  const baseParams = {
    vaultId: "0xVaultId",
    peginTxHash: "0xabc123",
    depositorBtcPubkey: `0x${DEPOSITOR_BTC_PUBKEY}`,
    providerBtcPubKey: "0xproviderhint",
    registeredPayoutScriptPubKey: "0014payout",
    btcWallet: { getPublicKeyHex: async () => DEPOSITOR_BTC_PUBKEY },
    depositorEthAddress: "0xDepositor",
    unsignedPrePeginTxHex: "0102prepegin",
  };

  const callSignAndSubmit = (overrides: Record<string, unknown> = {}) =>
    signAndSubmitPayouts({
      ...baseParams,
      ...overrides,
    } as unknown as Parameters<typeof signAndSubmitPayouts>[0]);

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrepareSigningContext.mockResolvedValue({
      context: preparedContext,
      vaultProviderAddress,
    });
    mockEnsureAuthenticatedVpClient.mockResolvedValue(rpcClient);
    mockRunDepositorPresignFlow.mockResolvedValue(undefined);
    mockRecordSignedGraphFingerprint.mockReturnValue(true);
  });

  /** The fingerprint callback signAndSubmitPayouts handed to the presign flow. */
  const recordCallback = () =>
    (
      mockRunDepositorPresignFlow.mock.calls[0]?.[0] as {
        recordGraphFingerprint: (fingerprint: string) => void;
      }
    ).recordGraphFingerprint;

  it("aborts before any wallet popup when the stamped vaultCoreVersion is unsupported", async () => {
    mockPrepareSigningContext.mockResolvedValue({
      context: { ...preparedContext, vaultCoreVersion: 3 },
      vaultProviderAddress,
    });
    mockAssertVaultCoreVersionSupported.mockRejectedValueOnce(
      new Error("This deposit requires a newer version of the app."),
    );

    await expect(callSignAndSubmit()).rejects.toThrow(
      /requires a newer version of the app/,
    );
    expect(mockAssertVaultCoreVersionSupported).toHaveBeenCalledWith(3);
    // Fail-closed BEFORE the VP auth popup and the presign flow.
    expect(mockEnsureAuthenticatedVpClient).not.toHaveBeenCalled();
    expect(mockRunDepositorPresignFlow).not.toHaveBeenCalled();
  });

  it("forwards the prepared SigningContext and stripped ids into the presign flow unchanged", async () => {
    await callSignAndSubmit();

    expect(mockPrepareSigningContext).toHaveBeenCalledWith(
      expect.objectContaining({
        vaultId: baseParams.vaultId,
        depositorBtcPubkey: baseParams.depositorBtcPubkey,
        vaultProviderBtcPubKey: baseParams.providerBtcPubKey,
        registeredPayoutScriptPubKey: baseParams.registeredPayoutScriptPubKey,
      }),
    );

    expect(mockRunDepositorPresignFlow).toHaveBeenCalledTimes(1);
    const presignArgs = mockRunDepositorPresignFlow.mock.calls[0]?.[0] as {
      signingContext: unknown;
      statusReader: unknown;
      presignClient: unknown;
      peginTxid: unknown;
      depositorPk: unknown;
    };
    // The trusted context is forwarded by reference — never rebuilt or mutated.
    expect(presignArgs.signingContext).toBe(preparedContext);
    expect(presignArgs.statusReader).toBe(rpcClient);
    expect(presignArgs.presignClient).toBe(rpcClient);
    expect(presignArgs.peginTxid).toBe("abc123");
    expect(presignArgs.depositorPk).toBe(DEPOSITOR_BTC_PUBKEY);
  });

  it("forwards the depositTerms into the presign flow unchanged", async () => {
    const depositTerms = { marker: "deposit-terms" };

    await callSignAndSubmit({ depositTerms });

    expect(mockRunDepositorPresignFlow).toHaveBeenCalledTimes(1);
    const presignArgs = mockRunDepositorPresignFlow.mock.calls[0]?.[0] as {
      depositTerms: unknown;
    };
    expect(presignArgs.depositTerms).toBe(depositTerms);
  });

  it("authenticates the VP client against the vault provider address resolved on-chain by prepareSigningContext", async () => {
    await callSignAndSubmit();

    expect(mockEnsureAuthenticatedVpClient).toHaveBeenCalledWith(
      expect.objectContaining({
        vaultId: baseParams.vaultId,
        peginTxHash: baseParams.peginTxHash,
        unsignedPrePeginTxHex: baseParams.unsignedPrePeginTxHex,
        providerAddress: vaultProviderAddress,
        depositorBtcPubkey: baseParams.depositorBtcPubkey,
      }),
    );
  });

  it("emits the auth-anchor progress step before the VP auth popup fires", async () => {
    const onProgress = vi.fn();

    await callSignAndSubmit({ onProgress });

    expect(onProgress).toHaveBeenNthCalledWith(1, {
      phase: "auth",
      completed: 0,
      total: 0,
    });
    expect(onProgress.mock.invocationCallOrder[0]).toBeLessThan(
      mockEnsureAuthenticatedVpClient.mock.invocationCallOrder[0],
    );
  });

  it("persists PAYOUT_SIGNED only after the presign flow resolves", async () => {
    await callSignAndSubmit();

    expect(mockUpdatePendingPeginStatus).toHaveBeenCalledWith(
      baseParams.depositorEthAddress,
      baseParams.vaultId,
      LocalStorageStatus.PAYOUT_SIGNED,
    );
    expect(
      mockUpdatePendingPeginStatus.mock.invocationCallOrder[0],
    ).toBeGreaterThan(mockRunDepositorPresignFlow.mock.invocationCallOrder[0]);
  });

  it("stores the presign fingerprint on this depositor's entry for the vault", async () => {
    await callSignAndSubmit();

    recordCallback()(SIGNED_GRAPH_FINGERPRINT);

    expect(mockRecordSignedGraphFingerprint).toHaveBeenCalledWith(
      baseParams.depositorEthAddress,
      baseParams.vaultId,
      SIGNED_GRAPH_FINGERPRINT,
    );
    expect(mockLoggerWarn).not.toHaveBeenCalled();
  });

  it("lets a failed fingerprint write stop the presign flow", async () => {
    // The SDK awaits the callback before any signature is sent, so a throw
    // here is what keeps the VP from holding signatures with no record.
    mockRecordSignedGraphFingerprint.mockImplementation(() => {
      throw new Error("storage full");
    });
    await callSignAndSubmit();

    expect(() => recordCallback()(SIGNED_GRAPH_FINGERPRINT)).toThrow(
      "storage full",
    );
  });

  it("warns and lets signing go on when this device holds no entry for the vault", async () => {
    mockRecordSignedGraphFingerprint.mockReturnValue(false);
    await callSignAndSubmit();

    expect(() => recordCallback()(SIGNED_GRAPH_FINGERPRINT)).not.toThrow();
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.stringContaining("presign fingerprint"),
      expect.objectContaining({ vaultId: baseParams.vaultId }),
    );
  });

  it("does not persist PAYOUT_SIGNED when the presign flow rejects", async () => {
    mockRunDepositorPresignFlow.mockRejectedValueOnce(
      new Error("presign aborted"),
    );

    await expect(callSignAndSubmit()).rejects.toThrow("presign aborted");

    expect(mockUpdatePendingPeginStatus).not.toHaveBeenCalled();
  });

  it("aborts before requesting any signature when prepareSigningContext throws", async () => {
    mockPrepareSigningContext.mockRejectedValueOnce(
      new Error("VP commission out of range"),
    );
    const onProgress = vi.fn();

    await expect(callSignAndSubmit({ onProgress })).rejects.toThrow(
      "VP commission out of range",
    );

    expect(onProgress).not.toHaveBeenCalled();
    expect(mockEnsureAuthenticatedVpClient).not.toHaveBeenCalled();
    expect(mockRunDepositorPresignFlow).not.toHaveBeenCalled();
    expect(mockUpdatePendingPeginStatus).not.toHaveBeenCalled();
  });

  it("rejects with DepositorBtcKeyMismatchError before any signature when the live wallet key is not the depositor key", async () => {
    const onProgress = vi.fn();

    await expect(
      callSignAndSubmit({
        btcWallet: { getPublicKeyHex: async () => "d".repeat(64) },
        onProgress,
      }),
    ).rejects.toBeInstanceOf(DepositorBtcKeyMismatchError);

    expect(onProgress).not.toHaveBeenCalled();
    expect(mockEnsureAuthenticatedVpClient).not.toHaveBeenCalled();
    expect(mockRunDepositorPresignFlow).not.toHaveBeenCalled();
    expect(mockUpdatePendingPeginStatus).not.toHaveBeenCalled();
  });

  it("proceeds to the presign flow when the live wallet returns the compressed form of the depositor key", async () => {
    await callSignAndSubmit({
      btcWallet: { getPublicKeyHex: async () => `02${DEPOSITOR_BTC_PUBKEY}` },
    });

    expect(mockRunDepositorPresignFlow).toHaveBeenCalledTimes(1);
  });
});
