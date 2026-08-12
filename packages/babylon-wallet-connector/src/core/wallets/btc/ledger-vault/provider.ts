import {
  approveVaultIntent,
  assertDepositTermsDeviceCompatible,
  connectDmkSession,
  createDmkApduSender,
  DepositTermsRejectedError,
  deriveContextHash,
  disconnectDmkSession,
  encodeIntentGroup,
  encodeIntentScalars,
  encodeKeyBatches,
  getXOnlyPublicKeyHex,
  isLedgerDeviceError,
  isLedgerDeviceLockedError,
  isLedgerUserRefusedError,
  isSessionAlive,
  type ApduSender,
  type DepositTerms,
  type DmkSessionHandle,
  type IntentScalars,
  type IntentVaultGroup,
} from "@babylonlabs-io/ledger-vault-signer";

import type { IBTCProvider, InscriptionIdentifier } from "@/core/types";
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

/**
 * Ledger's dedicated vault app over the DMK. Distinct from the legacy
 * `ledger_btc*` staking adapters: different device app, different transport,
 * intent ceremony instead of wallet policies.
 *
 * Ships behind `NEXT_PUBLIC_FF_ENABLE_LEDGER_VAULT_WALLET` (default off).
 * Covers connect, the key read, and the intent ceremony; signing needs the
 * host-side SIGN_PSBT client (#2219) — the published Bitcoin signer kit
 * cannot express the vault's no-policy flows.
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

  constructor(private readonly network: Network = Network.MAINNET) {}

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
      message:
        `${WALLET_PROVIDER_NAME} does not implement ${method} yet. This build ` +
        `covers connect and the intent ceremony only; SIGN_PSBT for the ` +
        `vault's no-policy flows is not implemented (#2219).`,
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
    this.connectionGeneration += 1;
    // Next connect may be a different device: reset state and the pubkey cache.
    this.deviceState = { phase: "idle" };
    this.pubkeyHexPromise = undefined;
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
  deriveContextHash = async (appName: string, context: string): Promise<string> => {
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
    // the call so host and device stay in lockstep if it fails partway.
    this.deviceState = { phase: "idle" };

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
  approveDepositTerms = async (terms: DepositTerms): Promise<void> => {
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

  // TODO(#2219): implement via the SIGN_PSBT host protocol; signPsbts becomes
  // a sequential loop. The input is named in the error so logs identify the caller.
  signPsbt = async (psbtHex: string): Promise<string> => this.notWired(`signPsbt (${psbtHex.length / 2} bytes)`);

  signPsbts = async (psbtsHexes: string[]): Promise<string[]> =>
    this.notWired(`signPsbts (${psbtsHexes.length} psbt(s))`);

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
 * pass through unchanged. Anything unrecognised propagates untouched.
 */
function withWalletErrorMapping(send: ApduSender): ApduSender {
  return async (apdu) => {
    try {
      return await send(apdu);
    } catch (error) {
      if (isLedgerUserRefusedError(error)) {
        throw new WalletError(
          { code: ERROR_CODES.CONNECTION_REJECTED, message: error.message, wallet: WALLET_PROVIDER_NAME },
          { cause: error },
        );
      }
      if (isLedgerDeviceLockedError(error)) {
        throw new WalletError(
          { code: ERROR_CODES.CONNECTION_FAILED, message: error.message, wallet: WALLET_PROVIDER_NAME },
          { cause: error },
        );
      }
      if (isLedgerDeviceError(error)) {
        throw new WalletError(
          { code: ERROR_CODES.UNKNOWN_ERROR, message: error.message, wallet: WALLET_PROVIDER_NAME },
          { cause: error },
        );
      }
      // DMK transport/session errors do not extend Error (plain {_tag,
      // originalError}); without this a mid-ceremony unplug propagates as a
      // raw object — instanceof Error misses, String(err) is "[object Object]".
      const dmk = error as { _tag?: string; originalError?: { message?: string } } | undefined;
      if (dmk?._tag) {
        throw new WalletError(
          {
            code: ERROR_CODES.CONNECTION_FAILED,
            message: dmk.originalError?.message ?? dmk._tag,
            wallet: WALLET_PROVIDER_NAME,
          },
          { cause: error as Error },
        );
      }
      throw error;
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
