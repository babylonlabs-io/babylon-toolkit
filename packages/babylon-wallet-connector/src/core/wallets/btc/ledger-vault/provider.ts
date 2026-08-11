import type { IBTCProvider, InscriptionIdentifier } from "@/core/types";
import { Network } from "@/core/types";
import { toNetwork } from "@/core/utils/wallet";
import { ERROR_CODES, WalletError } from "@/error";

import { getTaprootAddress, getXOnlyPublicKeyHex } from "./derivation";
import { createDmkApduSender } from "./dmkApduSender";
import { connectDmkSession, disconnectDmkSession, isSessionAlive, type DmkSessionHandle } from "./dmkSession";
import { assertDepositTermsDeviceCompatible } from "./envelope";
import type { IntentScalars, IntentVaultGroup } from "./intentTlv";
import { DepositTermsRejectedError, type DepositTerms } from "./types";
import { approveVaultIntent, deriveContextHash, type ApduSender } from "./vaultCommands";

export const WALLET_PROVIDER_NAME = "Ledger Vault";

/**
 * BIP-86 path for the depositor key, fixed at 5 levels.
 *
 * The intent requires exactly 5 levels (`vault_tlv.c:105-125`,
 * `VAULT_DEPOSITOR_PATH_LEN`), and the device rebuilds the depositor's P2TR
 * from the intent's key on every PSBT it validates. So the address, the
 * pubkey, the PoP key and every Pre-PegIn funding UTXO must resolve to this one
 * path: Ledger vault deposits are effectively single-address. Coin type is
 * per-network and must equal the intent's `coinType` or the device rejects.
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
 * Ledger's dedicated vault app over the Device Management Kit.
 *
 * Distinct from the legacy `ledger_btc` / `ledger_btc_v2` staking adapters in
 * every respect: a different device app, the DMK rather than `hw-transport`,
 * and an intent-approval ceremony rather than wallet policies.
 *
 * Ships behind `NEXT_PUBLIC_FF_ENABLE_LEDGER_VAULT_WALLET`, off by default,
 * while Ledger's firmware is still moving. Signing is deliberately not wired
 * yet — see {@link LedgerVaultProvider.signPsbt}.
 */
export class LedgerVaultProvider implements IBTCProvider {
  private session: DmkSessionHandle | undefined;
  private send: ApduSender | undefined;
  /** Fingerprint of the intent already approved on this connection. */
  private approvedTermsKey: string | undefined;

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
        `${WALLET_PROVIDER_NAME} does not implement ${method} yet. Signing lands ` +
        `once Ledger confirms whether their DMK signer owns SIGN_PSBT or the ` +
        `published Bitcoin signer kit drives it (#2109).`,
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
    // Reconnecting without releasing the old session leaks a DMK session and an
    // open HID handle, and the stale sessionId can never be revived.
    if (this.session) await this.disconnect();

    try {
      this.session = await connectDmkSession();
      this.send = createDmkApduSender(this.session);
    } catch (error) {
      // DMK's errors do NOT extend Error — the base class is a plain object
      // carrying `_tag` and `originalError` — so classify on those. Dismissing
      // the WebHID picker resolves with an empty device list, which DMK wraps as
      // NoAccessibleDeviceError("No selected device"); a genuine failure carries
      // the underlying DOMException in originalError instead.
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
   * Release the device session, leaving the DMK singleton up for the next
   * connect.
   *
   * Deliberately does NOT call `closeDmk()`: `dmk.close()` only closes sessions
   * (CloseSessionsUseCase never calls `transport.destroy()`), so it aborts no
   * HID listeners — while dropping the singleton makes the next connect build a
   * second transport whose constructor registers ANOTHER listener pair, leaving
   * the first registered and unreachable.
   */
  disconnect = async (): Promise<void> => {
    if (this.session) await disconnectDmkSession(this.session);
    this.session = undefined;
    this.send = undefined;
    // A new connection starts at IDLE and must re-derive and re-approve.
    this.approvedTermsKey = undefined;
  };

  /**
   * BIP-86 taproot address at the pinned leaf. Read through the published
   * Bitcoin signer kit, which drives the derivation instructions the vault app
   * inherits from the base app.
   */
  getAddress = async (): Promise<string> =>
    getTaprootAddress(this.requireSession(), COIN_TYPE_BY_NETWORK[this.network]);

  /** x-only public key at the same leaf the intent pins. */
  getPublicKeyHex = async (): Promise<string> =>
    getXOnlyPublicKeyHex(this.requireSession(), COIN_TYPE_BY_NETWORK[this.network], toNetwork(this.network).bip32);

  /**
   * Derive the 32-byte context root, showing the approval screen.
   *
   * Always derives with the screen shown: a silent derivation leaves
   * `root_user_approved` false on-device and such a root can never load an
   * intent, so the ceremony would die later with an opaque status word.
   */
  deriveContextHash = async (appName: string, context: string): Promise<string> => {
    // Validate before decoding. Buffer.from(str, "hex") truncates silently at
    // the first non-hex char and drops a trailing odd nibble, so a malformed
    // context would derive a root over a SHORTER preimage — and since the root
    // is the frozen on-chain binding, every derived secret would be wrong with
    // nothing on the device screen to reveal it. The spec requires even-length
    // lowercase hex with no 0x prefix.
    if (!/^(?:[0-9a-f]{2})+$/.test(context)) {
      throw new WalletError({
        code: ERROR_CODES.INVALID_PARAMS,
        message:
          `deriveContextHash context must be even-length lowercase hex without ` +
          `a 0x prefix; got ${context.length} chars.`,
        wallet: WALLET_PROVIDER_NAME,
      });
    }

    const root = await deriveContextHash(this.requireSender(), {
      appName,
      derivationPath: this.depositorPath,
      context: Uint8Array.from(Buffer.from(context, "hex")),
    });
    return Buffer.from(root).toString("hex");
  };

  /**
   * Validate the terms against this device's envelope, then run the intent
   * approval ceremony.
   *
   * The envelope check runs BEFORE any device I/O: the firmware answers an
   * out-of-range intent with an opaque status word and nullifies the session,
   * so failing early is the difference between an actionable error and a dead
   * ceremony. This is the provider obligation the SDK's `DepositTermsApprover`
   * documents.
   */
  approveDepositTerms = async (terms: DepositTerms): Promise<void> => {
    assertDepositTermsDeviceCompatible(terms);

    const send = this.requireSender();
    // A dead session cannot be revived — DMK has no reconnect-by-sessionId — so
    // fail with something actionable instead of an opaque status word partway
    // through the ceremony.
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

    // The SDK approves once in preparePegin and again in runDepositorPresignFlow.
    // The device accepts only ONE ceremony per DERIVE_CONTEXT_HASH — a second
    // APPROVE_VAULT_INTENT P1=0x00 from INTENT_LOADED returns SW_BAD_STATE — so a
    // byte-equal re-approval on the same connection must be a no-op rather than a
    // second ceremony that would make the user re-approve and then fail anyway.
    const key = fingerprintIntent(intent);
    if (key === this.approvedTermsKey) return;

    try {
      await approveVaultIntent(send, intent);
    } catch (error) {
      // Any device error is a nullification trigger; force a full re-ceremony.
      this.approvedTermsKey = undefined;
      throw error;
    }
    this.approvedTermsKey = key;
  };

  // The requested input is named in the error, following this package's
  // unsupportedDeriveContextHash convention, so logs identify the caller.
  signPsbt = async (psbtHex: string): Promise<string> => this.notWired(`signPsbt (${psbtHex.length / 2} bytes)`);

  signPsbts = async (psbtsHexes: string[]): Promise<string[]> =>
    this.notWired(`signPsbts (${psbtsHexes.length} psbt(s))`);

  signMessage = async (message: string, type: "bip322-simple" | "ecdsa"): Promise<string> =>
    this.notWired(`signMessage (${type}, ${message.length} chars)`);

  getNetwork = async (): Promise<Network> => this.network;

  /** Hardware wallets hold no inscription index. */
  getInscriptions = async (): Promise<InscriptionIdentifier[]> => [];

  /** A USB device has no account-switch event to subscribe to. */
  on = (): void => {};
  off = (): void => {};

  getWalletProviderName = async (): Promise<string> => WALLET_PROVIDER_NAME;

  getWalletProviderIcon = async (): Promise<string> => "";
}

/** Deterministic fingerprint of an encoded intent, for idempotence. */
function fingerprintIntent(intent: {
  scalars: IntentScalars;
  groups: IntentVaultGroup[];
  keeperPubkeys: Uint8Array[];
  challengerPubkeys: Uint8Array[];
}): string {
  const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
  return JSON.stringify(
    {
      s: { ...intent.scalars, prepeginTxidInternal: hex(intent.scalars.prepeginTxidInternal) },
      g: intent.groups.map((g) => ({ ...g, vaultProviderPubkey: hex(g.vaultProviderPubkey) })),
      k: intent.keeperPubkeys.map(hex),
      c: intent.challengerPubkeys.map(hex),
    },
    (_key, value) => (typeof value === "bigint" ? value.toString() : value),
  );
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
