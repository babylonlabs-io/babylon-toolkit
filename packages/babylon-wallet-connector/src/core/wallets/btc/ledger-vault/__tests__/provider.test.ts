/**
 * Provider-level tests. The DMK layers are mocked; what matters here is the
 * orchestration contract — that the envelope gate runs before any device I/O,
 * that the derive → approve state machine matches the device's, that
 * unsupported requests fail with a typed capability error rather than a silent
 * wrong result, and that the intent carries the right byte order.
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
import { initEccLib, payments, Psbt } from "bitcoinjs-lib";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Network } from "@/core/types";
import { getTaprootAddress, toNetwork } from "@/core/utils/wallet";
import { ERROR_CODES, WalletError } from "@/error";

/** BIP-86 first-address vector: x-only key and its published P2TR address. */
const VECTOR_XONLY = "cc8a4bc64d897bddc5fbc2f670f7a8ba0b386779106cf1223c6fc5d7cd6fc115";
const VECTOR_MAINNET_ADDRESS = "bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr";
/**
 * The device's depositor key — the `0/0` child of {@link ACCOUNT_XPUB}. The
 * provider cross-checks the two reads against each other, so a key unrelated
 * to the xpub would (correctly) be rejected as an inconsistent device.
 */
const DEVICE_XONLY = "dc8d2f9eff0c4f4dbde070a48e330efc908b62a766568d91e658f284b324b878";
/** The `m/86'/1'/0'` account xpub the device reports (testnet versions). */
const ACCOUNT_XPUB =
  "tpubDDKYE6BREvDsSWMazgHoyQWiJwYaDDYPbCFjYxN3HFXJP5fokeiK4hwK5tTLBNEDBwrDXn8cQ4v9b2xdW62Xr5yxoQdMu1v6c7UDXYVH27U";

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
  getXOnlyPublicKeyHex: vi.fn(async () => DEVICE_XONLY),
  getMasterFingerprintHex: vi.fn(async () => "73c5da0a"),
  getExtendedPublicKey: vi.fn(async () => ACCOUNT_XPUB),
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
function fakePrepared(psbtHex: string, unsignedTxid?: string) {
  const expectation: InputSigExpectation = {
    kind: "tapscript",
    expectedLeafHashHexes: new Set(["ef".repeat(32)]),
    expectedSignerXOnlyHex: "ab".repeat(32),
  };
  return {
    originalPsbtHex: psbtHex,
    // Case-insensitive like the real txid (decoded bytes, not hex casing).
    unsignedTxid: unsignedTxid ?? `txid-${psbtHex.toLowerCase()}`,
    table: { byInput: new Map([[0, expectation]]), expectedYieldCount: 1 },
  };
}

/** The unmocked signer package — these tests drive its real prepare/derive paths. */
function actualSigner() {
  return vi.importActual<typeof import("@babylonlabs-io/ledger-vault-signer")>("@babylonlabs-io/ledger-vault-signer");
}

/** x-only key at `m/86'/1'/0'/1/0` under {@link ACCOUNT_XPUB} — the device's change key. */
async function changeXOnlyHex(): Promise<string> {
  const { deriveChangeXOnlyHex } = await actualSigner();
  return deriveChangeXOnlyHex(ACCOUNT_XPUB, toNetwork(Network.SIGNET).bip32, 0);
}

beforeEach(() => {
  h.sent.length = 0;
  h.failNext = undefined;
  derivationMock.getXOnlyPublicKeyHex.mockClear();
  derivationMock.getMasterFingerprintHex.mockClear();
  derivationMock.getExtendedPublicKey.mockClear();
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

    expect(pubkey).toBe(DEVICE_XONLY);
    // The address is never read from the device — it is derived locally from
    // the pubkey, so it must equal the util's derivation for the same network.
    expect(address).toBe(getTaprootAddress(DEVICE_XONLY, Network.SIGNET));
    expect(derivationMock.getXOnlyPublicKeyHex).toHaveBeenCalledTimes(1);
  });

  it("derives the published BIP-86 vector address on mainnet", async () => {
    // Pins getTaprootAddress against the BIP-86 published vector, so this one
    // reads the vector key rather than the fixture device's own.
    derivationMock.getXOnlyPublicKeyHex.mockResolvedValueOnce(VECTOR_XONLY);
    const provider = new LedgerVaultProvider(Network.MAINNET);
    await provider.connectWallet();

    await expect(provider.getAddress()).resolves.toBe(VECTOR_MAINNET_ADDRESS);
  });

  it("re-reads the pubkey after a failed read instead of replaying the rejection", async () => {
    const provider = await connected();
    derivationMock.getXOnlyPublicKeyHex.mockRejectedValueOnce(new Error("device unplugged"));

    await expect(provider.getPublicKeyHex()).rejects.toThrow("device unplugged");
    await expect(provider.getPublicKeyHex()).resolves.toBe(DEVICE_XONLY);
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

  describe("signMessage (BIP-322 PoP)", () => {
    const POP_MESSAGE =
      "0xabcdef1234567890abcdef1234567890abcdef12:11155111:pegin:0x1234567890abcdef1234567890abcdef12345678";
    const SIG = "ab".repeat(64);

    beforeEach(() => {
      signMock.signPreparedVaultPsbt.mockImplementation(async () => ({
        signedPsbtHex: "unused",
        yields: [
          {
            kind: "taproot-keypath",
            inputIndex: 0,
            outputKeyHex: "00".repeat(32),
            signature: Buffer.from(SIG, "hex"),
          },
        ],
      }));
    });

    it("signs a PoP under the default tr(@0/**) policy and returns the 66-byte witness as 0x-hex", async () => {
      const p = await connected();

      const out = await p.signMessage(POP_MESSAGE, "bip322-simple");

      expect(out).toBe(`0x0140${SIG}`);
      // Policy built from the device reads, with the account path (3 levels) and the testnet versions.
      expect(derivationMock.getMasterFingerprintHex).toHaveBeenCalledTimes(1);
      expect(derivationMock.getExtendedPublicKey).toHaveBeenCalledTimes(1);
      expect(derivationMock.getExtendedPublicKey).toHaveBeenCalledWith(
        expect.anything(),
        [86 + 0x80000000, 1 + 0x80000000, 0 + 0x80000000],
        toNetwork(Network.SIGNET).bip32,
      );
      const prepareArgs = signMock.prepareSignPsbt.mock.calls[0][0];
      expect(prepareArgs.walletPolicy?.keyInfo).toMatch(/^\[73c5da0a\/86'\/1'\/0'\]tpubDDKYE6B/);
      expect(prepareArgs.depositorXOnlyHex).toBe(DEVICE_XONLY);
      // The PSBT handed to prepare is a PoP PSBT (version 0, message in the proprietary key).
      expect(prepareArgs.psbtHex).toMatch(/^70736274ff/);
      expect(Buffer.from(prepareArgs.psbtHex, "hex").toString("latin1")).toContain(POP_MESSAGE);
    });

    it("does not require an approved intent (PoP is state-independent on the device)", async () => {
      const p = await connected(); // connected, NO deriveContextHash/approveDepositTerms

      await expect(p.signMessage(POP_MESSAGE, "bip322-simple")).resolves.toMatch(/^0x0140/);
    });

    it("caches the wallet policy per connection and drops it on teardown", async () => {
      const p = await connected();
      await p.signMessage(POP_MESSAGE, "bip322-simple");
      await p.signMessage(POP_MESSAGE, "bip322-simple");

      expect(derivationMock.getMasterFingerprintHex).toHaveBeenCalledTimes(1);

      await p.disconnect();
      await p.connectWallet();
      await p.signMessage(POP_MESSAGE, "bip322-simple");

      expect(derivationMock.getMasterFingerprintHex).toHaveBeenCalledTimes(2);
    });

    it("rejects ecdsa with WALLET_METHOD_NOT_SUPPORTED without touching the device", async () => {
      const p = await connected();

      await expect(p.signMessage(POP_MESSAGE, "ecdsa")).rejects.toMatchObject({
        code: ERROR_CODES.WALLET_METHOD_NOT_SUPPORTED,
      });
      expect(signMock.prepareSignPsbt).not.toHaveBeenCalled();
    });

    it("fails when the device returns no key-path yield (the no-policy silent-success shape)", async () => {
      signMock.signPreparedVaultPsbt.mockImplementation(async () => ({ signedPsbtHex: "unused", yields: [] }));
      const p = await connected();

      await expect(p.signMessage(POP_MESSAGE, "bip322-simple")).rejects.toThrow(/no key-path signature/);
    });

    it("leaves the intent mirror and signed-fingerprint set untouched", async () => {
      const p = await connected();
      await p.deriveContextHash("app", "aa".repeat(32));
      await p.approveDepositTerms(TERMS);

      await p.signMessage(POP_MESSAGE, "bip322-simple");

      // A tapscript signPsbt after PoP must still pass the intent gate and sign.
      // `prepareSignPsbt`/`signPreparedVaultPsbt` are mocked in this file, so restore the
      // file's default signing stub for this call.
      signMock.signPreparedVaultPsbt.mockImplementationOnce(async (_send, prepared: { originalPsbtHex: string }) => ({
        signedPsbtHex: `signed:${prepared.originalPsbtHex}`,
        yields: [],
      }));
      await expect(p.signPsbt("70736274ff00", { autoFinalized: false })).resolves.toBe("signed:70736274ff00");
    });

    it("disconnect aborts the in-flight PoP and surfaces it as a disconnection", async () => {
      const p = await connected();
      // Hang until teardown's abort fires, exactly like the signPsbt loop does.
      signMock.signPreparedVaultPsbt.mockImplementationOnce(
        (_send, _prepared, opts: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            opts.signal.addEventListener("abort", () => reject(new LedgerSignPsbtAbortedError(0)));
          }),
      );
      const inFlight = p.signMessage(POP_MESSAGE, "bip322-simple");
      inFlight.catch(() => {});
      await vi.waitFor(() => expect(signMock.signPreparedVaultPsbt).toHaveBeenCalledTimes(1));

      await p.disconnect();

      // Not UNKNOWN_ERROR: #2110's UX routes cancellation on this code.
      await expect(inFlight).rejects.toMatchObject({ code: ERROR_CODES.WALLET_NOT_CONNECTED });
    });

    it("a failed PoP leaves the approved intent and the replay guard untouched", async () => {
      const p = await connected();
      await p.deriveContextHash("app", "aa".repeat(32));
      await p.approveDepositTerms(TERMS);
      await p.signPsbt("70736274ff00", { autoFinalized: false });
      signMock.signPreparedVaultPsbt.mockRejectedValueOnce(
        new LedgerDeviceError(0x6f42, "The device rejected the request"),
      );

      await expect(p.signMessage(POP_MESSAGE, "bip322-simple")).rejects.toThrow(/signMessage/);

      // The device never invalidates its vault context on a PoP, so the mirror
      // must survive — and the earlier signature must still be fingerprinted.
      await expect(p.signPsbt("70736274ff00", { autoFinalized: false })).rejects.toThrow(/already signed/);
      signMock.signPreparedVaultPsbt.mockImplementationOnce(async (_send, prepared: { originalPsbtHex: string }) => ({
        signedPsbtHex: `signed:${prepared.originalPsbtHex}`,
        yields: [],
      }));
      await expect(p.signPsbt("70736274ff11", { autoFinalized: false })).resolves.toBe("signed:70736274ff11");
    });

    it("refuses before connecting", async () => {
      const p = new LedgerVaultProvider(Network.SIGNET);

      await expect(p.signMessage(POP_MESSAGE, "bip322-simple")).rejects.toMatchObject({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
      });
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

    /** BIP-86 P2TR script of an x-only key. */
    function bip86Script(xOnlyHex: string): Buffer {
      initEccLib(ecc);
      return payments.p2tr({ internalPubkey: Buffer.from(xOnlyHex, "hex") }).output!;
    }

    /** An HTLC-shaped P2TR output: a raw witness program the wallet does not own. */
    const HTLC_SCRIPT = Buffer.concat([Buffer.from([0x51, 0x20]), Buffer.alloc(32, 0xbb)]);

    /**
     * A real key-path Pre-PegIn-shaped PSBT so the REAL `prepareSignPsbt` (not
     * mocked in these tests) classifies it as taproot-keypath: every input is
     * the depositor's BIP-86 P2TR.
     */
    function keyPathPsbtHex(outputScripts: Buffer[], inputCount = 1): string {
      const depositorKey = Buffer.from(DEVICE_XONLY, "hex");
      const psbt = new Psbt();
      for (let i = 0; i < inputCount; i++) {
        psbt.addInput({
          hash: Buffer.alloc(32, i + 1),
          index: 0,
          witnessUtxo: { script: bip86Script(DEVICE_XONLY), value: 100_000 },
          tapInternalKey: depositorKey,
        });
      }
      for (const script of outputScripts) psbt.addOutput({ script, value: 90_000 });
      return psbt.toHex();
    }

    it("routes an all-key-path PSBT through wallet-policy mode with derivation fields added", async () => {
      const { prepareSignPsbt: realPrepare } = await actualSigner();
      signMock.prepareSignPsbt.mockImplementation(realPrepare);
      signMock.signPreparedVaultPsbt.mockImplementation(async () => ({ signedPsbtHex: "signed-keypath", yields: [] }));
      const p = await approved();
      const changeXOnly = await changeXOnlyHex();

      await expect(
        p.signPsbt(keyPathPsbtHex([HTLC_SCRIPT, bip86Script(changeXOnly)]), { autoFinalized: false }),
      ).resolves.toBe("signed-keypath");

      const [prepareArgs] = signMock.prepareSignPsbt.mock.calls.at(-1)!;
      expect(prepareArgs.walletPolicy?.keyInfo).toMatch(/^\[73c5da0a\/86'\/1'\/0'\]tpubDDKYE6B/);
      const augmented = Psbt.fromHex(prepareArgs.psbtHex);
      expect(augmented.data.inputs[0].tapBip32Derivation?.[0].path).toBe("m/86'/1'/0'/0/0");
      expect(Buffer.from(augmented.data.inputs[0].tapBip32Derivation![0].masterFingerprint).toString("hex")).toBe(
        "73c5da0a",
      );
      // The change output carries the branch-1 derivation the device needs to
      // mark it internal — without it `_validate_prepegin` rejects the output.
      expect(augmented.data.outputs[1].tapBip32Derivation?.[0].path).toBe("m/86'/1'/0'/1/0");
      expect(Buffer.from(augmented.data.outputs[1].tapInternalKey!).toString("hex")).toBe(changeXOnly);
      // The HTLC output is not ours — marking it internal would fail on-device.
      expect(augmented.data.outputs[0].tapBip32Derivation).toBeUndefined();
    });

    it("adds no output derivation when the PSBT pays the wallet no change", async () => {
      const { prepareSignPsbt: realPrepare } = await actualSigner();
      signMock.prepareSignPsbt.mockImplementation(realPrepare);
      signMock.signPreparedVaultPsbt.mockImplementation(async () => ({ signedPsbtHex: "signed-keypath", yields: [] }));
      const p = await approved();

      await expect(p.signPsbt(keyPathPsbtHex([bip86Script("aa".repeat(32))]), { autoFinalized: false })).resolves.toBe(
        "signed-keypath",
      );

      const [prepareArgs] = signMock.prepareSignPsbt.mock.calls.at(-1)!;
      expect(prepareArgs.walletPolicy?.keyInfo).toMatch(/^\[73c5da0a\/86'\/1'\/0'\]tpubDDKYE6B/);
      const augmented = Psbt.fromHex(prepareArgs.psbtHex);
      expect(augmented.data.inputs[0].tapBip32Derivation?.[0].path).toBe("m/86'/1'/0'/0/0");
      expect(augmented.data.outputs.every((out) => !out.tapBip32Derivation)).toBe(true);
    });

    it("signs a change-less Max sweep — every depositor input marked, no change output", async () => {
      // computeMaxDeposit emits no change (`peginFeeMath.ts:162-165`), and
      // dust-revert drops it too; the firmware accepts zero change.
      const { prepareSignPsbt: realPrepare } = await actualSigner();
      signMock.prepareSignPsbt.mockImplementation(realPrepare);
      signMock.signPreparedVaultPsbt.mockImplementation(async () => ({ signedPsbtHex: "signed-sweep", yields: [] }));
      const p = await approved();

      await expect(p.signPsbt(keyPathPsbtHex([HTLC_SCRIPT], 2), { autoFinalized: false })).resolves.toBe(
        "signed-sweep",
      );

      const [prepareArgs] = signMock.prepareSignPsbt.mock.calls.at(-1)!;
      const augmented = Psbt.fromHex(prepareArgs.psbtHex);
      expect(augmented.data.inputs.map((input) => input.tapBip32Derivation?.[0].path)).toEqual([
        "m/86'/1'/0'/0/0",
        "m/86'/1'/0'/0/0",
      ]);
      expect(augmented.data.outputs[0].tapBip32Derivation).toBeUndefined();
    });

    it("surfaces a disconnect during the policy read as a disconnection, not a bad PSBT", async () => {
      const { prepareSignPsbt: realPrepare } = await actualSigner();
      signMock.prepareSignPsbt.mockImplementation(realPrepare);
      const p = await approved();
      const psbtHex = keyPathPsbtHex([bip86Script(await changeXOnlyHex())]);
      derivationMock.getExtendedPublicKey.mockImplementationOnce(async () => {
        await p.disconnect();
        return ACCOUNT_XPUB;
      });

      await expect(p.signPsbt(psbtHex, { autoFinalized: false })).rejects.toMatchObject({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
      });
      expect(signMock.signPreparedVaultPsbt).not.toHaveBeenCalled();
    });

    it("keeps tapscript PSBTs on the no-policy path (walletPolicy undefined)", async () => {
      const p = await approved();

      await p.signPsbt(PSBT_A, { autoFinalized: false });

      const [prepareArgs] = signMock.prepareSignPsbt.mock.calls.at(-1)!;
      expect(prepareArgs.walletPolicy).toBeUndefined();
    });

    it("rejects a PSBT mixing key-path and tapscript inputs before any device I/O", async () => {
      signMock.prepareSignPsbt.mockImplementation(({ psbtHex }: { psbtHex: string }) => ({
        ...fakePrepared(psbtHex),
        table: {
          byInput: new Map([
            [0, { kind: "taproot-keypath", expectedOutputKeyHex: "00".repeat(32) }],
            [
              1,
              {
                kind: "tapscript",
                expectedLeafHashHexes: new Set(["11".repeat(32)]),
                expectedSignerXOnlyHex: DEVICE_XONLY,
              },
            ],
          ]),
          expectedYieldCount: 2,
        },
      }));
      const p = await approved();

      await expect(p.signPsbt(PSBT_A, { autoFinalized: false })).rejects.toMatchObject({
        code: ERROR_CODES.INVALID_PARAMS,
      });
      expect(signMock.signPreparedVaultPsbt).not.toHaveBeenCalled();
    });

    it("still requires an approved intent for key-path PSBTs", async () => {
      const { prepareSignPsbt: realPrepare } = await actualSigner();
      signMock.prepareSignPsbt.mockImplementation(realPrepare);
      const p = await connected(); // no intent

      await expect(
        p.signPsbt(keyPathPsbtHex([bip86Script(await changeXOnlyHex())]), { autoFinalized: false }),
      ).rejects.toMatchObject({
        code: ERROR_CODES.DEVICE_CEREMONY_INVALID,
        message: expect.stringMatching(/holds no approved intent/),
      });
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

      await expect(provider.signPsbt(PSBT_A)).rejects.toMatchObject({
        code: ERROR_CODES.DEVICE_CEREMONY_INVALID,
        message: expect.stringMatching(/no longer holds the approved intent/),
      });
      await expect(provider.signPsbt(PSBT_A)).rejects.toMatchObject({
        code: ERROR_CODES.DEVICE_CEREMONY_INVALID,
        message: expect.stringMatching(/no approved intent/),
      });

      await provider.deriveContextHash("app", "aa".repeat(32));
      await provider.approveDepositTerms(TERMS);
      await expect(provider.signPsbt(PSBT_A)).resolves.toBe(`signed:${PSBT_A}`);
    });

    it("an aborted sign classifies as the user's cancel and forces the full re-ceremony", async () => {
      // Keep-intent retries risk SW_CAP_EXCEEDED (caps commit pre-yield):
      // the mirror drops and only a re-ceremony recovers.
      const provider = await approved();
      signMock.signPreparedVaultPsbt.mockRejectedValueOnce(new LedgerSignPsbtAbortedError(0));

      await expect(provider.signPsbt(PSBT_A)).rejects.toMatchObject({ code: ERROR_CODES.CONNECTION_REJECTED });
      await expect(provider.signPsbt(PSBT_A)).rejects.toMatchObject({ code: ERROR_CODES.DEVICE_CEREMONY_INVALID });

      await provider.deriveContextHash("app", "aa".repeat(32));
      await provider.approveDepositTerms(TERMS);
      await expect(provider.signPsbt(PSBT_A)).resolves.toBe(`signed:${PSBT_A}`);
    });

    it("cancelSigning between batch elements stops the batch as a cancellation", async () => {
      // The between-elements window has its own abort check; a same-generation
      // abort there must classify as the user's cancel, mirror idle.
      const provider = await approved();
      signMock.signPreparedVaultPsbt.mockImplementationOnce(async (_send, prepared: { originalPsbtHex: string }) => {
        provider.cancelSigning();
        return { signedPsbtHex: `signed:${prepared.originalPsbtHex}`, yields: [] };
      });

      await expect(provider.signPsbts([PSBT_A, PSBT_B])).rejects.toMatchObject({
        code: ERROR_CODES.CONNECTION_REJECTED,
        message: expect.stringMatching(/after 1 of 2/),
      });
      await expect(provider.signPsbt(PSBT_A)).rejects.toMatchObject({
        code: ERROR_CODES.DEVICE_CEREMONY_INVALID,
      });
    });

    it("a pre-send abort takes the same cancel classification and reset", async () => {
      const provider = await approved();
      signMock.signPreparedVaultPsbt.mockRejectedValueOnce(new LedgerSignPsbtAbortedError(0));

      await expect(provider.signPsbt(PSBT_A)).rejects.toMatchObject({ code: ERROR_CODES.CONNECTION_REJECTED });
      await expect(provider.signPsbt(PSBT_A)).rejects.toMatchObject({ code: ERROR_CODES.DEVICE_CEREMONY_INVALID });
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
      signMock.prepareSignPsbt.mockImplementationOnce(() => fakePrepared(PSBT_B, `txid-${PSBT_A}`));

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
            opts.signal.addEventListener("abort", () => reject(new LedgerSignPsbtAbortedError(0)));
          }),
      );
    }

    it("cancelSigning settles the in-flight ceremony as a user cancellation and drops the mirror", async () => {
      // No teardown → classifies as the user's act, not a disconnect; caps may
      // be consumed pre-yield, so retry must re-run the full ceremony.
      const provider = await approved();
      hangUntilAborted();
      const inFlight = provider.signPsbt(PSBT_A);
      inFlight.catch(() => {});
      await vi.waitFor(() => expect(signMock.signPreparedVaultPsbt).toHaveBeenCalledTimes(1));

      provider.cancelSigning();

      await expect(inFlight).rejects.toMatchObject({
        code: ERROR_CODES.CONNECTION_REJECTED,
        message: expect.stringMatching(/canceled/i),
      });
      await expect(provider.signPsbt(PSBT_A)).rejects.toMatchObject({
        code: ERROR_CODES.DEVICE_CEREMONY_INVALID,
        message: expect.stringMatching(/no approved intent/),
      });
    });

    it("cancelSigning with nothing in flight is a no-op and keeps the loaded intent", async () => {
      const provider = await approved();

      expect(() => provider.cancelSigning()).not.toThrow();

      await expect(provider.signPsbt(PSBT_A)).resolves.toBe(`signed:${PSBT_A}`);
    });

    it("cancelSigning during the PoP also drops the mirror — uniform conservative policy", async () => {
      // An interrupted dispatcher is tx-type-agnostic; PoP takes the same reset.
      const provider = await approved();
      hangUntilAborted();
      const pop = provider.signMessage("hello", "bip322-simple");
      pop.catch(() => {});
      await vi.waitFor(() => expect(signMock.signPreparedVaultPsbt).toHaveBeenCalledTimes(1));

      provider.cancelSigning();

      await expect(pop).rejects.toMatchObject({
        code: ERROR_CODES.CONNECTION_REJECTED,
        message: expect.stringMatching(/canceled/i),
      });
      await expect(provider.signPsbt(PSBT_A)).rejects.toMatchObject({
        code: ERROR_CODES.DEVICE_CEREMONY_INVALID,
        message: expect.stringMatching(/no approved intent/),
      });
    });

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

    it("a fresh approval resets the replay guard — the device counters were reset too", async () => {
      const provider = await approved();
      await provider.signPsbt(PSBT_A);

      await provider.deriveContextHash("app", "aa".repeat(32));
      await provider.approveDepositTerms(TERMS);

      await expect(provider.signPsbt(PSBT_A)).resolves.toBe(`signed:${PSBT_A}`);
    });
  });

  describe("getChangeAddress", () => {
    it("returns the P2TR address of m/86'/coin'/0'/1/0 derived from the device's account xpub", async () => {
      const p = await connected();

      await expect(p.getChangeAddress()).resolves.toBe(getTaprootAddress(await changeXOnlyHex(), Network.SIGNET));
      expect(derivationMock.getMasterFingerprintHex).toHaveBeenCalledTimes(1); // shares the PolicyContext cache
    });

    it("refuses before connecting", async () => {
      const p = new LedgerVaultProvider(Network.SIGNET);

      await expect(p.getChangeAddress()).rejects.toMatchObject({ code: ERROR_CODES.WALLET_NOT_CONNECTED });
    });

    it("refuses a device whose account xpub does not derive the depositor key", async () => {
      // Two independent reads. If they disagree the wallet policy would bind a
      // different key than the intent, and the device would answer an opaque
      // 0x6A80 only after the user had approved.
      const p = await connected();
      // try/finally, not a trailing restore: beforeEach only mockClear()s, so a
      // failed assertion would leak this key into every later test.
      derivationMock.getXOnlyPublicKeyHex.mockResolvedValue(VECTOR_XONLY);
      try {
        await expect(p.getChangeAddress()).rejects.toMatchObject({
          code: ERROR_CODES.CONNECTION_FAILED,
        });
      } finally {
        derivationMock.getXOnlyPublicKeyHex.mockResolvedValue(DEVICE_XONLY);
      }
    });

    it("refuses an xpub read that resolved after a disconnect", async () => {
      // Returning the previous device's address would route Pre-PegIn change
      // to a key the reconnected wallet cannot spend.
      const p = await connected();
      let releaseXpub: (xpub: string) => void = () => {};
      derivationMock.getExtendedPublicKey.mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            releaseXpub = resolve;
          }),
      );

      const pending = p.getChangeAddress();
      await p.disconnect();
      releaseXpub(ACCOUNT_XPUB);

      await expect(pending).rejects.toMatchObject({ code: ERROR_CODES.WALLET_NOT_CONNECTED });
    });
  });

  it("runs the envelope gate before any device I/O", async () => {
    // An out-of-envelope intent dies on-device with an opaque status word
    // and a nullified session. Nothing may reach the device.
    const provider = await derived();
    h.sent.length = 0;

    await expect(provider.approveDepositTerms({ ...TERMS, protocolFeeRate: 0n })).rejects.toThrow(/protocolFeeRate/);
    expect(h.sent).toHaveLength(0);
  });

  it("classifies both approve-time state conflicts as DEVICE_CEREMONY_INVALID", async () => {
    // The UX routes restart-from-derivation on this code, not on message text.
    const loaded = await derived();
    await loaded.approveDepositTerms(TERMS);
    await expect(loaded.approveDepositTerms({ ...TERMS, prepeginTxid: "2".repeat(64) })).rejects.toMatchObject({
      code: ERROR_CODES.DEVICE_CEREMONY_INVALID,
      message: expect.stringMatching(/different approved intent/),
    });

    const idle = await connected(); // connected, never derived
    await expect(idle.approveDepositTerms(TERMS)).rejects.toMatchObject({
      code: ERROR_CODES.DEVICE_CEREMONY_INVALID,
      message: expect.stringMatching(/no freshly derived context root/),
    });
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
    // DEVICE_XONLY is the device pubkey; the firmware rejects this only after
    // the whole ceremony, so the provider pre-empts it as a shaped error before
    // any approval APDU (approveApdus is empty).
    const provider = await derived();
    h.sent.length = 0;

    await expect(
      provider.approveDepositTerms({ ...TERMS, vaultKeeperBtcPubkeys: [DEVICE_XONLY] }),
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

  describe("holdsApprovedDepositTerms", () => {
    it("is false before any approval and true after approving the byte-equal terms", async () => {
      const provider = await derived();
      await expect(provider.holdsApprovedDepositTerms(TERMS)).resolves.toBe(false);

      await provider.approveDepositTerms(TERMS);
      h.sent.length = 0;

      await expect(provider.holdsApprovedDepositTerms(TERMS)).resolves.toBe(true);
      // Mirror read only — the probe must not touch the device.
      expect(h.sent).toHaveLength(0);
    });

    it("is false for terms that differ from the approved intent", async () => {
      const provider = await derived();
      await provider.approveDepositTerms(TERMS);

      await expect(
        provider.holdsApprovedDepositTerms({
          ...TERMS,
          vaults: [{ ...TERMS.vaults[0], peginAmount: TERMS.vaults[0].peginAmount + 1n }],
        }),
      ).resolves.toBe(false);
    });

    it("is false after a later derive wipes the loaded intent", async () => {
      const provider = await derived();
      await provider.approveDepositTerms(TERMS);
      await provider.deriveContextHash("app", "bb".repeat(32));

      await expect(provider.holdsApprovedDepositTerms(TERMS)).resolves.toBe(false);
    });

    it("returns false instead of throwing for unencodable terms", async () => {
      const provider = await derived();
      await provider.approveDepositTerms(TERMS);

      await expect(provider.holdsApprovedDepositTerms({ ...TERMS, prepeginTxid: "nothex" })).resolves.toBe(false);
    });

    it("is false after disconnect tears the mirror down", async () => {
      const provider = await derived();
      await provider.approveDepositTerms(TERMS);
      await provider.disconnect();

      await expect(provider.holdsApprovedDepositTerms(TERMS)).resolves.toBe(false);
    });

    it("is false for terms differing only in vaultCoreVersion", async () => {
      // vaultCoreVersion is envelope-gated but never reaches the intent wire
      // bytes, so a fingerprint over the wire alone would compare equal here.
      const provider = await derived();
      await provider.approveDepositTerms(TERMS);

      await expect(
        provider.holdsApprovedDepositTerms({ ...TERMS, vaultCoreVersion: TERMS.vaultCoreVersion + 1 }),
      ).resolves.toBe(false);
    });

    it("is false once the terms' Pre-PegIn was signed, so a broadcast retry re-ceremonies", async () => {
      // A true here would trap the retry in the replay throw forever.
      const provider = await derived();
      await provider.approveDepositTerms(TERMS);
      const psbt = "aa".repeat(40);
      signMock.prepareSignPsbt.mockImplementationOnce(() => fakePrepared(psbt, TERMS.prepeginTxid));
      await provider.signPsbt(psbt);

      await expect(provider.holdsApprovedDepositTerms(TERMS)).resolves.toBe(false);
    });

    it("stays true after signing a different tx (the PegIn PSBTs preparePegin signs)", async () => {
      // PegIn signatures spend a separate device counter — must not kill the fast path.
      const provider = await derived();
      await provider.approveDepositTerms(TERMS);
      await provider.signPsbt("aa".repeat(40));

      await expect(provider.holdsApprovedDepositTerms(TERMS)).resolves.toBe(true);
    });

    it("is false after a sign failure drops the mirror", async () => {
      const provider = await derived();
      await provider.approveDepositTerms(TERMS);
      signMock.signPreparedVaultPsbt.mockRejectedValueOnce(new LedgerDeviceError(0xb007, "SW_BAD_STATE"));
      await expect(provider.signPsbt("aa".repeat(40))).rejects.toThrow(/no longer holds the approved intent/);

      await expect(provider.holdsApprovedDepositTerms(TERMS)).resolves.toBe(false);
    });

    it("stays true across a PoP signature — the intended fast path", async () => {
      // PoP is state-independent on-device; it must not consume the probe.
      const provider = await derived();
      await provider.approveDepositTerms(TERMS);
      signMock.signPreparedVaultPsbt.mockImplementationOnce(async () => ({
        signedPsbtHex: "unused",
        yields: [
          {
            kind: "taproot-keypath",
            inputIndex: 0,
            outputKeyHex: "00".repeat(32),
            signature: Buffer.from("ab".repeat(64), "hex"),
          },
        ],
      }));
      await provider.signMessage(
        "0xabcdef1234567890abcdef1234567890abcdef12:11155111:pegin:0x1234567890abcdef1234567890abcdef12345678",
        "bip322-simple",
      );

      await expect(provider.holdsApprovedDepositTerms(TERMS)).resolves.toBe(true);
    });

    it("stays true through the full fresh-flow sequence: approve, batch PegIn signs, PoP", async () => {
      const provider = await derived();
      await provider.approveDepositTerms(TERMS);
      await provider.signPsbts(["aa".repeat(40), "bb".repeat(40)]);
      signMock.signPreparedVaultPsbt.mockImplementationOnce(async () => ({
        signedPsbtHex: "unused",
        yields: [
          {
            kind: "taproot-keypath",
            inputIndex: 0,
            outputKeyHex: "00".repeat(32),
            signature: Buffer.from("ab".repeat(64), "hex"),
          },
        ],
      }));
      await provider.signMessage(
        "0xabcdef1234567890abcdef1234567890abcdef12:11155111:pegin:0x1234567890abcdef1234567890abcdef12345678",
        "bip322-simple",
      );

      await expect(provider.holdsApprovedDepositTerms(TERMS)).resolves.toBe(true);
    });
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
    ["a locked device", new LedgerDeviceLockedError(0x5515), ERROR_CODES.DEVICE_LOCKED],
    [
      "the wrong running app",
      new LedgerDeviceError(0x6e00, "The running app does not handle vault instructions — open the Babylon Vault app"),
      ERROR_CODES.DEVICE_WRONG_APP,
    ],
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
