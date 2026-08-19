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

import type { DepositTerms, InputSigExpectation } from "@babylonlabs-io/ledger-vault-signer";
import {
  LedgerDeviceError,
  LedgerDeviceLockedError,
  LedgerSignPsbtAbortedError,
  LedgerSignPsbtProtocolError,
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
  session: { dmk: {}, sessionId: "s1", appName: "Babylon Vault", appVersion: "0.9.5" },
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

// The SIGN_PSBT core is the signer package's own tested surface; here it is
// stubbed so the tests pin the PROVIDER's orchestration around it (gates,
// mirror transitions, fingerprints, the operation lock).
const signMock = vi.hoisted(() => ({
  prepareSignPsbt: vi.fn(),
  signPreparedVaultPsbt: vi.fn(),
}));

// Partial mock: the DMK/device layers are stubbed, everything protocol-shaped
// (envelope gate, TLV encoding, DepositTermsRejectedError) stays real.
vi.mock("@babylonlabs-io/ledger-vault-signer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@babylonlabs-io/ledger-vault-signer")>()),
  ...dmkSessionMock,
  ...derivationMock,
  ...signMock,
  createDmkApduSender: () => async (apdu: { ins: number; p1: number; data: Uint8Array }) => {
    if (h.failNext) throw h.failNext;
    h.sent.push({ ins: apdu.ins, p1: apdu.p1, data: apdu.data });
    return new Uint8Array(32).fill(9);
  },
  createDmkRawApduSender: () => async () => ({ sw: 0x9000, data: new Uint8Array(0) }),
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

/**
 * Minimal prepared shape the provider consumes: the table (typed against the
 * signer's discriminant so a rename breaks this file's compile), the request
 * identity, and the merge source the device mock echoes back.
 */
function fakePrepared(psbtHex: string, kind: InputSigExpectation["kind"] = "tapscript", unsignedTxid?: string) {
  const expectation =
    kind === "tapscript"
      ? { kind, expectedLeafHashHexes: new Set(["ef".repeat(32)]), expectedSignerXOnlyHex: "ab".repeat(32) }
      : { kind, expectedOutputKeyHex: "cd".repeat(32) };
  return {
    originalPsbtHex: psbtHex,
    // Case-insensitive like the real txid (decoded bytes, not hex casing).
    unsignedTxid: unsignedTxid ?? `txid-${psbtHex.toLowerCase()}`,
    table: { byInput: new Map([[0, expectation]]), expectedYieldCount: 1 },
  };
}

beforeEach(() => {
  h.sent.length = 0;
  h.failNext = undefined;
  derivationMock.getXOnlyPublicKeyHex.mockClear();
  dmkSessionMock.connectDmkSession.mockReset();
  dmkSessionMock.connectDmkSession.mockResolvedValue(h.session);
  dmkSessionMock.isSessionAlive.mockReset();
  dmkSessionMock.isSessionAlive.mockResolvedValue(true);
  signMock.prepareSignPsbt.mockReset();
  signMock.prepareSignPsbt.mockImplementation(({ psbtHex }: { psbtHex: string }) => fakePrepared(psbtHex));
  signMock.signPreparedVaultPsbt.mockReset();
  signMock.signPreparedVaultPsbt.mockImplementation(async (_send, prepared: { originalPsbtHex: string }) => ({
    signedPsbtHex: `signed:${prepared.originalPsbtHex}`,
    yields: [],
  }));
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

  it("fails signMessage with a capability error rather than a wrong result", async () => {
    const provider = await connected();

    await expect(provider.signMessage("m", "bip322-simple")).rejects.toMatchObject({
      code: ERROR_CODES.WALLET_METHOD_NOT_SUPPORTED,
    });
  });

  describe("signPsbt/signPsbts (#2219 B3)", () => {
    const PSBT_A = "aa".repeat(40);
    const PSBT_B = "bb".repeat(40);
    const PSBT_C = "c1".repeat(40);

    /** Connect, derive, and approve — the state signing requires. */
    async function approved() {
      const provider = await derived();
      await provider.approveDepositTerms(TERMS);
      return provider;
    }

    /** The resendOnceOnIncorrectData the Nth device call received. */
    function resendFlagOfCall(index: number): boolean | undefined {
      return signMock.signPreparedVaultPsbt.mock.calls[index]?.[2]?.resendOnceOnIncorrectData;
    }

    it("signs under the loaded intent and keeps it loaded for further PSBTs", async () => {
      const provider = await approved();

      await expect(provider.signPsbt(PSBT_A)).resolves.toBe(`signed:${PSBT_A}`);
      await expect(provider.signPsbt(PSBT_B)).resolves.toBe(`signed:${PSBT_B}`);
      // The intent survived both signs: a byte-equal re-approval is a no-op.
      await expect(provider.approveDepositTerms(TERMS)).resolves.toBeUndefined();
      // The connect-time app identity reaches the loop's diagnostics.
      expect(signMock.signPreparedVaultPsbt.mock.calls[0][2].appIdentity).toEqual({
        appName: "Babylon Vault",
        appVersion: "0.9.5",
      });
    });

    it("refuses to re-sign the same PSBT under one intent — case-insensitively", async () => {
      const provider = await approved();
      await provider.signPsbt(PSBT_A);

      await expect(provider.signPsbt(PSBT_A)).rejects.toThrow(/already signed/);
      await expect(provider.signPsbt(PSBT_A.toUpperCase())).rejects.toThrow(/already signed/);
      expect(signMock.signPreparedVaultPsbt).toHaveBeenCalledTimes(1);
    });

    it("requires an approved intent before any device I/O", async () => {
      const provider = await derived();

      await expect(provider.signPsbt(PSBT_A)).rejects.toThrow(/no approved intent/);
      expect(signMock.prepareSignPsbt).not.toHaveBeenCalled();
      expect(signMock.signPreparedVaultPsbt).not.toHaveBeenCalled();
    });

    it("throws on autoFinalized: true instead of silently not finalizing", async () => {
      const provider = await approved();

      await expect(provider.signPsbt(PSBT_A, { autoFinalized: true })).rejects.toThrow(/never finalizes/);
      expect(signMock.prepareSignPsbt).not.toHaveBeenCalled();
      expect(signMock.signPreparedVaultPsbt).not.toHaveBeenCalled();
    });

    it("rejects malformed hex before hashing or device I/O", async () => {
      const provider = await approved();

      await expect(provider.signPsbt("zz")).rejects.toMatchObject({ code: ERROR_CODES.INVALID_PARAMS });
      expect(signMock.prepareSignPsbt).not.toHaveBeenCalled();
      expect(signMock.signPreparedVaultPsbt).not.toHaveBeenCalled();
    });

    it("rejects a keypath table actionably — Pre-PegIn/PoP need the wallet-policy path", async () => {
      const provider = await approved();
      signMock.prepareSignPsbt.mockImplementationOnce(({ psbtHex }: { psbtHex: string }) =>
        fakePrepared(psbtHex, "taproot-keypath"),
      );

      await expect(provider.signPsbt(PSBT_A)).rejects.toThrow(/wallet-policy path/);
      expect(signMock.signPreparedVaultPsbt).not.toHaveBeenCalled();
      // The rejection cost no ceremony: the intent still signs.
      await expect(provider.signPsbt(PSBT_A)).resolves.toBe(`signed:${PSBT_A}`);
    });

    it("a prepare-time rejection leaves the mirror and the intent untouched", async () => {
      const provider = await approved();
      signMock.prepareSignPsbt.mockImplementationOnce(() => {
        throw new LedgerSignPsbtProtocolError("input 0 already carries a tapScriptSig");
      });

      await expect(provider.signPsbt(PSBT_A)).rejects.toMatchObject({ code: ERROR_CODES.INVALID_PARAMS });
      await expect(provider.signPsbt(PSBT_A)).resolves.toBe(`signed:${PSBT_A}`);
    });

    it("an intent-gone status word drops the mirror; a re-ceremony makes the same PSBT signable", async () => {
      const provider = await approved();
      signMock.signPreparedVaultPsbt.mockRejectedValueOnce(new LedgerDeviceError(0xb007, "SW_BAD_STATE"));

      await expect(provider.signPsbt(PSBT_A)).rejects.toThrow(/no longer holds the approved intent/);
      await expect(provider.signPsbt(PSBT_A)).rejects.toThrow(/no approved intent/);

      await provider.deriveContextHash("app", "aa".repeat(32));
      await provider.approveDepositTerms(TERMS);
      await expect(provider.signPsbt(PSBT_A)).resolves.toBe(`signed:${PSBT_A}`);
    });

    it("an abandonment keeps the intent and arms the one-shot 0x6A80 recovery", async () => {
      const provider = await approved();
      signMock.signPreparedVaultPsbt.mockRejectedValueOnce(new LedgerSignPsbtAbortedError(0, true));

      await expect(provider.signPsbt(PSBT_A)).rejects.toMatchObject({ code: ERROR_CODES.WALLET_NOT_CONNECTED });
      // No re-ceremony needed; the retry passes the recovery flag, and a
      // successful sign disarms it for the call after.
      await expect(provider.signPsbt(PSBT_A)).resolves.toBe(`signed:${PSBT_A}`);
      await provider.signPsbt(PSBT_B);
      expect(resendFlagOfCall(0)).toBe(false);
      expect(resendFlagOfCall(1)).toBe(true);
      expect(resendFlagOfCall(2)).toBe(false);
    });

    it("a pre-send abort does not arm the recovery — no dispatcher was interrupted", async () => {
      const provider = await approved();
      signMock.signPreparedVaultPsbt.mockRejectedValueOnce(new LedgerSignPsbtAbortedError(0, false));

      await expect(provider.signPsbt(PSBT_A)).rejects.toMatchObject({ code: ERROR_CODES.WALLET_NOT_CONNECTED });
      await provider.signPsbt(PSBT_A);
      expect(resendFlagOfCall(1)).toBe(false);
    });

    it("signPsbts signs a whole batch in order under one intent", async () => {
      const provider = await approved();

      // A shorter options array than the batch is fine — missing = defaults.
      await expect(provider.signPsbts([PSBT_A, PSBT_B, PSBT_C], [{}])).resolves.toEqual([
        `signed:${PSBT_A}`,
        `signed:${PSBT_B}`,
        `signed:${PSBT_C}`,
      ]);
      expect(signMock.prepareSignPsbt.mock.calls.map((c) => c[0].psbtHex)).toEqual([PSBT_A, PSBT_B, PSBT_C]);
      await expect(provider.approveDepositTerms(TERMS)).resolves.toBeUndefined();
    });

    it("signPsbts signs sequentially in array order, fails fast, and names the failing index", async () => {
      const provider = await approved();
      signMock.signPreparedVaultPsbt
        .mockImplementationOnce(async (_send, prepared: { originalPsbtHex: string }) => ({
          signedPsbtHex: `signed:${prepared.originalPsbtHex}`,
          yields: [],
        }))
        .mockRejectedValueOnce(new LedgerDeviceError(0xb00a, "SW_CAP_EXCEEDED"));

      await expect(provider.signPsbts([PSBT_A, PSBT_B, PSBT_C])).rejects.toThrow(/signPsbts\[1\].*no longer holds/);
      expect(signMock.signPreparedVaultPsbt).toHaveBeenCalledTimes(2);
      // Staging prepared the whole batch up front, before the first ceremony.
      expect(signMock.prepareSignPsbt.mock.calls.map((c) => c[0].psbtHex)).toEqual([PSBT_A, PSBT_B, PSBT_C]);
    });

    it("signPsbts gates the whole batch before the first ceremony", async () => {
      const provider = await approved();

      await expect(provider.signPsbts([PSBT_A, PSBT_B], [{}, { autoFinalized: true }])).rejects.toThrow(
        /signPsbts\[1\]/,
      );
      // A host-detectable defect at element 1 burned zero approvals: nothing
      // reached the device, nothing was fingerprinted, the intent is untouched.
      expect(signMock.signPreparedVaultPsbt).not.toHaveBeenCalled();
      await expect(provider.signPsbt(PSBT_A)).resolves.toBe(`signed:${PSBT_A}`);
    });

    it("signPsbts requires at least one PSBT", async () => {
      const provider = await approved();

      await expect(provider.signPsbts([])).rejects.toMatchObject({ code: ERROR_CODES.PSBTS_HEXES_REQUIRED });
    });

    it("signPsbts rejects an intra-batch duplicate before any ceremony", async () => {
      const provider = await approved();

      await expect(provider.signPsbts([PSBT_A, PSBT_A])).rejects.toThrow(/signPsbts\[1\].*duplicated within the batch/);
      expect(signMock.signPreparedVaultPsbt).not.toHaveBeenCalled();
    });

    it("a byte-variant serialization of a signed request is still blocked", async () => {
      const provider = await approved();
      await provider.signPsbt(PSBT_A);
      // Different wire bytes, same unsigned tx and expectations (an extra
      // unknown global, say) — identity keying catches what byte-hashing missed.
      signMock.prepareSignPsbt.mockImplementationOnce(() => fakePrepared(PSBT_B, "tapscript", `txid-${PSBT_A}`));

      await expect(provider.signPsbt(PSBT_B)).rejects.toThrow(/already signed/);
      expect(signMock.signPreparedVaultPsbt).toHaveBeenCalledTimes(1);
    });

    it("hex validation speaks before prepare and the replay guard", async () => {
      const provider = await approved();
      await provider.signPsbt("aabb");

      await expect(provider.signPsbt("aabbzz")).rejects.toThrow(/needs even-length hex/);
      expect(signMock.prepareSignPsbt).toHaveBeenCalledTimes(1);
    });

    it("maps a throwing liveness probe onto a WalletError", async () => {
      // isSessionAlive rethrows DMK's plain {_tag} objects — they must not
      // escape signPsbt unmapped.
      const provider = await approved();
      dmkSessionMock.isSessionAlive.mockRejectedValueOnce({
        _tag: "TransportError",
        originalError: { message: "hid gone" },
      });

      await expect(provider.signPsbt(PSBT_A)).rejects.toMatchObject({ code: ERROR_CODES.CONNECTION_FAILED });
    });

    /** Hung device mock whose promise rejects only when the signal aborts. */
    function hangUntilAborted(): void {
      signMock.signPreparedVaultPsbt.mockImplementationOnce(
        (_send, _prepared, opts: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            opts.signal.addEventListener("abort", () => reject(new LedgerSignPsbtAbortedError(0, true)));
          }),
      );
    }

    it("admits one device ceremony at a time", async () => {
      const provider = await approved();
      hangUntilAborted();
      const inFlight = provider.signPsbt(PSBT_A);
      inFlight.catch(() => {});
      await vi.waitFor(() => expect(signMock.signPreparedVaultPsbt).toHaveBeenCalledTimes(1));

      await expect(provider.signPsbt(PSBT_B)).rejects.toThrow(/already running a device ceremony/);
      await expect(provider.deriveContextHash("app", "aa".repeat(32))).rejects.toThrow(/already running/);
      await expect(provider.approveDepositTerms(TERMS)).rejects.toThrow(/already running/);

      await provider.disconnect();
      await inFlight.catch(() => {});
    });

    it("disconnect aborts the in-flight signing loop and surfaces it as a disconnection", async () => {
      const provider = await approved();
      hangUntilAborted();
      const inFlight = provider.signPsbt(PSBT_A);
      inFlight.catch(() => {});
      await vi.waitFor(() => expect(signMock.signPreparedVaultPsbt).toHaveBeenCalledTimes(1));

      // Teardown releases the lock synchronously and aborts the loop; the
      // stale call surfaces as a disconnection.
      await provider.disconnect();
      await expect(inFlight).rejects.toMatchObject({ code: ERROR_CODES.WALLET_NOT_CONNECTED });
    });

    it("a stale sign settling after reconnect commits nothing to the new connection", async () => {
      const provider = await approved();
      let resolveStale: (value: { signedPsbtHex: string; yields: never[] }) => void = () => {};
      signMock.signPreparedVaultPsbt.mockImplementationOnce(
        () =>
          new Promise<{ signedPsbtHex: string; yields: never[] }>((resolve) => {
            resolveStale = resolve;
          }),
      );
      const stale = provider.signPsbt(PSBT_A);
      stale.catch(() => {});
      await vi.waitFor(() => expect(signMock.signPreparedVaultPsbt).toHaveBeenCalledTimes(1));

      // The new connection establishes fresh intent state while the old call hangs.
      await provider.disconnect();
      await provider.connectWallet();
      await provider.deriveContextHash("app", "aa".repeat(32));
      await provider.approveDepositTerms(TERMS);
      await provider.signPsbt(PSBT_B);

      resolveStale({ signedPsbtHex: `signed:${PSBT_A}`, yields: [] });
      await expect(stale).rejects.toThrow(/connection changed/);
      // The stale settlement neither cleared the new fingerprints nor the mirror.
      await expect(provider.signPsbt(PSBT_B)).rejects.toThrow(/already signed/);
      await expect(provider.signPsbt(PSBT_C)).resolves.toBe(`signed:${PSBT_C}`);
    });

    it("a byte-equal re-approval preserves the replay guard — the device masks were untouched", async () => {
      const provider = await approved();
      await provider.signPsbt(PSBT_A);

      await provider.approveDepositTerms(TERMS);

      await expect(provider.signPsbt(PSBT_A)).rejects.toThrow(/already signed/);
    });

    it("a dead session tears everything down, not just the mirror", async () => {
      // An unplug wipes the device's vault state — a partial reset would leave
      // a half-connected provider whose next call fails confusingly.
      const provider = await approved();
      await provider.signPsbt(PSBT_A);
      dmkSessionMock.isSessionAlive.mockResolvedValueOnce(false);

      await expect(provider.signPsbt(PSBT_B)).rejects.toThrow(/was disconnected/);
      await expect(provider.getAddress()).rejects.toThrow(/not connected/);
      await expect(provider.signPsbt(PSBT_B)).rejects.toThrow(/not connected/);
    });

    it("a stale liveness probe settling after reconnect cannot tear down the new session", async () => {
      const provider = await approved();
      let resolveProbe: (alive: boolean) => void = () => {};
      dmkSessionMock.isSessionAlive.mockImplementationOnce(
        () =>
          new Promise<boolean>((resolve) => {
            resolveProbe = resolve;
          }),
      );
      const stale = provider.signPsbt(PSBT_A);
      stale.catch(() => {});
      await vi.waitFor(() => expect(dmkSessionMock.isSessionAlive).toHaveBeenCalled());

      await provider.disconnect();
      await provider.connectWallet();
      await provider.deriveContextHash("app", "aa".repeat(32));
      await provider.approveDepositTerms(TERMS);
      await provider.signPsbt(PSBT_B);

      resolveProbe(false);
      await expect(stale).rejects.toThrow(/was disconnected|connection changed/);
      // The stale dead-probe verdict must not have torn down the fresh session.
      await expect(provider.signPsbt(PSBT_C)).resolves.toBe(`signed:${PSBT_C}`);
      await expect(provider.signPsbt(PSBT_B)).rejects.toThrow(/already signed/);
    });

    it("a fresh derive disarms the resend-once recovery", async () => {
      const provider = await approved();
      signMock.signPreparedVaultPsbt.mockRejectedValueOnce(new LedgerSignPsbtAbortedError(0, true));
      await expect(provider.signPsbt(PSBT_A)).rejects.toMatchObject({ code: ERROR_CODES.WALLET_NOT_CONNECTED });

      await provider.deriveContextHash("app", "aa".repeat(32));
      await provider.approveDepositTerms(TERMS);
      await provider.signPsbt(PSBT_A);

      // The armed flag died with the old intent — the fresh sign must not resend.
      expect(resendFlagOfCall(1)).toBe(false);
    });

    it("a fresh approval resets the replay guard — the device counters were reset too", async () => {
      const provider = await approved();
      await provider.signPsbt(PSBT_A);

      await provider.deriveContextHash("app", "aa".repeat(32));
      await provider.approveDepositTerms(TERMS);

      await expect(provider.signPsbt(PSBT_A)).resolves.toBe(`signed:${PSBT_A}`);
    });
  });

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

  it("refuses the ceremony when the session has died, and tears everything down", async () => {
    const provider = await derived();
    dmkSessionMock.isSessionAlive.mockResolvedValue(false);
    h.sent.length = 0;

    await expect(provider.approveDepositTerms(TERMS)).rejects.toThrow(/was disconnected/);
    expect(h.sent).toHaveLength(0);
    // A dead session means the device state is gone — a partial reset would
    // leave a half-connected provider behind.
    await expect(provider.getAddress()).rejects.toThrow(/not connected/);
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
