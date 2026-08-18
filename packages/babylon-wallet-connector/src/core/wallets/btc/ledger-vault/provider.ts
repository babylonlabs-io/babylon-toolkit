import {
  approveVaultIntent,
  assertDepositTermsDeviceCompatible,
  connectDmkSession,
  createDmkApduSender,
  createDmkRawApduSender,
  DepositTermsRejectedError,
  deriveContextHash,
  disconnectDmkSession,
  encodeIntentGroup,
  encodeIntentScalars,
  encodeKeyBatches,
  getXOnlyPublicKeyHex,
  isLedgerDeviceError,
  isLedgerDeviceLockedError,
  isLedgerSignPsbtAbortedError,
  isLedgerUserRefusedError,
  isSessionAlive,
  prepareSignPsbt,
  signPreparedVaultPsbt,
  type ApduSender,
  type DepositTerms,
  type DmkSessionHandle,
  type IntentScalars,
  type IntentVaultGroup,
  type PreparedSignPsbt,
  type RawApduSender,
} from "@babylonlabs-io/ledger-vault-signer";
import { crypto as bcrypto } from "bitcoinjs-lib";

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
const HARDENED = 0x80000000;

/**
 * Mirror of the device's vault state machine (`vault_context.h`: IDLE →
 * HASH_DERIVED → INTENT_LOADED). HASH_DERIVED is single-use — every ceremony
 * consumes it; failures invalidate to IDLE (`approve_vault_intent.c`). The
 * mirror pre-empts opaque SW_BAD_STATE with an actionable error.
 */
type DeviceIntentState = { phase: "idle" } | { phase: "derived" } | { phase: "intent-loaded"; termsKey: string };

/** Device answers when the loaded intent is gone (SW_BAD_STATE) or a cap/dedup mask tripped (SW_CAP_EXCEEDED). */
const SW_BAD_STATE = 0xb007;
const SW_CAP_EXCEEDED = 0xb00a;

/**
 * Ledger's dedicated vault app over the DMK. Distinct from the legacy
 * `ledger_btc*` staking adapters: different device app, different transport,
 * intent ceremony instead of wallet policies.
 *
 * Ships behind `NEXT_PUBLIC_FF_ENABLE_LEDGER_VAULT_WALLET` (default off).
 * Covers connect, the key read, the intent ceremony, and SIGN_PSBT for the
 * no-policy tapscript flows (#2219). Key-path signing (Pre-PegIn, PoP) needs
 * the wallet-policy path (#2222/#2221).
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
  /** sha256 of each PSBT's decoded bytes signed under the CURRENT loaded intent. */
  private signedFingerprints = new Set<string>();
  /** A host abandonment interrupted the dispatcher — the next sign resends once on 0x6A80. */
  private loopAbandoned = false;
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

  private notWired(method: string): never {
    throw new WalletError({
      code: ERROR_CODES.WALLET_METHOD_NOT_SUPPORTED,
      message: `${WALLET_PROVIDER_NAME} does not implement ${method} yet.`,
      wallet: WALLET_PROVIDER_NAME,
    });
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
    if (this.session && (await isSessionAlive(this.session))) return;
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
    this.signedFingerprints = new Set();
    this.loopAbandoned = false;
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
   * Taproot address derived locally from the device-read pubkey. Safe: the
   * firmware rebuilds every script from its own seed at signing time, so a
   * lied-about address can never receive a valid vault signature.
   */
  getAddress = async (): Promise<string> => getTaprootAddress(await this.getDevicePubkeyHex(), this.network);

  /** x-only public key at the same leaf the intent pins. */
  getPublicKeyHex = async (): Promise<string> => this.getDevicePubkeyHex();

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
    this.loopAbandoned = false;

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
   * Validate the terms against the device envelope, then run the ceremony.
   * The envelope gate runs BEFORE any device I/O — the firmware answers an
   * out-of-range intent with an opaque status word and a dead session.
   */
  approveDepositTerms = async (terms: DepositTerms): Promise<void> =>
    this.withDeviceOperation("approveDepositTerms", () => this.doApproveDepositTerms(terms));

  private doApproveDepositTerms = async (terms: DepositTerms): Promise<void> => {
    assertDepositTermsDeviceCompatible(terms);

    // Capture BEFORE the first await so a disconnect/reconnect during any of
    // the awaits below (liveness, pubkey read, the ceremony) is caught before
    // the stale sender is used or host state is committed.
    const generation = this.connectionGeneration;
    const send = this.requireSender();
    // Fail actionably now rather than with an opaque status word mid-ceremony.
    if (!(await isSessionAlive(this.requireSession()))) {
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: `${WALLET_PROVIDER_NAME} was disconnected; reconnect the device and retry.`,
        wallet: WALLET_PROVIDER_NAME,
      });
    }
    this.assertSameConnection(generation);
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

    const groups: IntentVaultGroup[] = terms.vaults.map((vault) => ({
      htlcVout: vault.htlcVout,
      vaultProviderPubkey: hexToXOnly(vault.vaultProviderBtcPubkey, "vaultProviderBtcPubkey"),
      vaultAmount: vault.peginAmount,
      commissionFee: vault.commissionFee,
      depositorClaimValue: vault.depositorClaimValue,
      peginMaxFee: vault.peginMaxFee,
    }));

    const intent = {
      scalars,
      groups,
      keeperPubkeys: terms.vaultKeeperBtcPubkeys.map((k) => hexToXOnly(k, "vaultKeeperBtcPubkey")),
      challengerPubkeys: terms.universalChallengerBtcPubkeys.map((k) => hexToXOnly(k, "universalChallengerBtcPubkey")),
    };

    const key = fingerprintIntent(intent);

    // One ceremony per derive: a byte-equal re-approval (the SDK approves in
    // both preparePegin and runDepositorPresignFlow) must be a no-op, and
    // differing terms need a fresh derive — either would hit SW_BAD_STATE.
    if (this.deviceState.phase === "intent-loaded") {
      if (this.deviceState.termsKey === key) return;
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
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
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
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
    this.loopAbandoned = false;
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
   * SIGN_PSBT under the loaded intent (#2219 B3). Never finalizes — the SDK
   * extracts signatures and finalizes itself. Every rejection before the
   * device loop starts leaves the mirror and the loaded intent untouched.
   */
  signPsbt = async (psbtHex: string, options?: SignPsbtOptions): Promise<string> =>
    this.withDeviceOperation("signPsbt", () =>
      this.withSignAbort((controller) => this.signOnePsbt(psbtHex, options, controller)),
    );

  /**
   * Strictly sequential, array order, fail-fast — one interrupt loop at a
   * time; a concurrent APDU would be eaten with 0x6A80 and desync the loop.
   * A mid-batch failure rejects the whole batch (no partial results); the
   * error's mirror rule decides whether a full re-ceremony is needed.
   */
  signPsbts = async (psbtsHexes: string[], options?: SignPsbtOptions[]): Promise<string[]> =>
    this.withDeviceOperation("signPsbts", () =>
      this.withSignAbort(async (controller) => {
        const signed: string[] = [];
        for (let index = 0; index < psbtsHexes.length; index += 1) {
          // A cancel landing BETWEEN elements must stop the batch — inside an
          // element the loop's own signal checks cover it.
          if (controller.signal.aborted) {
            throw new WalletError({
              code: ERROR_CODES.WALLET_NOT_CONNECTED,
              message: `${WALLET_PROVIDER_NAME} stopped signing (disconnected) after ${index} of ${psbtsHexes.length} PSBT(s).`,
              wallet: WALLET_PROVIDER_NAME,
            });
          }
          signed.push(await this.signOnePsbt(psbtsHexes[index], options?.[index], controller, index));
        }
        return signed;
      }),
    );

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

  private async signOnePsbt(
    psbtHex: string,
    options: SignPsbtOptions | undefined,
    controller: AbortController,
    batchIndex?: number,
  ): Promise<string> {
    const label = batchIndex === undefined ? "signPsbt" : `signPsbts[${batchIndex}]`;
    const session = this.requireSession();
    const rawSend = this.requireRawSender();
    const generation = this.connectionGeneration;
    // Fail actionably now rather than with an opaque status word mid-loop. A
    // dead session means the device state is gone (unplug wipes it) — the
    // mirror and replay bookkeeping must not survive it. Generation-guarded:
    // a reconnect may already have re-established fresh state.
    if (!(await isSessionAlive(session))) {
      if (generation === this.connectionGeneration) {
        this.deviceState = { phase: "idle" };
        this.signedFingerprints = new Set();
        this.loopAbandoned = false;
      }
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: `${WALLET_PROVIDER_NAME} was disconnected; reconnect the device and restart the flow from derivation.`,
        wallet: WALLET_PROVIDER_NAME,
      });
    }
    this.assertSameConnection(generation);
    if (this.deviceState.phase !== "intent-loaded") {
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message:
          `${WALLET_PROVIDER_NAME} holds no approved intent on this ` +
          `connection — ${label} requires DERIVE_CONTEXT_HASH and an approved ` +
          `intent first. Restart the flow from derivation.`,
        wallet: WALLET_PROVIDER_NAME,
      });
    }
    // The SDK's contract is sign-then-extract-then-finalize; honoring
    // autoFinalized:true silently would hand back a different contract, and
    // silently NOT honoring it would be worse. Tweak flags are ignored: the
    // device rebuilds every script from the approved intent.
    if (options?.autoFinalized === true) {
      throw new WalletError({
        code: ERROR_CODES.INVALID_PARAMS,
        message:
          `${WALLET_PROVIDER_NAME} never finalizes; call ${label} with ` +
          `autoFinalized: false and finalize after signature extraction.`,
        wallet: WALLET_PROVIDER_NAME,
      });
    }
    // Canonical fingerprint over DECODED bytes — a case-variant hex of the
    // same PSBT must not bypass the replay guard.
    if (!/^(?:[0-9a-fA-F]{2})+$/.test(psbtHex)) {
      throw new WalletError({
        code: ERROR_CODES.INVALID_PARAMS,
        message: `${label} needs even-length hex; got ${psbtHex.length} chars.`,
        wallet: WALLET_PROVIDER_NAME,
      });
    }
    const fingerprint = bcrypto.sha256(Buffer.from(psbtHex, "hex")).toString("hex");
    // NEVER resubmit a signed PSBT: the device dedup mask answers 0xB00A and
    // nullifies the intent — and NoPayout has NO mask, so a replay there
    // silently steals quota. This host guard is the only defense for that class.
    if (this.signedFingerprints.has(fingerprint)) {
      throw new WalletError({
        code: ERROR_CODES.INVALID_PARAMS,
        message:
          `${label}: this PSBT was already signed under the loaded intent — ` +
          `re-signing it would nullify the intent on the device. Restart the ` +
          `flow from derivation to sign it again.`,
        wallet: WALLET_PROVIDER_NAME,
      });
    }

    // Stage 1 — host-only prepare: typed rejections cost zero device I/O and
    // leave the mirror and the loaded intent UNTOUCHED (plan D7).
    const depositorXOnlyHex = await this.getDevicePubkeyHex();
    this.assertSameConnection(generation);
    let prepared: PreparedSignPsbt;
    try {
      prepared = prepareSignPsbt({ psbtHex, depositorXOnlyHex });
    } catch (error) {
      throw new WalletError(
        {
          code: ERROR_CODES.INVALID_PARAMS,
          message: `${label} rejected before device I/O: ${error instanceof Error ? error.message : String(error)}`,
          wallet: WALLET_PROVIDER_NAME,
        },
        { cause: error instanceof Error ? error : undefined },
      );
    }
    // B1 signs the no-policy tapscript flows only: a keypath expectation means
    // Pre-PegIn/PoP, which need the wallet-policy path. Reject actionably here
    // instead of letting the device answer an opaque 0x6A80 mid-loop.
    for (const expectation of prepared.table.byInput.values()) {
      if (expectation.kind === "taproot-keypath") {
        throw new WalletError({
          code: ERROR_CODES.WALLET_METHOD_NOT_SUPPORTED,
          message:
            `${WALLET_PROVIDER_NAME} cannot sign key-path inputs (${label}) yet — ` +
            `Pre-PegIn and proof-of-possession need the wallet-policy path (#2222/#2221).`,
          wallet: WALLET_PROVIDER_NAME,
        });
      }
    }

    // Stage 2 — the device loop. From here every error is classified against
    // the mirror; the controller is teardown's handle into the unbounded loop.
    try {
      const result = await signPreparedVaultPsbt(rawSend, prepared, {
        signal: controller.signal,
        appIdentity:
          session.appName !== undefined ? { appName: session.appName, appVersion: session.appVersion } : undefined,
        resendOnceOnIncorrectData: this.loopAbandoned,
      });
      this.assertSameConnection(generation);
      // Success never consumes the intent: further (different) PSBTs sign
      // under the same approval; this one never again.
      this.signedFingerprints.add(fingerprint);
      this.loopAbandoned = false;
      return result.signedPsbtHex;
    } catch (error) {
      // A stale rejection must not touch the new connection's state.
      if (generation !== this.connectionGeneration) {
        throw new WalletError(
          {
            code: ERROR_CODES.WALLET_NOT_CONNECTED,
            message: `${WALLET_PROVIDER_NAME} connection changed during signing; restart from derivation.`,
            wallet: WALLET_PROVIDER_NAME,
          },
          { cause: error instanceof Error ? error : undefined },
        );
      }
      if (isLedgerSignPsbtAbortedError(error)) {
        // The intent MAY survive an abandonment (hint only) — keep the mirror.
        // Arm the one-shot 0x6A80 recovery only if a dispatcher was actually
        // interrupted; a pre-send abort left nothing to recover from. NB: in
        // B3 the only abort source is teardown, which bumps the generation
        // FIRST — so this branch goes live only when a non-teardown abort
        // source (a #2110 UI cancel) is added.
        if (error.sentInitialApdu) this.loopAbandoned = true;
        throw new WalletError(
          {
            code: ERROR_CODES.WALLET_NOT_CONNECTED,
            message: `${WALLET_PROVIDER_NAME} stopped signing (disconnected); reconnect and retry.`,
            wallet: WALLET_PROVIDER_NAME,
          },
          { cause: error },
        );
      }
      // Everything else: pessimistically assume the device dropped the intent
      // (error-path invalidation is mixed in firmware — never assume survival).
      this.deviceState = { phase: "idle" };
      this.signedFingerprints = new Set();
      this.loopAbandoned = false;
      const mapped = toSignerWalletError(error);
      if (mapped) {
        // A batch caller needs to know WHICH element failed. The cast matches
        // the mapper's own dmk branch: DMK objects don't extend Error.
        throw batchIndex === undefined
          ? mapped
          : new WalletError(
              { code: mapped.code, message: `${label}: ${mapped.message}`, wallet: WALLET_PROVIDER_NAME },
              { cause: error as Error },
            );
      }
      throw new WalletError(
        {
          code: ERROR_CODES.UNKNOWN_ERROR,
          message: `${label} failed: ${error instanceof Error ? error.message : String(error)}`,
          wallet: WALLET_PROVIDER_NAME,
        },
        { cause: error instanceof Error ? error : undefined },
      );
    }
  }

  private requireRawSender(): RawApduSender {
    if (!this.rawSend) {
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: `${WALLET_PROVIDER_NAME} is not connected`,
        wallet: WALLET_PROVIDER_NAME,
      });
    }
    return this.rawSend;
  }

  // TODO(#2221): BIP-322 PoP — a SIGN_PSBT with tx_version 0, not the base
  // app's SIGN_MESSAGE.
  signMessage = async (message: string, type: "bip322-simple" | "ecdsa"): Promise<string> =>
    this.notWired(`signMessage (${type}, ${message.length} chars)`);

  getNetwork = async (): Promise<Network> => this.network;

  /** Hardware wallets hold no inscription index. */
  getInscriptions = async (): Promise<InscriptionIdentifier[]> => [];

  /** A USB device has no account-switch event to subscribe to. */
  on = (): void => {};
  off = (): void => {};

  getWalletProviderName = async (): Promise<string> => WALLET_PROVIDER_NAME;

  getWalletProviderIcon = async (): Promise<string> => logo;
}

/**
 * Map the signer package's typed device outcomes onto the connector's
 * WalletError taxonomy; the messages (with their "User rejected" prefix)
 * pass through unchanged. Returns undefined for anything unrecognised.
 * Shared by the ceremony sender wrapper and the SIGN_PSBT seam — the raw
 * sender's loop errors never pass through {@link withWalletErrorMapping}.
 */
function toSignerWalletError(error: unknown): WalletError | undefined {
  if (isLedgerUserRefusedError(error)) {
    return new WalletError(
      { code: ERROR_CODES.CONNECTION_REJECTED, message: error.message, wallet: WALLET_PROVIDER_NAME },
      { cause: error },
    );
  }
  if (isLedgerDeviceLockedError(error)) {
    return new WalletError(
      { code: ERROR_CODES.CONNECTION_FAILED, message: error.message, wallet: WALLET_PROVIDER_NAME },
      { cause: error },
    );
  }
  if (isLedgerDeviceError(error)) {
    // A stable, distinguishable message for the two "intent gone" words —
    // #2110's UX routes these to a restart-from-derivation screen.
    const intentGone = error.statusWord === SW_BAD_STATE || error.statusWord === SW_CAP_EXCEEDED;
    return new WalletError(
      {
        code: ERROR_CODES.UNKNOWN_ERROR,
        message: intentGone
          ? `The device no longer holds the approved intent (${error.message}) — restart the flow from derivation.`
          : error.message,
        wallet: WALLET_PROVIDER_NAME,
      },
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
