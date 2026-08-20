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

import { DefaultWalletPolicy } from "./vendor/ledger-bitcoin/policy";

export const DEFAULT_TAPROOT_DESCRIPTOR_TEMPLATE = "tr(@0/**)";
const BIP86_PURPOSE = 86;
// Hardened derivation adds 0x80000000, so the component itself must fit in 31 bits.
const MAX_HARDENED_CHILD_INDEX = 0x7fffffff;
const FINGERPRINT_HEX_RE = /^[0-9a-f]{8}$/;

export interface DefaultTaprootWalletPolicy {
  readonly descriptorTemplate: typeof DEFAULT_TAPROOT_DESCRIPTOR_TEMPLATE;
  /** `[fingerprint/86'/coin'/account']xpub` — the device's xpub string verbatim. */
  readonly keyInfo: string;
  /** `sha256(serialized policy)`, 64 lowercase hex — the SIGN_PSBT wallet_id. */
  readonly walletIdHex: string;
}

export interface BuildDefaultTaprootPolicyParams {
  /** 8 lowercase hex chars from `getMasterFingerprintHex`. */
  readonly masterFingerprintHex: string;
  /** SLIP-44 coin type of the device build (0 mainnet, 1 testnet/signet). */
  readonly coinType: number;
  readonly accountIndex: number;
  /** Base58 extended key at `m/86'/coin'/account'` from `getExtendedPublicKey`, verbatim. */
  readonly accountXpub: string;
}

export function buildDefaultTaprootPolicy(params: BuildDefaultTaprootPolicyParams): DefaultTaprootWalletPolicy {
  const { masterFingerprintHex, coinType, accountIndex, accountXpub } = params;
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
  if (accountXpub.length === 0) {
    throw new Error("accountXpub must be the device's extended key string");
  }
  const keyInfo = `[${masterFingerprintHex}/${BIP86_PURPOSE}'/${coinType}'/${accountIndex}']${accountXpub}`;
  const walletIdHex = new DefaultWalletPolicy(DEFAULT_TAPROOT_DESCRIPTOR_TEMPLATE, keyInfo).getId().toString("hex");
  return { descriptorTemplate: DEFAULT_TAPROOT_DESCRIPTOR_TEMPLATE, keyInfo, walletIdHex };
}
