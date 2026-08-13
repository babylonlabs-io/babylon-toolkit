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

import type { DepositTerms } from "@babylonlabs-io/ledger-vault-signer";
import {
  LedgerDeviceError,
  LedgerDeviceLockedError,
  LedgerUserRefusedError,
} from "@babylonlabs-io/ledger-vault-signer";
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

const derivationMock = vi.hoisted(() => ({
  getXOnlyPublicKeyHex: vi.fn(async () => VECTOR_XONLY),
}));

// Partial mock: the DMK/device layers are stubbed, everything protocol-shaped
// (envelope gate, TLV encoding, DepositTermsRejectedError) stays real.
vi.mock("@babylonlabs-io/ledger-vault-signer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@babylonlabs-io/ledger-vault-signer")>()),
  ...dmkSessionMock,
  ...derivationMock,
  createDmkApduSender: () => async (apdu: { ins: number; p1: number; data: Uint8Array }) => {
    if (h.failNext) throw h.failNext;
    h.sent.push({ ins: apdu.ins, p1: apdu.p1, data: apdu.data });
    return new Uint8Array(32).fill(9);
  },
}));

import { LedgerVaultProvider } from "../provider";

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

  it("re-reads the pubkey and resets intent state on a dead-session reconnect", async () => {
    // A different device may be plugged in: the old pubkey and intent state
    // must not survive the reconnect.
    const provider = await derived();
    await provider.approveDepositTerms(TERMS);
    await provider.getAddress();
    derivationMock.getXOnlyPublicKeyHex.mockClear();

    dmkSessionMock.isSessionAlive.mockResolvedValueOnce(false); // connect's own liveness probe
    dmkSessionMock.isSessionAlive.mockResolvedValue(true);
    await provider.connectWallet();

    await provider.getAddress();
    expect(derivationMock.getXOnlyPublicKeyHex).toHaveBeenCalledTimes(1);
    await expect(provider.approveDepositTerms(TERMS)).rejects.toThrow(/DERIVE_CONTEXT_HASH/);
  });

  it("shares one session across concurrent connectWallet calls", async () => {
    // A double-click must not open — and leak — a second HID session.
    const provider = new LedgerVaultProvider(Network.SIGNET);
    await Promise.all([provider.connectWallet(), provider.connectWallet()]);

    expect(dmkSessionMock.connectDmkSession).toHaveBeenCalledTimes(1);
  });

  it("aborts a reconnect whose liveness probe raced a disconnect", async () => {
    // disconnect() during the isSessionAlive await must cancel the in-flight
    // reconnect — no new session opened behind the disconnected wallet.
    const provider = await connected();
    expect(dmkSessionMock.connectDmkSession).toHaveBeenCalledTimes(1);

    let resolveAlive: (v: boolean) => void = () => {};
    dmkSessionMock.isSessionAlive.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        resolveAlive = resolve;
      }),
    );

    const reconnecting = provider.connectWallet();
    await provider.disconnect(); // races the liveness probe
    resolveAlive(false);
    await reconnecting;

    expect(dmkSessionMock.connectDmkSession).toHaveBeenCalledTimes(1); // no new session
    await expect(provider.getAddress()).rejects.toThrow(/not connected/);
  });

  it("tears down a session whose connect raced a disconnect, leaving the wallet disconnected", async () => {
    // disconnect() during the connectDmkSession await bumps the generation;
    // the resolved session must be torn down, not installed behind a
    // disconnected wallet (a leaked HID connection).
    const provider = new LedgerVaultProvider(Network.SIGNET);
    let resolveConnect: (session: typeof h.session) => void = () => {};
    dmkSessionMock.connectDmkSession.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveConnect = resolve;
      }),
    );

    const connecting = provider.connectWallet();
    await provider.disconnect(); // races the pending connect
    resolveConnect(h.session);
    await connecting;

    expect(dmkSessionMock.disconnectDmkSession).toHaveBeenCalledWith(h.session);
    await expect(provider.getAddress()).rejects.toThrow(/not connected/);
  });

  it("clears the in-flight connect memo after a failure so a retry can connect", async () => {
    // The identity-guarded finally must release the memo on rejection too, or
    // the provider would be wedged unable to reconnect.
    const provider = new LedgerVaultProvider(Network.SIGNET);
    dmkSessionMock.connectDmkSession.mockRejectedValueOnce({
      _tag: "NoAccessibleDeviceError",
      originalError: new Error("boom"),
    });

    await expect(provider.connectWallet()).rejects.toThrow(WalletError);
    await expect(provider.connectWallet()).resolves.toBeUndefined();
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
      /vaultCoreVersion 1 is not 2/,
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

  it("rejects a malformed hex context before deriving", async () => {
    // Buffer.from truncates silently, so a bad context would derive a root over
    // a shorter preimage — every secret wrong, nothing on the device screen.
    const provider = await connected();
    h.sent.length = 0;

    await expect(provider.deriveContextHash("app", "zz".repeat(32))).rejects.toThrow(/even-length lowercase hex/);
    await expect(provider.deriveContextHash("app", "abc")).rejects.toThrow(/even-length lowercase hex/);
    expect(h.sent).toHaveLength(0);
  });

  it("reads the key at the signet BIP-86 leaf and stamps coinType 1 into the intent", async () => {
    // Pins COIN_TYPE_BY_NETWORK + depositorPath: a swapped mainnet/testnet map
    // would read the wrong key and encode the wrong coin type.
    const HARDENED = 0x80000000;
    const provider = await derived();
    await provider.approveDepositTerms(TERMS);

    expect(derivationMock.getXOnlyPublicKeyHex).toHaveBeenCalledWith(
      expect.anything(),
      [86 + HARDENED, 1 + HARDENED, 0 + HARDENED, 0, 0],
      expect.anything(),
    );
    // TAG_COIN_TYPE 0x0021, len 0x04, u32BE(1) in the scalars APDU.
    expect(Buffer.from(approveApdus()[0].data).toString("hex")).toContain("00210400000001");
  });

  it("reverses the txid into the internal order the device compares against", async () => {
    const provider = await derived();
    await provider.approveDepositTerms(TERMS);

    // Display order starts "aa11…"; the wire must carry the reverse, so the
    // 32-byte value ends with "…11aa".
    const scalars = Buffer.from(approveApdus()[0].data).toString("hex");
    expect(scalars).toContain(`0027 20 ${"11".repeat(31)}aa`.replace(/ /g, ""));
  });

  it("rejects terms whose roster reuses the depositor's own key before the ceremony", async () => {
    // VECTOR_XONLY is the device pubkey; the firmware rejects this only after
    // the whole ceremony, so the provider pre-empts it as a shaped error before
    // any approval APDU (approveApdus is empty).
    const provider = await derived();
    h.sent.length = 0;

    await expect(
      provider.approveDepositTerms({ ...TERMS, vaultKeeperBtcPubkeys: [VECTOR_XONLY] }),
    ).rejects.toMatchObject({ name: "DepositTermsRejectedError", reason: "device-envelope" });
    expect(approveApdus()).toHaveLength(0);
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

  it("treats a reordered-but-identical roster as the same intent", async () => {
    // The encoder sorts rosters before the wire, so a caller-order permutation
    // produces byte-identical APDUs — it must be a no-op, not a false
    // "different intent" rejection.
    const twoKeeperTerms = {
      ...TERMS,
      vaultKeeperBtcPubkeys: ["cc".repeat(32), "ee".repeat(32)],
    };
    const provider = await derived();
    await provider.approveDepositTerms(twoKeeperTerms);
    const afterFirst = approveApdus().length;

    await provider.approveDepositTerms({
      ...twoKeeperTerms,
      vaultKeeperBtcPubkeys: ["ee".repeat(32), "cc".repeat(32)],
    });

    expect(approveApdus()).toHaveLength(afterFirst);
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

  it.each([
    ["a changed pegin amount", { vaults: [{ ...TERMS.vaults[0], peginAmount: 999_999n }] }],
    ["a swapped keeper key", { vaultKeeperBtcPubkeys: ["ab".repeat(32)] }],
  ])("rejects %s while an intent is loaded — the fingerprint is value-sensitive", async (_label, override) => {
    const provider = await derived();
    await provider.approveDepositTerms(TERMS);
    h.sent.length = 0;

    await expect(provider.approveDepositTerms({ ...TERMS, ...override })).rejects.toThrow(
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

  it("refuses to commit intent state when the connection changed mid-ceremony", async () => {
    // A disconnect+reconnect racing an await inside approveDepositTerms must not
    // land 'intent-loaded' on the fresh connection. The swap re-derives on the
    // new connection, so the phase check passes — ONLY the generation guard can
    // catch the stale-sender commit, which is what this pins.
    const provider = await derived();
    let swapped = false;
    dmkSessionMock.isSessionAlive.mockImplementation(async () => {
      if (!swapped) {
        swapped = true;
        await provider.disconnect();
        await provider.connectWallet();
        await provider.deriveContextHash("app", "aa".repeat(32));
      }
      return true;
    });

    await expect(provider.approveDepositTerms(TERMS)).rejects.toThrow(/connection changed/);
  });

  it("maps a non-Error DMK transport failure onto a WalletError", async () => {
    // DMK errors are plain {_tag, originalError} objects; unmapped they reach
    // the app as "[object Object]".
    const provider = await connected();
    h.failNext = { _tag: "DeviceSessionNotFound", originalError: { message: "device unplugged" } } as unknown as Error;

    await expect(provider.deriveContextHash("app", "aa".repeat(32))).rejects.toMatchObject({
      code: ERROR_CODES.CONNECTION_FAILED,
      wallet: "Ledger Vault",
      message: "device unplugged",
    });
  });

  it.each([
    ["a device decline", new LedgerUserRefusedError(0x6985), ERROR_CODES.CONNECTION_REJECTED],
    ["a locked device", new LedgerDeviceLockedError(0x5515), ERROR_CODES.CONNECTION_FAILED],
    [
      "a generic device rejection",
      new LedgerDeviceError(0x6f42, "The device rejected the request"),
      ERROR_CODES.UNKNOWN_ERROR,
    ],
  ])("maps %s onto the connector's WalletError taxonomy", async (_label, typedError, code) => {
    // The signer package throws typed errors; the provider's one mapping seam
    // must translate them, or user-cancellation classification breaks app-side.
    const provider = await connected();
    h.failNext = typedError;

    await expect(provider.deriveContextHash("app", "aa".repeat(32))).rejects.toMatchObject({
      code,
      wallet: "Ledger Vault",
      message: typedError.message,
    });
  });

  it("has no inscriptions and no account-change event to subscribe to", async () => {
    const provider = await connected();

    await expect(provider.getInscriptions()).resolves.toEqual([]);
    expect(() => provider.on()).not.toThrow();
    expect(() => provider.off()).not.toThrow();
  });
});
