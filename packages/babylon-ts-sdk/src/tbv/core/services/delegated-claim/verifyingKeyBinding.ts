/**
 * Binding between the Groth16 verifying key a claim runs under and the one
 * the depositor trusts.
 *
 * btc-vault takes the key opaquely and only checks that the bytes parse
 * (`delegated_claim.rs:405-414` @ ac4954e7): "Must come from a trusted source
 * … never from the vault provider or any artifact the vault provider serves.
 * … a substituted key would let a proof the depositor never authorized pass
 * the pre-Assert check. Compare the VP-served key byte for byte against this
 * trusted value before signing." That comparison is what lives here.
 *
 * @module services/delegated-claim/verifyingKeyBinding
 */

import { stripHexPrefix } from "../../primitives/utils/bitcoin";

/**
 * The one form two verifying keys can be compared in: lowercase hex, no `0x`.
 *
 * @throws If the value is empty or is not even-length hex — an unparseable
 *         key would otherwise compare equal to another unparseable one.
 * @internal
 */
export function normalizeVerifyingKeyHex(value: string, label: string): string {
  const body = stripHexPrefix(value);
  if (!/^(?:[0-9a-fA-F]{2})+$/.test(body)) {
    throw new Error(`${label} must be non-empty, even-length hex.`);
  }
  return body.toLowerCase();
}

/** @internal */
interface AssertVerifyingKeyIsTrustedParams {
  /** The key as the vault provider served it. */
  servedVerifyingKeyHex: string;
  /** The key for {@link AssertVerifyingKeyIsTrustedParams.proverCircuitVersion}, from the vault-provers release or the prover service. */
  trustedVerifyingKeyHex: string;
  proverCircuitVersion: number;
}

/**
 * Throws unless the vault-provider-served verifying key is the trusted one.
 *
 * @returns The trusted key in the form btc-vault decodes it: bare lowercase
 *          hex (`hex::decode`, `delegated_claim.rs:569-571` @ ac4954e7,
 *          rejects a `0x` prefix).
 * @internal
 */
export function assertVerifyingKeyIsTrusted(
  params: AssertVerifyingKeyIsTrustedParams,
): string {
  const served = normalizeVerifyingKeyHex(
    params.servedVerifyingKeyHex,
    "source.verifyingKeyHex",
  );
  const trusted = normalizeVerifyingKeyHex(
    params.trustedVerifyingKeyHex,
    "trustedVerifyingKeyHex",
  );
  if (served === trusted) return trusted;
  throw new Error(
    `Vault provider served Groth16 verifying key ${served} but the trusted key for ` +
      `prover circuit version ${params.proverCircuitVersion} is ${trusted}; refusing to ` +
      `sign a claim whose proof would verify under a substituted key.`,
  );
}
