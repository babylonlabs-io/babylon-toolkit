import type { IBTCProvider, InscriptionIdentifier } from "@/core/types";
import { Network } from "@/core/types";
import { getTaprootAddress, toNetwork } from "@/core/utils/wallet";
import { ERROR_CODES, WalletError } from "@/error";

import { getXOnlyPublicKeyHex } from "./derivation";
import { createDmkApduSender } from "./dmkApduSender";
import { connectDmkSession, disconnectDmkSession, isSessionAlive, type DmkSessionHandle } from "./dmkSession";
import { assertDepositTermsDeviceCompatible } from "./envelope";
import {
  encodeIntentGroup,
  encodeIntentScalars,
  encodeKeyBatches,
  type IntentScalars,
  type IntentVaultGroup,
} from "./intentTlv";
import logo from "./logo.svg";
import { DepositTermsRejectedError, type DepositTerms } from "./types";
import { approveVaultIntent, deriveContextHash, type ApduSender } from "./vaultCommands";

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
    // Idempotent while the session lives: visibility checks re-call this
    // outside a user gesture, where WebHID's requestDevice rejects — tearing
    // down a healthy session would turn an alt-tab into a forced disconnect.
    if (this.session && (await isSessionAlive(this.session))) return;

    // Release the dead session first — a stale sessionId can never be revived.
    if (this.session) await this.disconnect();

    try {
      this.session = await connectDmkSession();
      this.send = createDmkApduSender(this.session);
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
    if (this.session) await disconnectDmkSession(this.session);
    this.session = undefined;
    this.send = undefined;
    // Next connect may be a different device: reset state and the pubkey cache.
    this.deviceState = { phase: "idle" };
    this.pubkeyHexPromise = undefined;
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

    const root = await deriveContextHash(this.requireSender(), {
      appName,
      derivationPath: this.depositorPath,
      context: Uint8Array.from(Buffer.from(context, "hex")),
    });
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

    const send = this.requireSender();
    // Fail actionably now rather than with an opaque status word mid-ceremony.
    if (!(await isSessionAlive(this.requireSession()))) {
      throw new WalletError({
        code: ERROR_CODES.WALLET_NOT_CONNECTED,
        message: `${WALLET_PROVIDER_NAME} was disconnected; reconnect the device and retry.`,
        wallet: WALLET_PROVIDER_NAME,
      });
    }
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
    this.deviceState = { phase: "intent-loaded", termsKey: key };
  };

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

function hexToXOnly(hex: string, label: string): Uint8Array {
  const clean = hex.replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) {
    throw new DepositTermsRejectedError(`${label} must be a 32-byte x-only key, got "${hex}"`);
  }
  return Uint8Array.from(Buffer.from(clean, "hex"));
}
