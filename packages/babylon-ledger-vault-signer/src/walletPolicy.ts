/**
 * The default BIP-86 wallet policy the vault app signs key-path inputs under.
 *
 * The base app signs internal (key-path) inputs only when a wallet policy is
 * present (`bitcoin_app_base/src/handler/sign_psbt.c:142-148` @ e400d8d8);
 * without one a PoP returns SW_OK with no signature
 * (`app-babylon-vault/src/sign_custom_inputs.c:101-107` @ 4decf822). A default
 * policy needs no registration: empty name (`init_global_state.c:238-242`),
 * template `tr(@0/**)`, one key info `[fpr/86'/coin'/account']xpub`
 * (`tests/test_screen7_pop.py:135-142`), hmac 32×00. The id is
 * `sha256(serialize())` and becomes the SIGN_PSBT header's wallet_id.
 *
 * The public shape is structural so the vendored class never reaches the
 * emitted declarations (`scripts/check-dist-types.cjs`).
 *
 * @module ledger-vault-signer/walletPolicy
 */

import { HDKey } from "@scure/bip32";

import { BIP86_PURPOSE, HARDENED } from "./bip86Path";
import { DefaultWalletPolicy } from "./vendor/ledger-bitcoin/policy";

export const DEFAULT_TAPROOT_DESCRIPTOR_TEMPLATE = "tr(@0/**)";
// Hardened derivation adds 0x80000000, so the component itself must fit in 31 bits.
const MAX_HARDENED_CHILD_INDEX = 0x7fffffff;
const FINGERPRINT_HEX_RE = /^[0-9a-f]{8}$/;

export interface Bip32Versions {
  readonly private: number;
  readonly public: number;
}

export interface DefaultTaprootWalletPolicy {
  readonly descriptorTemplate: typeof DEFAULT_TAPROOT_DESCRIPTOR_TEMPLATE;
  /** `[fingerprint/86'/coin'/account']xpub` — the device's xpub string verbatim. */
  readonly keyInfo: string;
  /** `sha256(serialized policy)`, 64 lowercase hex — the SIGN_PSBT wallet_id. */
  readonly walletIdHex: string;
  /** The account key this policy is built over, verbatim from the device. */
  readonly accountXpub: string;
  readonly bip32Versions: Bip32Versions;
  /** `m/86'/coin'/account'` as path levels — the key-info origin. */
  readonly keyOriginPath: readonly number[];
  readonly masterFingerprintHex: string;
}

export interface BuildDefaultTaprootPolicyParams {
  /** 8 lowercase hex chars from `getMasterFingerprintHex`. */
  readonly masterFingerprintHex: string;
  /** SLIP-44 coin type of the device build (0 mainnet, 1 testnet/signet). */
  readonly coinType: number;
  readonly accountIndex: number;
  /** Base58 extended key at `m/86'/coin'/account'` from `getExtendedPublicKey`, verbatim. */
  readonly accountXpub: string;
  /** Version bytes of the device build, to decode `accountXpub`. */
  readonly bip32Versions: Bip32Versions;
}

export function buildDefaultTaprootPolicy(params: BuildDefaultTaprootPolicyParams): DefaultTaprootWalletPolicy {
  const { masterFingerprintHex, coinType, accountIndex, accountXpub, bip32Versions } = params;
  if (!FINGERPRINT_HEX_RE.test(masterFingerprintHex)) {
    throw new Error("masterFingerprintHex must be 8 lowercase hex characters");
  }
  if (
    !Number.isInteger(coinType) ||
    coinType < 0 ||
    coinType > MAX_HARDENED_CHILD_INDEX ||
    !Number.isInteger(accountIndex) ||
    accountIndex < 0 ||
    accountIndex > MAX_HARDENED_CHILD_INDEX
  ) {
    throw new Error("coinType and accountIndex must be non-negative integers in 0..0x7fffffff");
  }
  // `WalletPolicy.serialize()` encodes key info with Buffer.from(k, "ascii"),
  // which masks anything above 0x7F — a garbage xpub would still yield a
  // well-formed wallet id the device can never be served a preimage for.
  try {
    HDKey.fromExtendedKey(accountXpub, bip32Versions);
  } catch (error) {
    throw new Error(
      `accountXpub is not a valid extended key for this network: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const keyInfo = `[${masterFingerprintHex}/${BIP86_PURPOSE}'/${coinType}'/${accountIndex}']${accountXpub}`;
  const walletIdHex = new DefaultWalletPolicy(DEFAULT_TAPROOT_DESCRIPTOR_TEMPLATE, keyInfo).getId().toString("hex");
  return {
    descriptorTemplate: DEFAULT_TAPROOT_DESCRIPTOR_TEMPLATE,
    keyInfo,
    walletIdHex,
    accountXpub,
    bip32Versions,
    keyOriginPath: [(HARDENED | BIP86_PURPOSE) >>> 0, (HARDENED | coinType) >>> 0, (HARDENED | accountIndex) >>> 0],
    masterFingerprintHex,
  };
}
