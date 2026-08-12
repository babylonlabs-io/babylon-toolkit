/**
 * Provider-level tests. The DMK layers are mocked; what matters here is the
 * orchestration contract — that the envelope gate runs before any device I/O,
 * that the derive → approve state machine matches the device's, that unwired
 * methods fail with a typed capability error rather than a silent wrong
 * result, and that the intent carries the right byte order.
 */

// @vitest-environment node
// The asmjs ECC library fails bitcoinjs's verifyEcc fixtures under jsdom but
// passes under node (ts-sdk's setup.ts runs the identical init there). These
// tests touch no DOM, so pin the file to node.

import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { initEccLib } from "bitcoinjs-lib";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Network } from "@/core/types";
import { getTaprootAddress } from "@/core/utils/wallet";
import { ERROR_CODES, WalletError } from "@/error";

// p2tr derivation needs a live ECC library (required for BIP-341 tweaking).
initEccLib(ecc);

/** BIP-86 first-address vector: x-only key and its published P2TR address. */
const VECTOR_XONLY = "cc8a4bc64d897bddc5fbc2f670f7a8ba0b386779106cf1223c6fc5d7cd6fc115";
const VECTOR_MAINNET_ADDRESS = "bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr";

const h = vi.hoisted(() => ({
  session: { dmk: {}, sessionId: "s1" },
  sent: [] as { ins: number; p1: number; data: Uint8Array }[],
  failNext: undefined as Error | undefined,
}));

const dmkSessionMock = vi.hoisted(() => ({
  connectDmkSession: vi.fn(),
  disconnectDmkSession: vi.fn(async () => {}),
  isSessionAlive: vi.fn(async () => true),
}));
vi.mock("../dmkSession", () => dmkSessionMock);

vi.mock("../dmkApduSender", () => ({
  createDmkApduSender: () => async (apdu: { ins: number; p1: number; data: Uint8Array }) => {
    if (h.failNext) throw h.failNext;
    h.sent.push({ ins: apdu.ins, p1: apdu.p1, data: apdu.data });
    return new Uint8Array(32).fill(9);
  },
}));

const derivationMock = vi.hoisted(() => ({
  getXOnlyPublicKeyHex: vi.fn(async () => VECTOR_XONLY),
}));
vi.mock("../derivation", () => derivationMock);

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

const INS_APPROVE_VAULT_INTENT = 0x80;

/** APDUs belonging to the approval ceremony, in send order. */
const approveApdus = () => h.sent.filter((a) => a.ins === INS_APPROVE_VAULT_INTENT);

beforeEach(() => {
  h.sent.length = 0;
  h.failNext = undefined;
  derivationMock.getXOnlyPublicKeyHex.mockClear();
  dmkSessionMock.connectDmkSession.mockReset();
  dmkSessionMock.connectDmkSession.mockResolvedValue(h.session);
  dmkSessionMock.isSessionAlive.mockReset();
  dmkSessionMock.isSessionAlive.mockResolvedValue(true);
});

async function connected() {
  const provider = new LedgerVaultProvider(Network.SIGNET);
  await provider.connectWallet();
  return provider;
}

/** Connect and run the derive the device requires before any approval. */
async function derived() {
  const provider = await connected();
  await provider.deriveContextHash("app", "aa".repeat(32));
  return provider;
}

describe("LedgerVaultProvider", () => {
  it("reports the x-only pubkey and locally-derived address from ONE device read", async () => {
    const provider = await connected();

    const [address, pubkey] = await Promise.all([provider.getAddress(), provider.getPublicKeyHex()]);

    expect(pubkey).toBe(VECTOR_XONLY);
    // The address is never read from the device — it is derived locally from
    // the pubkey, so it must equal the util's derivation for the same network.
    expect(address).toBe(getTaprootAddress(VECTOR_XONLY, Network.SIGNET));
    expect(derivationMock.getXOnlyPublicKeyHex).toHaveBeenCalledTimes(1);
  });

  it("derives the published BIP-86 vector address on mainnet", async () => {
    const provider = new LedgerVaultProvider(Network.MAINNET);
    await provider.connectWallet();

    await expect(provider.getAddress()).resolves.toBe(VECTOR_MAINNET_ADDRESS);
  });

  it("re-reads the pubkey after a failed read instead of replaying the rejection", async () => {
    const provider = await connected();
    derivationMock.getXOnlyPublicKeyHex.mockRejectedValueOnce(new Error("device unplugged"));

    await expect(provider.getPublicKeyHex()).rejects.toThrow("device unplugged");
    await expect(provider.getPublicKeyHex()).resolves.toBe(VECTOR_XONLY);
  });

  it("refuses device reads before connecting", async () => {
    const provider = new LedgerVaultProvider(Network.SIGNET);

    await expect(provider.getAddress()).rejects.toThrow(WalletError);
    await expect(provider.approveDepositTerms(TERMS)).rejects.toThrow(/not connected/);
  });

  it("does not reconnect while the session is alive — visibility checks must not kill it", async () => {
    const provider = await connected();

    await provider.connectWallet();

    expect(dmkSessionMock.connectDmkSession).toHaveBeenCalledTimes(1);
  });

  it("reconnects when the session has died", async () => {
    const provider = await connected();
    dmkSessionMock.isSessionAlive.mockResolvedValue(false);

    await provider.connectWallet();

    expect(dmkSessionMock.connectDmkSession).toHaveBeenCalledTimes(2);
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
    const provider = await derived();
    h.sent.length = 0;

    await expect(provider.approveDepositTerms({ ...TERMS, vaultCoreVersion: 1 })).rejects.toThrow(
      /vaultCoreVersion 1 is below 2/,
    );
    expect(h.sent).toHaveLength(0);
  });

  it("refuses to approve before a context root is derived on this connection", async () => {
    // The device only accepts APPROVE_VAULT_INTENT from the derived state; a
    // hot resume path that skips the derive must fail actionably, not with
    // SW_BAD_STATE at the first APDU.
    const provider = await connected();

    await expect(provider.approveDepositTerms(TERMS)).rejects.toThrow(/DERIVE_CONTEXT_HASH/);
    expect(approveApdus()).toHaveLength(0);
  });

  it("drives the three intent phases in order once terms pass", async () => {
    const provider = await derived();
    await provider.approveDepositTerms(TERMS);

    expect(approveApdus().map((s) => s.p1)).toEqual([0x00, 0x01, 0x02]);
  });

  it("reverses the txid into the internal order the device compares against", async () => {
    const provider = await derived();
    await provider.approveDepositTerms(TERMS);

    // Display order starts "aa11…"; the wire must carry the reverse, so the
    // 32-byte value ends with "…11aa".
    const scalars = Buffer.from(approveApdus()[0].data).toString("hex");
    expect(scalars).toContain(`0027 20 ${"11".repeat(31)}aa`.replace(/ /g, ""));
  });

  it("rejects a malformed pubkey in the terms with the seam's error shape", async () => {
    const provider = await derived();

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
    const provider = await derived();
    dmkSessionMock.isSessionAlive.mockResolvedValue(false);
    h.sent.length = 0;

    await expect(provider.approveDepositTerms(TERMS)).rejects.toThrow(/was disconnected/);
    expect(h.sent).toHaveLength(0);
  });

  it("does not re-run the ceremony for a byte-equal re-approval", async () => {
    // The SDK approves once in preparePegin and again in runDepositorPresignFlow;
    // the device admits only one ceremony per DERIVE_CONTEXT_HASH.
    const provider = await derived();
    await provider.approveDepositTerms(TERMS);
    const afterFirst = approveApdus().length;

    await provider.approveDepositTerms(TERMS);

    expect(afterFirst).toBeGreaterThan(0);
    expect(approveApdus()).toHaveLength(afterFirst);
  });

  it("refuses differing terms while an intent is loaded — the device admits one ceremony per derive", async () => {
    // Sending a second P1=0x00 from INTENT_LOADED returns SW_BAD_STATE
    // (approve_vault_intent.c:45); the pre-empt must be actionable instead.
    const provider = await derived();
    await provider.approveDepositTerms(TERMS);
    h.sent.length = 0;

    await expect(provider.approveDepositTerms({ ...TERMS, prepeginMaxFee: 1600n })).rejects.toThrow(
      /Restart the flow from derivation/,
    );
    expect(approveApdus()).toHaveLength(0);
  });

  it("approves differing terms after a fresh derive", async () => {
    const provider = await derived();
    await provider.approveDepositTerms(TERMS);

    await provider.deriveContextHash("app", "bb".repeat(32));
    h.sent.length = 0;
    await provider.approveDepositTerms({ ...TERMS, prepeginMaxFee: 1600n });

    expect(approveApdus().length).toBeGreaterThan(0);
  });

  it("requires a fresh derive after a failed ceremony, since the device reset to IDLE", async () => {
    // Every ceremony consumes HASH_DERIVED: any failure invalidates the device
    // to IDLE (vault_context_invalidate), so a blind retry would die with
    // SW_BAD_STATE. The provider must demand a re-derive, then work again.
    const provider = await derived();
    const failing = new Error("device said no");
    h.failNext = failing;

    await expect(provider.approveDepositTerms(TERMS)).rejects.toThrow(failing);
    h.failNext = undefined;

    await expect(provider.approveDepositTerms(TERMS)).rejects.toThrow(/DERIVE_CONTEXT_HASH/);

    await provider.deriveContextHash("app", "aa".repeat(32));
    h.sent.length = 0;
    await provider.approveDepositTerms(TERMS);
    expect(approveApdus().length).toBeGreaterThan(0);
  });

  it("treats a failed re-derive as leaving the device at IDLE", async () => {
    // Derive invalidates on receipt (derive_context_hash.c), so a user decline
    // of screen 1 leaves the device holding nothing — the host must not keep
    // trusting the earlier root.
    const provider = await derived();
    h.failNext = new Error("declined on screen 1");

    await expect(provider.deriveContextHash("app", "bb".repeat(32))).rejects.toThrow("declined on screen 1");
    h.failNext = undefined;

    await expect(provider.approveDepositTerms(TERMS)).rejects.toThrow(/DERIVE_CONTEXT_HASH/);
  });

  it("re-runs the ceremony after a later derive, which wipes the loaded intent on-device", async () => {
    // preparePegin retries derive → approve → sign; if the byte-equal approve
    // no-op'd across the derive, the device would hold nothing and every later
    // signature would die with SW_BAD_STATE.
    const provider = await derived();
    await provider.approveDepositTerms(TERMS);

    await provider.deriveContextHash("app", "bb".repeat(32));
    h.sent.length = 0;

    await provider.approveDepositTerms(TERMS);
    expect(approveApdus().length).toBeGreaterThan(0);
  });

  it("forgets the approval on disconnect — a new connection starts at IDLE", async () => {
    // Same instance throughout: the reset must live in disconnect(), not in
    // object construction.
    const provider = await derived();
    await provider.approveDepositTerms(TERMS);
    await provider.disconnect();
    await provider.connectWallet();

    // The derive gate proves the state reset...
    await expect(provider.approveDepositTerms(TERMS)).rejects.toThrow(/DERIVE_CONTEXT_HASH/);

    // ...and a fresh derive proves the memo reset: the byte-equal terms run a
    // real ceremony again instead of no-op'ing.
    await provider.deriveContextHash("app", "aa".repeat(32));
    h.sent.length = 0;
    await provider.approveDepositTerms(TERMS);
    expect(approveApdus().length).toBeGreaterThan(0);
  });

  it("has no inscriptions and no account-change event to subscribe to", async () => {
    const provider = await connected();

    await expect(provider.getInscriptions()).resolves.toEqual([]);
    expect(() => provider.on()).not.toThrow();
    expect(() => provider.off()).not.toThrow();
  });
});
