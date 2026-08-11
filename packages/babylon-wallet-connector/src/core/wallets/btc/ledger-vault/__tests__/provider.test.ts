/**
 * Provider-level tests. The DMK layers are mocked; what matters here is the
 * orchestration contract — that the envelope gate runs before any device I/O,
 * that unwired methods fail with a typed capability error rather than a silent
 * wrong result, and that the intent carries the right byte order.
 */

import { describe, expect, it, vi } from "vitest";

import { Network } from "@/core/types";
import { ERROR_CODES, WalletError } from "@/error";

const h = vi.hoisted(() => ({
  session: { dmk: {}, sessionId: "s1" },
  sent: [] as { p1: number; data: Uint8Array }[],
  failNext: undefined as Error | undefined,
}));

const dmkSessionMock = vi.hoisted(() => ({
  connectDmkSession: vi.fn(),
  disconnectDmkSession: vi.fn(async () => {}),
  isSessionAlive: vi.fn(async () => true),
}));
vi.mock("../dmkSession", () => dmkSessionMock);

vi.mock("../dmkApduSender", () => ({
  createDmkApduSender: () => async (apdu: { p1: number; data: Uint8Array }) => {
    if (h.failNext) throw h.failNext;
    h.sent.push({ p1: apdu.p1, data: apdu.data });
    return new Uint8Array(32).fill(9);
  },
}));

vi.mock("../derivation", () => ({
  getTaprootAddress: vi.fn(async () => "bc1ptaproot"),
  getXOnlyPublicKeyHex: vi.fn(async () => "ab".repeat(32)),
}));

import { LedgerVaultProvider } from "../provider";
import type { DepositTerms } from "../types";

const TERMS: DepositTerms = {
  vaultCoreVersion: 2,
  protocolFeeRate: 2n,
  timelockPegin: 684,
  timelockAssert: 684,
  timelockRefund: 2016,
  prepeginTxid: "aa" + "11".repeat(31),
  prepeginMaxFee: 1500n,
  vaultKeeperBtcPubkeys: ["cc".repeat(32)],
  universalChallengerBtcPubkeys: ["dd".repeat(32)],
  vaults: [
    {
      htlcVout: 0,
      vaultProviderBtcPubkey: "ff".repeat(32),
      peginAmount: 1_000_000n,
      commissionFee: 10_000n,
      depositorClaimValue: 20_000n,
      peginMaxFee: 800n,
    },
  ],
};

async function connected() {
  h.sent.length = 0;
  dmkSessionMock.connectDmkSession.mockResolvedValue(h.session);
  dmkSessionMock.isSessionAlive.mockResolvedValue(true);
  const provider = new LedgerVaultProvider(Network.SIGNET);
  await provider.connectWallet();
  return provider;
}

describe("LedgerVaultProvider", () => {
  it("reports the address and x-only pubkey once connected", async () => {
    const provider = await connected();

    await expect(provider.getAddress()).resolves.toBe("bc1ptaproot");
    await expect(provider.getPublicKeyHex()).resolves.toBe("ab".repeat(32));
  });

  it("refuses device reads before connecting", async () => {
    const provider = new LedgerVaultProvider(Network.SIGNET);

    await expect(provider.getAddress()).rejects.toThrow(WalletError);
    await expect(provider.approveDepositTerms(TERMS)).rejects.toThrow(/not connected/);
  });

  it.each(["signPsbt", "signPsbts", "signMessage"])(
    "fails %s with a capability error rather than a wrong result",
    async (method) => {
      const provider = await connected();
      const call =
        method === "signPsbt"
          ? provider.signPsbt("00")
          : method === "signPsbts"
            ? provider.signPsbts(["00"])
            : provider.signMessage("m", "bip322-simple");

      await expect(call).rejects.toMatchObject({
        code: ERROR_CODES.WALLET_METHOD_NOT_SUPPORTED,
      });
    },
  );

  it("runs the envelope gate before any device I/O", async () => {
    // A v1 intent loads fine on-device and only fails at PSBT time — after the
    // depositor has physically approved. Nothing may reach the device.
    const provider = await connected();

    await expect(provider.approveDepositTerms({ ...TERMS, vaultCoreVersion: 1 })).rejects.toThrow(
      /vaultCoreVersion 1 is below 2/,
    );
    expect(h.sent).toHaveLength(0);
  });

  it("drives the three intent phases in order once terms pass", async () => {
    const provider = await connected();
    await provider.approveDepositTerms(TERMS);

    expect(h.sent.map((s) => s.p1)).toEqual([0x00, 0x01, 0x02]);
  });

  it("reverses the txid into the internal order the device compares against", async () => {
    const provider = await connected();
    await provider.approveDepositTerms(TERMS);

    // Display order starts "aa11…"; the wire must carry the reverse, so the
    // 32-byte value ends with "…11aa".
    const scalars = Buffer.from(h.sent[0].data).toString("hex");
    expect(scalars).toContain(`0027 20 ${"11".repeat(31)}aa`.replace(/ /g, ""));
  });

  it("rejects a malformed pubkey in the terms with the seam's error shape", async () => {
    const provider = await connected();

    await expect(provider.approveDepositTerms({ ...TERMS, vaultKeeperBtcPubkeys: ["nothex"] })).rejects.toMatchObject({
      name: "DepositTermsRejectedError",
      reason: "device-envelope",
    });
  });

  it("clears session state on disconnect so a stale sessionId is never reused", async () => {
    const provider = await connected();
    await provider.disconnect();

    await expect(provider.getAddress()).rejects.toThrow(/not connected/);
  });

  it("reports a dismissed device picker as a user rejection", async () => {
    // DMK errors are not Error instances — they carry _tag and originalError —
    // and cancelling the WebHID chooser resolves empty, which DMK wraps as
    // NoAccessibleDeviceError("No selected device").
    dmkSessionMock.connectDmkSession.mockRejectedValue({
      _tag: "NoAccessibleDeviceError",
      originalError: new Error("No selected device"),
    });

    await expect(new LedgerVaultProvider(Network.SIGNET).connectWallet()).rejects.toMatchObject({
      code: ERROR_CODES.CONNECTION_REJECTED,
    });
  });

  it("reports a real transport failure as a failure, keeping the detail", async () => {
    dmkSessionMock.connectDmkSession.mockRejectedValue({
      _tag: "NoAccessibleDeviceError",
      originalError: new Error("SecurityError: permissions policy"),
    });

    const call = new LedgerVaultProvider(Network.SIGNET).connectWallet();
    await expect(call).rejects.toMatchObject({ code: ERROR_CODES.CONNECTION_FAILED });
    await expect(call).rejects.toThrow(/permissions policy/);
  });

  it("refuses the ceremony when the session has died", async () => {
    const provider = await connected();
    dmkSessionMock.isSessionAlive.mockResolvedValue(false);

    await expect(provider.approveDepositTerms(TERMS)).rejects.toThrow(/was disconnected/);
    expect(h.sent).toHaveLength(0);
  });

  it("does not re-run the ceremony for a byte-equal re-approval", async () => {
    // The SDK approves once in preparePegin and again in runDepositorPresignFlow;
    // the device admits only one ceremony per DERIVE_CONTEXT_HASH.
    const provider = await connected();
    await provider.approveDepositTerms(TERMS);
    const afterFirst = h.sent.length;

    await provider.approveDepositTerms(TERMS);

    expect(afterFirst).toBeGreaterThan(0);
    expect(h.sent).toHaveLength(afterFirst);
  });

  it("re-runs the ceremony when the terms differ", async () => {
    const provider = await connected();
    await provider.approveDepositTerms(TERMS);
    const afterFirst = h.sent.length;

    await provider.approveDepositTerms({ ...TERMS, prepeginMaxFee: 1600n });

    expect(h.sent.length).toBeGreaterThan(afterFirst);
  });

  it("re-runs the ceremony after a failed one, since the device nullified the intent", async () => {
    const provider = await connected();
    const failing = new Error("device said no");
    h.failNext = failing;

    await expect(provider.approveDepositTerms(TERMS)).rejects.toThrow(failing);
    h.failNext = undefined;
    h.sent.length = 0;

    await provider.approveDepositTerms(TERMS);
    expect(h.sent.length).toBeGreaterThan(0);
  });

  it("forgets the approval on disconnect — a new connection starts at IDLE", async () => {
    const provider = await connected();
    await provider.approveDepositTerms(TERMS);
    await provider.disconnect();

    const reconnected = await connected();
    await reconnected.approveDepositTerms(TERMS);
    expect(h.sent.length).toBeGreaterThan(0);
  });

  it("has no inscriptions and no account-change event to subscribe to", async () => {
    const provider = await connected();

    await expect(provider.getInscriptions()).resolves.toEqual([]);
    expect(() => provider.on()).not.toThrow();
    expect(() => provider.off()).not.toThrow();
  });
});
