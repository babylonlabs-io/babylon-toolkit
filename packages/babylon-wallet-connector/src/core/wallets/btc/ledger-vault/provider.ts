/**
 * Ledger Vault adapter over `@babylonlabs-io/ledger-vault-signer`.
 *
 * Citation legend — `base:` = LedgerHQ/app-bitcoin `baseapp` @ `e400d8d8` (the
 * vault app's submodule pin, paths under `src/`); `sdk:` = LedgerHQ/ledger-secure-sdk
 * @ `v26.6.0` — the SDK the app's CI image compiles in (`ledger-app-builder-lite:latest`,
 * `lite/Dockerfile:3-7` @ 786151a7f; run 32839601193 for eacb873b6); unprefixed `.c`
 * paths are LedgerHQ/app-babylon-vault @ `eacb873b6`.
 */

import {
  approveVaultIntent,
  assertDepositTermsDeviceCompatible,
  augmentPsbtForWalletPolicy,
  buildDefaultTaprootPolicy,
  buildPopPsbtHex,
  connectDmkSession,
  createDmkApduSender,
  createDmkRawApduSender,
  DepositTermsRejectedError,
  deriveChangeXOnlyHex,
  deriveContextHash,
  deriveReceiveXOnlyHex,
  disconnectDmkSession,
  encodeIntentGroup,
  encodeIntentScalars,
  encodeKeyBatches,
  getExtendedPublicKey,
  getMasterFingerprintHex,
  getXOnlyPublicKeyHex,
  isLedgerDeviceError,
  isLedgerDeviceLockedError,
  isLedgerSignPsbtAbortedError,
  isLedgerSignPsbtIncompleteError,
  isLedgerSignPsbtProtocolError,
  isLedgerUserRefusedError,
  isLedgerYieldMismatchError,
  isSessionAlive,
  prepareSignPsbt,
  psbtPaysChangeScript,
  signPreparedVaultPsbt,
  SW_BAD_STATE,
  SW_CAP_EXCEEDED,
  SW_CLA_NOT_SUPPORTED,
  type ApduSender,
  type DefaultTaprootWalletPolicy,
  type DepositTerms,
  type DmkSessionHandle,
  type IntentScalars,
  type IntentVaultGroup,
  type PreparedSignPsbt,
  type RawApduSender,
  type SignVaultPsbtResult,
} from "@babylonlabs-io/ledger-vault-signer";

import type { IBTCProvider, InscriptionIdentifier, SignPsbtOptions } from "@/core/types";
import { Network } from "@/core/types";
import { getTaprootAddress, toNetwork } from "@/core/utils/wallet";
import { ERROR_CODES, WalletError } from "@/error";

import logo from "./logo.svg";

export const WALLET_PROVIDER_NAME = "Ledger Vault";

/**
 * BIP-86 path for the depositor key. The intent requires exactly 5 levels
 * (`vault_tlv.c` VAULT_DEPOSITOR_PATH_LEN) and the device rebuilds every
 * script from this one key — vault deposits are effectively single-address.
 */
const BIP86_PURPOSE = 86;
const COIN_TYPE_BY_NETWORK: Record<Network, number> = {
  [Network.MAINNET]: 0,
  [Network.TESTNET]: 1,
  [Network.SIGNET]: 1,
};
const ACCOUNT_INDEX = 0;
const CHANGE_INDEX = 0;
const ADDRESS_INDEX = 0;
const FIRST_CHANGE_INDEX = 0;
const HARDENED = 0x80000000;

/** BIP-322 simple P2TR witness: one item — `varint(1) ‖ varint(64) ‖ sig` (`message.rs:105-144`, `BTCProofOfPossession.sol` accepts exactly this 66-byte shape). */
const BIP322_P2TR_WITNESS_PREFIX_HEX = "0140";
const SCHNORR_SIG_BYTES = 64;

/**
 * Mirror of the device's vault state machine (`vault_context.h`: IDLE →
 * HASH_DERIVED → INTENT_LOADED). HASH_DERIVED is single-use — every ceremony
 * consumes it; failures invalidate to IDLE (`approve_vault_intent.c`). The
 * mirror pre-empts opaque SW_BAD_STATE with an actionable error.
 */
type DeviceIntentState = { phase: "idle" } | { phase: "derived" } | { phase: "intent-loaded"; termsKey: string };

/** Batch-level gate output, shared by every element of one public sign call. */
interface SignContext {
  readonly session: DmkSessionHandle;
  readonly rawSend: RawApduSender;
  readonly generation: number;
  readonly depositorXOnlyHex: string;
}

/** Device reads behind the default policy; cached per connection, cleared in teardownSession. */
interface PolicyContext {
  readonly policy: DefaultTaprootWalletPolicy;
  readonly masterFingerprintHex: string;
  /** Verbatim base58 account xpub — Part B derives the change key from it. */
  readonly accountXpub: string;
}

/** One host-gated PSBT, ready for its device ceremony. */
interface StagedPsbt {
  readonly prepared: PreparedSignPsbt;
  readonly fingerprintKey: string;
  readonly label: string;
}

/**
 * Request identity for the replay guard: unsigned txid + the expectation pairs.
 * Keyed on the UNNARROWED classification — identity is a property of the PSBT,
 * so re-submitting the same one with different `signInputs` cannot mint a new key.
 */
function signingRequestKey(prepared: PreparedSignPsbt): string {
  const pairs = [...prepared.table.classifiedByInput.entries()]
    .map(([inputIndex, expectation]) =>
      expectation.kind === "tapscript"
        ? [...expectation.expectedLeafHashHexes]
            .sort()
            .map((leaf) => `${inputIndex}:${leaf}`)
            .join(",")
        : `${inputIndex}:keypath`,
    )
    .sort()
    .join("|");
  return `${prepared.unsignedTxid}|${pairs}`;
}

/**
 * Ledger's dedicated vault app over the DMK. Distinct from the legacy
 * `ledger_btc*` staking adapters: different device app, different transport,
 * intent ceremony instead of wallet policies.
 *
 * Consumers gate availability by wallet id (see `./index.ts`).
 * Covers connect, the key read, the intent ceremony, SIGN_PSBT for the
 * no-policy tapscript flows (#2219), the BIP-322 PoP under the default wallet
 * policy (#2221), and key-path Pre-PegIn signing under that same policy (#2222).
 */
export class LedgerVaultProvider implements IBTCProvider {
  private session: DmkSessionHandle | undefined;
  private send: ApduSender | undefined;
  /** See {@link DeviceIntentState}. Updated pessimistically around device I/O. */
  private deviceState: DeviceIntentState = { phase: "idle" };
  /**
   * Single in-flight pubkey read per connection — `Wallet.connect()` calls
   * `getAddress()` and `getPublicKeyHex()` concurrently and both resolve from
   * this one device read.
   */
  private pubkeyHexPromise: Promise<string> | undefined;
  /** See {@link PolicyContext}. Single in-flight read per connection, like {@link pubkeyHexPromise}. */
  private policyContextPromise: Promise<PolicyContext> | undefined;
  /**
   * In-flight connect, so two overlapping `connectWallet()` calls (a
   * double-click) share one session instead of opening — and leaking — a
   * second HID connection.
   */
  private connectPromise: Promise<void> | undefined;
  /**
   * Bumped on every session teardown and every successful connect. A ceremony
   * captures it before its device await and refuses to commit host state if
   * the connection changed underneath it (disconnect/reconnect racing a late
   * APDU resolution).
   */
  private connectionGeneration = 0;
  /**
   * Bumped ONLY by the public {@link disconnect} — a user cancellation. An
   * in-flight connect captures it and aborts if it changes, so a disconnect
   * racing the connect can't leave a live session behind a disconnected
   * wallet. Distinct from {@link connectionGeneration}, which the provider's
   * own dead-session cleanup also bumps (that is not a cancellation).
   */
  private disconnectToken = 0;
  /** Non-throwing sender for the SIGN_PSBT loop; recreated per session like {@link send}. */
  private rawSend: RawApduSender | undefined;
  /** Request-identity keys ({@link signingRequestKey}) signed under the CURRENT loaded intent. */
  private signedFingerprints = new Set<string>();
  /**
   * ONE in-flight device ceremony (derive/approve/sign) at a time — a
   * concurrent APDU would be eaten with 0x6A80 and desync the interrupt loop.
   * Token-scoped: teardown clears it SYNCHRONOUSLY so a new connection can
   * operate while a stale call is still settling; that call's finally
   * releases only its own token.
   */
  private activeOperation: symbol | undefined;
  /** Abort handle into the in-flight signing loop; fired by teardown (B3's only abort source). */
  private signAbortController: AbortController | undefined;

  constructor(private readonly network: Network = Network.MAINNET) {}

  /**
   * See {@link activeOperation}. The busy throw costs zero device I/O; it
   * fires only on a caller bug (two overlapping ceremonies).
   */
  private async withDeviceOperation<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    if (this.activeOperation) {
      throw new WalletError({
        code: ERROR_CODES.INVALID_PARAMS,
        message: `${WALLET_PROVIDER_NAME} is already running a device ceremony; wait for it to finish before calling ${operation}.`,
        wallet: WALLET_PROVIDER_NAME,
      });
    }
    const token = Symbol(operation);
    this.activeOperation = token;
    try {
      return await fn();
    } finally {
      if (this.activeOperation === token) this.activeOperation = undefined;
    }
  }

  private get depositorPath(): number[] {
    return [
      BIP86_PURPOSE + HARDENED,
      COIN_TYPE_BY_NETWORK[this.network] + HARDENED,
      ACCOUNT_INDEX + HARDENED,
      CHANGE_INDEX,
      ADDRESS_INDEX,
    ];
  }

  /** `m/86'/coin'/0'` — the key-info origin of the default policy (`test_screen7_pop.py:135-142`). */
  private get accountPath(): number[] {
    return [BIP86_PURPOSE + HARDENED, COIN_TYPE_BY_NETWORK[this.network] + HARDENED, ACCOUNT_INDEX + HARDENED];
  }

  private requireSession(): DmkSessionHandle {
    if (!this.session) {
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: `${WALLET_PROVIDER_NAME} is not connected`,
        wallet: WALLET_PROVIDER_NAME,
      });
    }
    return this.session;
  }

  private requireSender(): ApduSender {
    if (!this.send) {
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: `${WALLET_PROVIDER_NAME} is not connected`,
        wallet: WALLET_PROVIDER_NAME,
      });
    }
    return this.send;
  }

  /**
   * Pair with the device over WebHID.
   *
   * MUST be called from a user gesture: WebHID is Chromium-only, needs a
   * secure context, and its picker fails silently otherwise.
   */
  connectWallet = async (): Promise<void> => {
    if (!this.connectPromise) {
      const attempt = this.doConnect().finally(() => {
        if (this.connectPromise === attempt) this.connectPromise = undefined;
      });
      this.connectPromise = attempt;
    }
    return this.connectPromise;
  };

  private doConnect = async (): Promise<void> => {
    // Capture the cancellation token before any await. A disconnect racing any
    // of the awaits below bumps it, and we abort — never installing a live
    // session behind a wallet the caller has disconnected.
    const token = this.disconnectToken;

    // Idempotent while the session lives: visibility checks re-call this
    // outside a user gesture, where WebHID's requestDevice rejects — tearing
    // down a healthy session would turn an alt-tab into a forced disconnect.
    if (this.session && (await this.probeSessionAlive(this.session))) return;
    // A disconnect during the probe means the caller no longer wants a
    // session — skip opening one at all.
    if (token !== this.disconnectToken) return;

    // Release a dead session first — a stale sessionId can never be revived.
    // This bumps connectionGeneration (not the token — it is our own cleanup).
    if (this.session) await this.teardownSession();

    try {
      const session = await connectDmkSession();
      // A disconnect racing any await up to here (the probe, teardown, or this
      // connect) bumped the token — tear the fresh session down rather than
      // installing it behind a disconnected wallet.
      if (token !== this.disconnectToken) {
        await disconnectDmkSession(session);
        return;
      }
      this.session = session;
      this.send = withWalletErrorMapping(createDmkApduSender(session));
      this.rawSend = createDmkRawApduSender(session);
      this.connectionGeneration += 1;
    } catch (error) {
      // DMK errors don't extend Error — classify on `_tag`/`originalError`.
      // A dismissed WebHID picker becomes NoAccessibleDeviceError("No selected
      // device"); genuine failures carry the DOMException in originalError.
      const dmk = error as { _tag?: string; originalError?: Error } | undefined;
      const detail = dmk?.originalError?.message ?? dmk?._tag ?? String(error);
      const dismissed = dmk?._tag === "NoAccessibleDeviceError" && dmk.originalError?.message === "No selected device";

      throw new WalletError({
        code: dismissed ? ERROR_CODES.CONNECTION_REJECTED : ERROR_CODES.CONNECTION_FAILED,
        message: `Could not connect to ${WALLET_PROVIDER_NAME}: ${detail}`,
        wallet: WALLET_PROVIDER_NAME,
      });
    }
  };

  /**
   * Release the device session; the DMK singleton stays up. `closeDmk()` here
   * would leak HID listeners — `dmk.close()` never destroys the transport, and
   * a rebuilt singleton registers a duplicate listener pair.
   */
  disconnect = async (): Promise<void> => {
    // A user cancellation: signal any in-flight connect before tearing down.
    this.disconnectToken += 1;
    await this.teardownSession();
  };

  /**
   * Clear host state and release the transport. State is invalidated
   * SYNCHRONOUSLY — before awaiting transport teardown — so a racing connect
   * or ceremony sees the disconnection immediately and never targets the
   * session being torn down. Used by both {@link disconnect} and doConnect's
   * dead-session cleanup; only the former is a user cancellation.
   */
  private teardownSession = async (): Promise<void> => {
    const session = this.session;
    this.session = undefined;
    this.send = undefined;
    this.rawSend = undefined;
    this.connectionGeneration += 1;
    // Next connect may be a different device: reset state and the pubkey cache.
    this.deviceState = { phase: "idle" };
    this.pubkeyHexPromise = undefined;
    this.policyContextPromise = undefined;
    this.signedFingerprints = new Set();
    // Release the ceremony lock and stop an in-flight signing loop NOW — the
    // stale call's finally only releases its own token, and its rejection
    // commits nothing (the generation just changed).
    this.activeOperation = undefined;
    this.signAbortController?.abort();
    this.signAbortController = undefined;
    if (session) await disconnectDmkSession(session);
  };

  /**
   * The one device read, cached per connection. A failure clears the cache
   * (identity-guarded so a stale rejection can't wipe a newer connection's).
   */
  private getDevicePubkeyHex(): Promise<string> {
    if (!this.pubkeyHexPromise) {
      const read = getXOnlyPublicKeyHex(this.requireSender(), this.depositorPath, toNetwork(this.network).bip32).catch(
        (error) => {
          if (this.pubkeyHexPromise === read) this.pubkeyHexPromise = undefined;
          throw error;
        },
      );
      this.pubkeyHexPromise = read;
    }
    return this.pubkeyHexPromise;
  }

  /**
   * Default `tr(@0/**)` policy over the device's master fingerprint and the
   * verbatim account xpub — key-path signing (PoP, Pre-PegIn) needs it.
   * Two silent reads, cached per connection; a failure clears the cache.
   */
  private getPolicyContext(): Promise<PolicyContext> {
    if (!this.policyContextPromise) {
      const send = this.requireSender();
      const generation = this.connectionGeneration;
      const read = (async (): Promise<PolicyContext> => {
        const [masterFingerprintHex, accountXpub, depositorXOnlyHex] = await Promise.all([
          getMasterFingerprintHex(send),
          getExtendedPublicKey(send, this.accountPath, toNetwork(this.network).bip32),
          this.getDevicePubkeyHex(),
        ]);
        // Before comparing: a teardown mid-read must report the disconnection,
        // not a key mismatch.
        this.assertSameConnection(generation);
        // Our two read paths must agree on the depositor key. The device does
        // byte-compare the policy xpub against its own derivation
        // (`base:policy.c:1483-1495` @ e400d8d8, via `init_global_state.c:230-236`),
        // but only at SIGN_PSBT — by then approveDepositTerms has already spent
        // the intent ceremony. This guards a host-side desync (depositorPath vs
        // accountPath, coin type, a refactor of either getter), not a device fault.
        const derivedXOnlyHex = deriveReceiveXOnlyHex(accountXpub, toNetwork(this.network).bip32, ADDRESS_INDEX);
        if (derivedXOnlyHex !== depositorXOnlyHex) {
          throw new WalletError({
            code: ERROR_CODES.CONNECTION_FAILED,
            message:
              `${WALLET_PROVIDER_NAME} account xpub does not derive the depositor key; ` +
              `the wallet policy would bind a different key than the intent.`,
            wallet: WALLET_PROVIDER_NAME,
          });
        }
        const policy = buildDefaultTaprootPolicy({
          masterFingerprintHex,
          coinType: COIN_TYPE_BY_NETWORK[this.network],
          accountIndex: ACCOUNT_INDEX,
          accountXpub,
          bip32Versions: toNetwork(this.network).bip32,
        });
        return { policy, masterFingerprintHex, accountXpub };
      })().catch((error) => {
        if (this.policyContextPromise === read) this.policyContextPromise = undefined;
        throw error;
      });
      this.policyContextPromise = read;
    }
    return this.policyContextPromise;
  }

  /**
   * Taproot address derived locally from the device-read pubkey. Safe: the
   * firmware rebuilds every script from its own seed at signing time, so a
   * lied-about address can never receive a valid vault signature.
   */
  getAddress = async (): Promise<string> => getTaprootAddress(await this.getDevicePubkeyHex(), this.network);

  /** x-only public key at the same leaf the intent pins. */
  getPublicKeyHex = async (): Promise<string> => this.getDevicePubkeyHex();

  private async getChangeXOnlyHex(): Promise<string> {
    const { accountXpub } = await this.getPolicyContext();
    return deriveChangeXOnlyHex(accountXpub, toNetwork(this.network).bip32, FIRST_CHANGE_INDEX);
  }

  /**
   * Pre-PegIn change must sit on the BIP-86 change branch: the base app marks
   * an output internal only there (`process_in_outs.c:114-117`), and
   * `_validate_prepegin` accepts change only when internal. Derived host-side
   * from the device's verbatim account xpub; the device re-derives and
   * byte-compares the script at signing time.
   */
  getChangeAddress = async (): Promise<string> =>
    this.withDeviceOperation("getChangeAddress", async () => {
      // A cached xpub read can outlive its connection; without this a
      // reconnect mid-read would hand back the previous device's address.
      const generation = this.connectionGeneration;
      const changeXOnlyHex = await this.getChangeXOnlyHex();
      this.assertSameConnection(generation);
      return getTaprootAddress(changeXOnlyHex, this.network);
    });

  /**
   * Derive the 32-byte context root, always with the approval screen — a
   * silent derivation produces a root that can never load an intent.
   */
  deriveContextHash = async (appName: string, context: string): Promise<string> =>
    this.withDeviceOperation("deriveContextHash", () => this.doDeriveContextHash(appName, context));

  private doDeriveContextHash = async (appName: string, context: string): Promise<string> => {
    // Buffer.from(str, "hex") truncates silently, so a malformed context
    // would derive a root over a SHORTER preimage — every secret wrong, with
    // nothing on the device screen to reveal it.
    if (!/^(?:[0-9a-f]{2})+$/.test(context)) {
      throw new WalletError({
        code: ERROR_CODES.INVALID_PARAMS,
        message:
          `deriveContextHash context must be even-length lowercase hex without ` +
          `a 0x prefix; got ${context.length} chars.`,
        wallet: WALLET_PROVIDER_NAME,
      });
    }

    // Deriving invalidates whatever the device held; drop to "idle" BEFORE
    // the call so host and device stay in lockstep if it fails partway. The
    // old intent's dedup state dies with it — clear the sign bookkeeping too.
    this.deviceState = { phase: "idle" };
    this.signedFingerprints = new Set();

    const generation = this.connectionGeneration;
    const root = await deriveContextHash(this.requireSender(), {
      appName,
      derivationPath: this.depositorPath,
      context: Uint8Array.from(Buffer.from(context, "hex")),
    });
    this.assertSameConnection(generation);
    this.deviceState = { phase: "derived" };
    return Buffer.from(root).toString("hex");
  };

  /**
   * DepositTermsApprover.validateDepositTerms (#2110 T4): the envelope gate
   * alone — no device I/O, no state, callable before the first approval
   * screen. The envelope never reads `prepeginTxid`, so provisional terms
   * with a placeholder txid validate correctly.
   */
  validateDepositTerms = async (terms: DepositTerms): Promise<void> => {
    assertDepositTermsDeviceCompatible(terms);
  };

  /**
   * Validate the terms against the device envelope, then run the ceremony.
   * The envelope gate runs BEFORE any device I/O — the firmware answers an
   * out-of-range intent with an opaque status word and a dead session.
   */
  approveDepositTerms = async (terms: DepositTerms): Promise<void> =>
    this.withDeviceOperation("approveDepositTerms", () => this.doApproveDepositTerms(terms));

  /**
   * DepositTermsApprover.holdsApprovedDepositTerms: mirror read, no device
   * I/O, never throws. A stale true fails closed at the signing gate.
   */
  holdsApprovedDepositTerms = async (terms: DepositTerms): Promise<boolean> => {
    const state = this.deviceState;
    if (state.phase !== "intent-loaded") return false;
    try {
      // A signed Pre-PegIn is one-shot — its retry needs a fresh ceremony, and
      // the replay guard never resets the mirror. Other txids (the PegIn PSBTs
      // preparePegin signs) spend separate device counters and stay fine.
      const prepeginTxid = terms.prepeginTxid.replace(/^0x/, "").toLowerCase();
      for (const key of this.signedFingerprints) {
        if (key.startsWith(`${prepeginTxid}|`)) return false;
      }
      return state.termsKey === this.fingerprintTerms(terms);
    } catch {
      // Never-throw seam: unencodable terms can't match an approved key; the
      // ceremony path surfaces the real error.
      return false;
    }
  };

  /** Idempotence key: wire bytes + vaultCoreVersion (the TLV never carries it). */
  private fingerprintTerms = (terms: DepositTerms): string =>
    `${terms.vaultCoreVersion}:${fingerprintIntent(this.buildIntentFromTerms(terms))}`;

  /** Pure translation of seam terms into the device intent. No I/O, no state. */
  private buildIntentFromTerms = (terms: DepositTerms) => {
    const scalars: IntentScalars = {
      coinType: COIN_TYPE_BY_NETWORK[this.network],
      baseFeeRate: terms.protocolFeeRate,
      peginCsvTimelock: terms.timelockPegin,
      payoutTimelock: terms.timelockAssert,
      prepeginTxidInternal: displayTxidToInternal(terms.prepeginTxid),
      htlcRefundTimelock: terms.timelockRefund,
      depositorPath: this.depositorPath,
      keeperCount: terms.vaultKeeperBtcPubkeys.length,
      challengerCount: terms.universalChallengerBtcPubkeys.length,
      vaultCount: terms.vaults.length,
      prepeginMaxFee: terms.prepeginMaxFee,
    };
    const groups: IntentVaultGroup[] = terms.vaults.map((vault) => ({
      htlcVout: vault.htlcVout,
      vaultProviderPubkey: hexToXOnly(vault.vaultProviderBtcPubkey, "vaultProviderBtcPubkey"),
      vaultAmount: vault.peginAmount,
      commissionFee: vault.commissionFee,
      depositorClaimValue: vault.depositorClaimValue,
      peginMaxFee: vault.peginMaxFee,
    }));
    return {
      scalars,
      groups,
      keeperPubkeys: terms.vaultKeeperBtcPubkeys.map((k) => hexToXOnly(k, "vaultKeeperBtcPubkey")),
      challengerPubkeys: terms.universalChallengerBtcPubkeys.map((k) => hexToXOnly(k, "universalChallengerBtcPubkey")),
    };
  };

  private doApproveDepositTerms = async (terms: DepositTerms): Promise<void> => {
    assertDepositTermsDeviceCompatible(terms);

    // Capture BEFORE the first await so a disconnect/reconnect during any of
    // the awaits below (liveness, pubkey read, the ceremony) is caught before
    // the stale sender is used or host state is committed.
    const generation = this.connectionGeneration;
    const send = this.requireSender();
    // Fail actionably now rather than with an opaque status word mid-ceremony.
    // A dead session means the device state is gone — tear down fully
    // (generation-guarded: a racing reconnect's fresh session must survive).
    if (!(await this.probeSessionAlive(this.requireSession()))) {
      if (generation === this.connectionGeneration) await this.teardownSession();
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: `${WALLET_PROVIDER_NAME} was disconnected; reconnect the device and retry.`,
        wallet: WALLET_PROVIDER_NAME,
      });
    }
    this.assertSameConnection(generation);

    // The device rejects any roster/VP key equal to the depositor's own key,
    // but only after the whole ceremony (approve_vault_intent_core.h). Pre-empt
    // it with the cached pubkey so it fails as a shaped rejection before I/O.
    const depositorKey = canonicalPubkey(await this.getDevicePubkeyHex());
    this.assertSameConnection(generation);
    const clashes = (k: string) => canonicalPubkey(k) === depositorKey;
    if (
      terms.vaults.some((v) => clashes(v.vaultProviderBtcPubkey)) ||
      terms.vaultKeeperBtcPubkeys.some(clashes) ||
      terms.universalChallengerBtcPubkeys.some(clashes)
    ) {
      throw new DepositTermsRejectedError(
        `A vault provider, keeper, or challenger key equals the depositor's own ` +
          `key; the device requires them to be disjoint.`,
      );
    }

    const intent = this.buildIntentFromTerms(terms);

    const key = this.fingerprintTerms(terms);

    // One ceremony per derive: a byte-equal re-approval (the SDK approves in
    // both preparePegin and runDepositorPresignFlow) must be a no-op, and
    // differing terms need a fresh derive — either would hit SW_BAD_STATE.
    if (this.deviceState.phase === "intent-loaded") {
      if (this.deviceState.termsKey === key) return;
      throw new WalletError({
        code: ERROR_CODES.DEVICE_CEREMONY_INVALID,
        message:
          `${WALLET_PROVIDER_NAME} already holds a different approved intent ` +
          `on this connection — the device admits one ceremony per ` +
          `DERIVE_CONTEXT_HASH. Restart the flow from derivation.`,
        wallet: WALLET_PROVIDER_NAME,
      });
    }
    // Approving from IDLE (no derive yet, or a failed ceremony invalidated
    // the device) would die at the first APDU with SW_BAD_STATE.
    if (this.deviceState.phase === "idle") {
      throw new WalletError({
        code: ERROR_CODES.DEVICE_CEREMONY_INVALID,
        message:
          `${WALLET_PROVIDER_NAME} has no freshly derived context root on ` +
          `this connection — the device requires DERIVE_CONTEXT_HASH before ` +
          `an intent can be approved. Restart the flow from derivation.`,
        wallet: WALLET_PROVIDER_NAME,
      });
    }

    // The ceremony consumes HASH_DERIVED either way; drop to "idle" BEFORE
    // the call so every error path stays in lockstep with the device.
    this.deviceState = { phase: "idle" };
    await approveVaultIntent(send, intent);
    this.assertSameConnection(generation);
    this.deviceState = { phase: "intent-loaded", termsKey: key };
    // A NEW ceremony ran: the device's signature counters and dedup masks are
    // fresh, so the same PSBT bytes are legitimately signable again. (The
    // byte-equal re-approval no-op above returns earlier and keeps both.)
    this.signedFingerprints = new Set();
  };

  /**
   * Refuse to commit host state if the connection changed during a device
   * await — a disconnect/reconnect racing a late APDU resolution would
   * otherwise land stale state on the new connection.
   */
  private assertSameConnection(generation: number): void {
    if (generation !== this.connectionGeneration) {
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: `${WALLET_PROVIDER_NAME} connection changed during the ceremony; restart from derivation.`,
        wallet: WALLET_PROVIDER_NAME,
      });
    }
  }

  /**
   * SIGN_PSBT under the loaded intent (#2219 B3). Tapscript PSBTs sign in
   * no-policy mode; all-key-path ones (Pre-PegIn, #2222) sign under the default
   * wallet policy after {@link augmentPsbtForWalletPolicy} adds the derivation
   * fields. Never finalizes — the SDK extracts signatures and finalizes itself.
   * Every rejection before the device loop starts leaves the mirror and the
   * loaded intent untouched.
   */
  signPsbt = async (psbtHex: string, options?: SignPsbtOptions): Promise<string> =>
    this.withDeviceOperation("signPsbt", () =>
      this.withSignAbort(async (controller) => {
        const ctx = await this.gateSignContext();
        const staged = await this.stagePsbt(psbtHex, options, "signPsbt", new Set(), ctx.depositorXOnlyHex);
        // Staging awaits the policy read; a reconnect during it would leave the
        // captured sender stale (signPsbts guards the same way per element).
        this.assertSameConnection(ctx.generation);
        return this.signStaged(staged, ctx, controller);
      }),
    );

  /**
   * Device ceremonies run strictly sequentially, array order, fail-fast — a
   * concurrent APDU would be eaten with 0x6A80 and desync the loop. The WHOLE
   * batch is staged before the first ceremony, so a host-detectable defect at
   * element k cannot burn k approvals whose signatures the fail-fast reject
   * would discard.
   */
  signPsbts = async (psbtsHexes: string[], options?: SignPsbtOptions[]): Promise<string[]> =>
    this.withDeviceOperation("signPsbts", () =>
      this.withSignAbort(async (controller) => {
        if (psbtsHexes.length === 0) {
          throw new WalletError({
            code: ERROR_CODES.PSBTS_HEXES_REQUIRED,
            message: `${WALLET_PROVIDER_NAME} signPsbts requires at least one PSBT.`,
            wallet: WALLET_PROVIDER_NAME,
          });
        }
        const ctx = await this.gateSignContext();
        const stagedKeys = new Set<string>();
        const staged: StagedPsbt[] = [];
        for (const [index, hex] of psbtsHexes.entries()) {
          const one = await this.stagePsbt(
            hex,
            options?.[index],
            `signPsbts[${index}]`,
            stagedKeys,
            ctx.depositorXOnlyHex,
          );
          stagedKeys.add(one.fingerprintKey);
          staged.push(one);
        }
        const signed: string[] = [];
        for (const one of staged) {
          // Abort between elements: same generation = user's cancelSigning,
          // changed = teardown/disconnect. In-element aborts settle in the loop.
          if (controller.signal.aborted) {
            const cancelled = ctx.generation === this.connectionGeneration;
            if (cancelled) {
              this.deviceState = { phase: "idle" };
              this.signedFingerprints = new Set();
            }
            throw new WalletError({
              code: cancelled ? ERROR_CODES.CONNECTION_REJECTED : ERROR_CODES.WALLET_NOT_CONNECTED,
              message: cancelled
                ? `Signing canceled after ${signed.length} of ${psbtsHexes.length} PSBT(s) — the ceremony restarts from the device approval screens on retry.`
                : `${WALLET_PROVIDER_NAME} stopped signing (disconnected) after ${signed.length} of ${psbtsHexes.length} PSBT(s).`,
              wallet: WALLET_PROVIDER_NAME,
            });
          }
          this.assertSameConnection(ctx.generation);
          signed.push(await this.signStaged(one, ctx, controller));
        }
        return signed;
      }),
    );

  /**
   * User cancel of the in-flight ceremony: aborts WITHOUT teardown, settling
   * as CONNECTION_REJECTED at the next exchange boundary — possibly only after
   * the user acts on the device, so callers hold a "cancel requested" state
   * until the sign promise settles. No-op when idle.
   */
  cancelSigning = (): void => {
    this.signAbortController?.abort();
  };

  /**
   * ONE AbortController per public sign call (plan D1) — it spans a whole
   * batch, so teardown's abort also stops the between-elements window.
   */
  private async withSignAbort<T>(fn: (controller: AbortController) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    this.signAbortController = controller;
    try {
      return await fn(controller);
    } finally {
      if (this.signAbortController === controller) this.signAbortController = undefined;
    }
  }

  /**
   * Batch-level gates, once per public sign call: live session, loaded
   * intent, cached depositor key. A dead session tears everything down —
   * the device state is gone with it (generation-guarded against a racing
   * reconnect's fresh state).
   *
   * `requireIntent: false` is for the state-independent PoP — every other
   * caller keeps the default.
   */
  private async gateSignContext(requireIntent = true): Promise<SignContext> {
    const { session, rawSend } = this.requireSignContext();
    const generation = this.connectionGeneration;
    if (!(await this.probeSessionAlive(session))) {
      if (generation === this.connectionGeneration) await this.teardownSession();
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: `${WALLET_PROVIDER_NAME} was disconnected; reconnect the device and restart the flow from derivation.`,
        wallet: WALLET_PROVIDER_NAME,
      });
    }
    this.assertSameConnection(generation);
    if (requireIntent && this.deviceState.phase !== "intent-loaded") {
      throw new WalletError({
        code: ERROR_CODES.DEVICE_CEREMONY_INVALID,
        message:
          `${WALLET_PROVIDER_NAME} holds no approved intent on this ` +
          `connection — signing requires DERIVE_CONTEXT_HASH and an approved ` +
          `intent first. Restart the flow from derivation.`,
        wallet: WALLET_PROVIDER_NAME,
      });
    }
    const depositorXOnlyHex = await this.getDevicePubkeyHex();
    this.assertSameConnection(generation);
    return { session, rawSend, generation, depositorXOnlyHex };
  }

  /**
   * Host-only gates for one PSBT, plus the key-path policy routing. The only
   * device reads are the cached silent ones behind {@link getPolicyContext};
   * no ceremony runs, so every throw leaves the mirror and the loaded intent
   * untouched (plan D7).
   */
  private async stagePsbt(
    psbtHex: string,
    options: SignPsbtOptions | undefined,
    label: string,
    stagedKeys: ReadonlySet<string>,
    depositorXOnlyHex: string,
  ): Promise<StagedPsbt> {
    // Never finalize, and never silently ignore a request to — the SDK
    // extracts signatures and finalizes itself.
    if (options?.autoFinalized === true) {
      throw new WalletError({
        code: ERROR_CODES.INVALID_PARAMS,
        message:
          `${WALLET_PROVIDER_NAME} never finalizes; call ${label} with ` +
          `autoFinalized: false and finalize after signature extraction.`,
        wallet: WALLET_PROVIDER_NAME,
      });
    }
    // Buffer.from(hex) truncates silently — reject malformed input loudly.
    if (!/^(?:[0-9a-fA-F]{2})+$/.test(psbtHex)) {
      throw new WalletError({
        code: ERROR_CODES.INVALID_PARAMS,
        message: `${label} needs even-length hexadecimal; got ${psbtHex.length} chars.`,
        wallet: WALLET_PROVIDER_NAME,
      });
    }
    // Carrying a leaf is not the same as being signed: since #2281 Payout input 1
    // carries the Assert payout leaf only so the device can display the terms.
    // Only the indices are honoured: `publicKey` is inert because the table pins
    // on the device-read key instead, and `useTweakedSigner` is inert because the
    // device picks tweaking from the spend type (`base:sign_input.c:430-433`).
    const signInputIndexes = options?.signInputs?.map((input) => input.index);
    let prepared: PreparedSignPsbt;
    try {
      prepared = prepareSignPsbt({ psbtHex, depositorXOnlyHex, signInputIndexes });
    } catch (error) {
      throw toStagingWalletError(error, `${label} rejected before device I/O`);
    }
    // Unnarrowed: the flow a PSBT belongs to is not something the caller's
    // requested set gets to change, or a key-path input could hide behind it.
    const kinds = new Set(Array.from(prepared.table.classifiedByInput.values(), (expectation) => expectation.kind));
    if (kinds.has("taproot-keypath")) {
      if (kinds.size > 1) {
        throw new WalletError({
          code: ERROR_CODES.INVALID_PARAMS,
          message: `${label}: a vault PSBT is either all key-path (Pre-PegIn) or all tapscript — mixed inputs are not a vault flow.`,
          wallet: WALLET_PROVIDER_NAME,
        });
      }
      // Key-path flows sign under the default wallet policy: derivation fields
      // make the inputs (and the change output) internal on-device, and the
      // policy id routes the base app into sign_internal_inputs (`sign_psbt.c:142-148`).
      const { policy } = await this.getPolicyContext();
      // Read outside the try: a disconnect here is a connection error, and
      // re-wrapping it as INVALID_PARAMS would blame the caller's PSBT.
      const changeXOnlyHex = await this.getChangeXOnlyHex();
      let augmented: string;
      try {
        augmented = augmentPsbtForWalletPolicy({
          psbtHex,
          depositorXOnlyHex,
          walletPolicy: policy,
          depositorPath: this.depositorPath,
          // A Pre-PegIn legitimately has no change (dust-revert, and the Max
          // sweep by design) — marking it only when the PSBT actually pays it.
          change: psbtPaysChangeScript(psbtHex, changeXOnlyHex) ? { addressIndex: FIRST_CHANGE_INDEX } : undefined,
        });
      } catch (error) {
        throw toStagingWalletError(error, `${label} rejected before device I/O`);
      }
      try {
        // Pass the AUGMENTED hex: the signer's merge target is whatever hex it
        // prepared, so the SDK gets the derivation fields back with the tapKeySig.
        // No signInputIndexes: it narrows tapscript only, and this path is key-path.
        prepared = prepareSignPsbt({ psbtHex: augmented, depositorXOnlyHex, walletPolicy: policy });
      } catch (error) {
        throw toStagingWalletError(error, `${label} rejected at policy-mode prepare`);
      }
    }
    // NEVER resubmit a signed request: the device dedup mask answers 0xB00A
    // and nullifies the intent — and NoPayout has NO mask, so this host guard
    // is the only defense there. Keyed on request identity (unsigned txid +
    // expectation pairs), not wire bytes — a byte-variant must not slip past.
    const fingerprintKey = signingRequestKey(prepared);
    if (stagedKeys.has(fingerprintKey)) {
      throw new WalletError({
        code: ERROR_CODES.INVALID_PARAMS,
        message: `${label}: this PSBT is duplicated within the batch — the device would sign the same request twice.`,
        wallet: WALLET_PROVIDER_NAME,
      });
    }
    if (this.signedFingerprints.has(fingerprintKey)) {
      throw new WalletError({
        code: ERROR_CODES.INVALID_PARAMS,
        message:
          `${label}: this PSBT was already signed under the loaded intent — ` +
          `re-signing it would nullify the intent on the device. Restart the ` +
          `flow from derivation to sign it again.`,
        wallet: WALLET_PROVIDER_NAME,
      });
    }
    return { prepared, fingerprintKey, label };
  }

  /**
   * One device ceremony; every failure is classified against the mirror.
   *
   * Locked-device words on the INITIAL SIGN_PSBT keep the intent because the app
   * never ran it: 0x5515 is sent only by the SDK IO layer before dispatch
   * (`sdk:io_legacy/src/os_io_legacy.c:396-406`, inside the `io_exchange` receive
   * loop `:243-245` that the base app reads from, `base:src/boilerplate/dispatcher.c:74`);
   * 0x6982 exists in the SDK only under ENABLE_ADDRESS_BOOK
   * (`sdk:Makefile.standard_app:78-82`, unset in both Makefiles) and 0x5303 is not
   * defined at all; neither the app nor `base:` ever sends any of the three
   * (`base:src/boilerplate/sw.h:16-18` is a #define + _Static_assert only). Only the
   * sign loop proves the initial APDU was the refused one (`preDispatch`); a lock on
   * a CONTINUE or any other exchange is unproven — rounds may have run, caps may be
   * committed — and takes the pessimistic reset below.
   */
  private async signStaged(staged: StagedPsbt, ctx: SignContext, controller: AbortController): Promise<string> {
    const { prepared, fingerprintKey, label } = staged;
    const { session, rawSend, generation } = ctx;
    try {
      const result = await signPreparedVaultPsbt(rawSend, prepared, {
        signal: controller.signal,
        appIdentity:
          session.appName !== undefined ? { appName: session.appName, appVersion: session.appVersion } : undefined,
      });
      this.assertSameConnection(generation);
      // Success never consumes the intent: further (different) PSBTs sign
      // under the same approval; this one never again.
      this.signedFingerprints.add(fingerprintKey);
      return result.signedPsbtHex;
    } catch (error) {
      const walletError = this.classifySignFailure(error, generation, label);
      // Mirror reset is signPsbt-only (PoP failures don't invalidate the vault
      // context); stale rejections and cancels were already handled in classify.
      // Pre-dispatch lock keeps the intent (provenance in the method doc); an
      // unproven lock is treated like any other sign failure.
      const lockedBeforeDispatch = isLedgerDeviceLockedError(error) && error.preDispatch === true;
      if (generation === this.connectionGeneration && !isLedgerSignPsbtAbortedError(error) && !lockedBeforeDispatch) {
        // Pessimistically assume the device dropped the intent (error-path
        // invalidation is mixed in firmware — never assume survival).
        this.deviceState = { phase: "idle" };
        this.signedFingerprints = new Set();
      }
      throw walletError;
    }
  }

  /**
   * Classify one device-ceremony failure, for every SIGN_PSBT caller: a
   * disconnect must surface as WALLET_NOT_CONNECTED, never as a generic
   * UNKNOWN_ERROR. Mirror resets are the caller's, except the user-cancel
   * branch, which resets here so PoP cancels take the same re-ceremony path.
   */
  private classifySignFailure(error: unknown, generation: number, label: string): WalletError {
    // A stale rejection must not touch the new connection's state.
    if (generation !== this.connectionGeneration) {
      return new WalletError(
        {
          code: ERROR_CODES.WALLET_NOT_CONNECTED,
          message: `${WALLET_PROVIDER_NAME} connection changed during signing; restart from derivation.`,
          wallet: WALLET_PROVIDER_NAME,
        },
        { cause: error instanceof Error ? error : undefined },
      );
    }
    if (isLedgerSignPsbtAbortedError(error)) {
      // Same-generation abort = user's cancelSigning; caps commit pre-yield, so
      // idle + full re-ceremony (device aftermath: LedgerSignPsbtAbortedError doc).
      this.deviceState = { phase: "idle" };
      this.signedFingerprints = new Set();
      return new WalletError(
        {
          code: ERROR_CODES.CONNECTION_REJECTED,
          message: `${label === "signPsbt" ? "" : `${label}: `}Signing canceled — the ceremony restarts from the device approval screens on retry.`,
          wallet: WALLET_PROVIDER_NAME,
        },
        { cause: error },
      );
    }
    return toSignFailureWalletError(error, label);
  }

  /**
   * Liveness probe for the ceremony gates: `isSessionAlive` rethrows DMK's
   * plain `{_tag}` objects, which would otherwise escape unmapped.
   */
  private async probeSessionAlive(session: DmkSessionHandle): Promise<boolean> {
    try {
      return await isSessionAlive(session);
    } catch (error) {
      throw toSignerWalletError(error) ?? error;
    }
  }

  /** Session + raw sender travel together (assigned/cleared as a unit in connect/teardown). */
  private requireSignContext(): { session: DmkSessionHandle; rawSend: RawApduSender } {
    const { session, rawSend } = this;
    if (!session || !rawSend) {
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: `${WALLET_PROVIDER_NAME} is not connected`,
        wallet: WALLET_PROVIDER_NAME,
      });
    }
    return { session, rawSend };
  }

  /**
   * BIP-322 simple proof of possession via SIGN_PSBT tx_version 0 (#2221).
   * State-independent on the device (`sign_psbt_validate.c:3205-3213`): no
   * approved intent is required, and signing it never touches the intent
   * mirror or the signed-fingerprint set — with ONE exception: a user cancel
   * resets both via {@link classifySignFailure}'s uniform post-cancel policy,
   * so a cancelled PoP costs a full derive + re-approve like any other cancel.
   * When an intent IS loaded the device requires the PoP key to equal the
   * intent's depositor key (`:2764-2769`) — both derive from `depositorPath`,
   * so that holds by construction.
   */
  signMessage = async (message: string, type: "bip322-simple" | "ecdsa"): Promise<string> =>
    this.withDeviceOperation("signMessage", () =>
      this.withSignAbort(async (controller) => {
        if (type !== "bip322-simple") {
          throw new WalletError({
            code: ERROR_CODES.WALLET_METHOD_NOT_SUPPORTED,
            message: `${WALLET_PROVIDER_NAME} signs BIP-322 (bip322-simple) messages only; ${type} is not supported.`,
            wallet: WALLET_PROVIDER_NAME,
          });
        }
        const ctx = await this.gateSignContext(false);
        const { policy, masterFingerprintHex } = await this.getPolicyContext();
        this.assertSameConnection(ctx.generation);
        const psbtHex = buildPopPsbtHex({
          message,
          depositorXOnlyHex: ctx.depositorXOnlyHex,
          masterFingerprintHex,
          depositorPath: this.depositorPath,
        });
        let prepared: PreparedSignPsbt;
        try {
          prepared = prepareSignPsbt({ psbtHex, depositorXOnlyHex: ctx.depositorXOnlyHex, walletPolicy: policy });
        } catch (error) {
          throw toStagingWalletError(error, "signMessage rejected before device I/O");
        }
        let result: SignVaultPsbtResult;
        try {
          result = await signPreparedVaultPsbt(ctx.rawSend, prepared, {
            signal: controller.signal,
            appIdentity:
              ctx.session.appName !== undefined
                ? { appName: ctx.session.appName, appVersion: ctx.session.appVersion }
                : undefined,
          });
        } catch (error) {
          throw this.classifySignFailure(error, ctx.generation, "signMessage");
        }
        this.assertSameConnection(ctx.generation);
        // Without a wallet policy the device answers SW_OK with NO yield
        // (`sign_custom_inputs.c:101-107`); the collector's completion check
        // already throws on that, this narrows the one yield we package.
        const [yielded] = result.yields;
        if (
          result.yields.length !== 1 ||
          yielded.kind !== "taproot-keypath" ||
          yielded.signature.length !== SCHNORR_SIG_BYTES
        ) {
          throw new WalletError({
            code: ERROR_CODES.INVALID_PARAMS,
            message: `${WALLET_PROVIDER_NAME} returned no key-path signature for the proof of possession.`,
            wallet: WALLET_PROVIDER_NAME,
          });
        }
        return `0x${BIP322_P2TR_WITNESS_PREFIX_HEX}${Buffer.from(yielded.signature).toString("hex")}`;
      }),
    );

  getNetwork = async (): Promise<Network> => this.network;

  /** Hardware wallets hold no inscription index. */
  getInscriptions = async (): Promise<InscriptionIdentifier[]> => [];

  /** A USB device has no account-switch event to subscribe to. */
  on = (): void => {};
  off = (): void => {};

  getWalletProviderName = async (): Promise<string> => WALLET_PROVIDER_NAME;

  getWalletProviderIcon = async (): Promise<string> => logo;
}

/** A staging rejection (prepare, augmentation): typed, cause preserved, no ceremony run. */
function toStagingWalletError(error: unknown, context: string): WalletError {
  return new WalletError(
    {
      code: ERROR_CODES.INVALID_PARAMS,
      message: `${context}: ${error instanceof Error ? error.message : String(error)}`,
      wallet: WALLET_PROVIDER_NAME,
    },
    { cause: error instanceof Error ? error : undefined },
  );
}

/**
 * Map the signer package's typed device outcomes onto the connector's
 * WalletError taxonomy; the messages (with their "User rejected" prefix)
 * pass through unchanged. Returns undefined for anything unrecognised.
 * Shared by the ceremony sender wrapper and the SIGN_PSBT seam — the raw
 * sender's loop errors never pass through {@link withWalletErrorMapping}.
 */
/**
 * Sign-seam failure mapping: the two "intent gone" status words and the
 * signer's own typed sign errors carry DEVICE_CEREMONY_INVALID — the typed
 * signal #2110's UX routes restart-from-derivation on (the message suffix
 * stays for humans, never for routing). Everything else reuses the shared
 * mapper. The ceremony sender keeps verbatim messages — derive/approve
 * failures are not phase-wise "restart from derivation" beyond their copy.
 */
function toSignFailureWalletError(error: unknown, label: string): WalletError {
  const prefix = label === "signPsbt" ? "" : `${label}: `;
  if (isLedgerDeviceError(error) && (error.statusWord === SW_BAD_STATE || error.statusWord === SW_CAP_EXCEEDED)) {
    return new WalletError(
      {
        code: ERROR_CODES.DEVICE_CEREMONY_INVALID,
        message: `${prefix}The device no longer holds the approved intent (${error.message}) — restart the flow from derivation.`,
        wallet: WALLET_PROVIDER_NAME,
      },
      { cause: error },
    );
  }
  if (
    isLedgerYieldMismatchError(error) ||
    isLedgerSignPsbtIncompleteError(error) ||
    isLedgerSignPsbtProtocolError(error)
  ) {
    return new WalletError(
      {
        code: ERROR_CODES.DEVICE_CEREMONY_INVALID,
        message: `${prefix}${error.message} — restart the flow from derivation.`,
        wallet: WALLET_PROVIDER_NAME,
      },
      { cause: error },
    );
  }
  const mapped = toSignerWalletError(error);
  if (mapped) {
    if (label === "signPsbt") return mapped;
    // The cast matches the mapper's own dmk branch: DMK objects don't extend Error.
    return new WalletError(
      { code: mapped.code, message: `${prefix}${mapped.message}`, wallet: WALLET_PROVIDER_NAME },
      { cause: error as Error },
    );
  }
  return new WalletError(
    {
      code: ERROR_CODES.UNKNOWN_ERROR,
      message: `${label} failed: ${error instanceof Error ? error.message : String(error)}`,
      wallet: WALLET_PROVIDER_NAME,
    },
    { cause: error instanceof Error ? error : undefined },
  );
}

function toSignerWalletError(error: unknown): WalletError | undefined {
  if (isLedgerUserRefusedError(error)) {
    return new WalletError(
      { code: ERROR_CODES.CONNECTION_REJECTED, message: error.message, wallet: WALLET_PROVIDER_NAME },
      { cause: error },
    );
  }
  if (isLedgerDeviceLockedError(error)) {
    return new WalletError(
      { code: ERROR_CODES.DEVICE_LOCKED, message: error.message, wallet: WALLET_PROVIDER_NAME },
      { cause: error },
    );
  }
  if (isLedgerDeviceError(error) && error.statusWord === SW_CLA_NOT_SUPPORTED) {
    return new WalletError(
      { code: ERROR_CODES.DEVICE_WRONG_APP, message: error.message, wallet: WALLET_PROVIDER_NAME },
      { cause: error },
    );
  }
  if (isLedgerDeviceError(error)) {
    return new WalletError(
      { code: ERROR_CODES.UNKNOWN_ERROR, message: error.message, wallet: WALLET_PROVIDER_NAME },
      { cause: error },
    );
  }
  // DMK transport/session errors do not extend Error (plain {_tag,
  // originalError}); without this a mid-ceremony unplug propagates as a
  // raw object — instanceof Error misses, String(err) is "[object Object]".
  const dmk = error as { _tag?: string; originalError?: { message?: string } } | undefined;
  if (dmk?._tag) {
    return new WalletError(
      {
        code: ERROR_CODES.CONNECTION_FAILED,
        message: dmk.originalError?.message ?? dmk._tag,
        wallet: WALLET_PROVIDER_NAME,
      },
      { cause: error as Error },
    );
  }
  return undefined;
}

function withWalletErrorMapping(send: ApduSender): ApduSender {
  return async (apdu) => {
    try {
      return await send(apdu);
    } catch (error) {
      throw toSignerWalletError(error) ?? error;
    }
  };
}

/**
 * Deterministic fingerprint over the ENCODED wire bytes, for idempotence.
 * The encoder canonicalises (rosters are sorted before the wire), so
 * identical APDUs ⇔ identical fingerprint by construction — a caller-order
 * permutation of the same roster must be a no-op, not a "different intent".
 */
function fingerprintIntent(intent: {
  scalars: IntentScalars;
  groups: IntentVaultGroup[];
  keeperPubkeys: Uint8Array[];
  challengerPubkeys: Uint8Array[];
}): string {
  const parts = [
    encodeIntentScalars(intent.scalars),
    ...intent.groups.map(encodeIntentGroup),
    ...encodeKeyBatches(intent.keeperPubkeys, intent.challengerPubkeys),
  ];
  return Buffer.concat(parts.map((p) => Buffer.from(p))).toString("hex");
}

/**
 * Convert a display-order txid (what an explorer shows) to the internal order
 * the intent carries. The device compares it against the PSBT prevout, which
 * is also internal order (`vault_script.c:711-713`, "LE as stored").
 */
function displayTxidToInternal(txidHex: string): Uint8Array {
  const clean = txidHex.replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) {
    throw new DepositTermsRejectedError(`prepeginTxid must be 64 hex chars, got "${txidHex}"`);
  }
  return Uint8Array.from(Buffer.from(clean, "hex")).reverse();
}

/** Strip 0x and lowercase, for comparing x-only keys by value. */
function canonicalPubkey(hex: string): string {
  return hex.replace(/^0x/, "").toLowerCase();
}

function hexToXOnly(hex: string, label: string): Uint8Array {
  const clean = hex.replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) {
    throw new DepositTermsRejectedError(`${label} must be a 32-byte x-only key, got "${hex}"`);
  }
  return Uint8Array.from(Buffer.from(clean, "hex"));
}
