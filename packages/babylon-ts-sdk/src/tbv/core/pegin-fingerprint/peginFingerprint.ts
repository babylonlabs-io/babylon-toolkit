/**
 * Canonical peg-in configuration fingerprint: the commitment a depositor sends
 * with a peg-in registration so the registry can prove, at inclusion, that the
 * protocol state it is about to bond the vault to is the state the Bitcoin lock
 * was actually built from.
 *
 * ## Why it exists
 *
 * Seven values are resolved live when a peg-in request is included, and every
 * one of them changes the bytes a depositor must have built: the vault
 * provider's operation-BTC key, the vault-keeper and universal-challenger key
 * epochs, the two roster versions (which members are in the HTLC all-party leaf
 * at all), the off-chain params version (`tRefund` in the refund leaf,
 * `minPeginFeeRate` in the output value) and the vault core version (the PegIn
 * output count, so the P2A anchor term in the value). A rotation, roster change
 * or version bump landing between the depositor's build and inclusion would
 * bond the vault to bytes the funded HTLC does not commit to. The registry
 * recomputes this fingerprint and reverts with `PeginFingerprintChanged` rather
 * than accepting such a request.
 *
 * ## Reproducing the contract exactly
 *
 * The encoding is `abi.encode`, never `abi.encodePacked` — the two produce
 * completely different bytes. Under `abi.encode` every field here is static and
 * occupies one left-padded 32-byte word, so the declared integer *width* never
 * reaches the output: encoding the tuple with all-`uint256` slots yields a
 * byte-identical hash. Only the field ORDER, the field COUNT, and whether a
 * type is static or dynamic can change the result. The widths in
 * {@link PeginFingerprintInput} therefore document the contract's own
 * declarations and bound the accepted inputs; they are not what makes the bytes
 * come out right.
 *
 * Mirrors `_peginFingerprint` in `src/protocol/lib/PeginLogic.sol` of
 * `babylonlabs-io/vault-contracts-aave-v4`. Pinned byte-for-byte against that
 * repository's committed vectors — see
 * `__tests__/peginFingerprint.golden.test.ts`.
 *
 * @module pegin-fingerprint/peginFingerprint
 */

import {
  encodeAbiParameters,
  isAddress,
  keccak256,
  toHex,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";

/**
 * Domain-separation string hashed into every fingerprint, so the commitment
 * cannot be replayed as a different one. Matches the contract's
 * `PEGIN_FINGERPRINT_DOMAIN` preimage.
 */
export const PEGIN_FINGERPRINT_DOMAIN_PREIMAGE = "TBV.PeginFingerprint.v1";

/**
 * `keccak256("TBV.PeginFingerprint.v1")`, the first word of the encoded
 * preimage.
 *
 * Derived from {@link PEGIN_FINGERPRINT_DOMAIN_PREIMAGE} rather than pasted as
 * a hex literal, so the string that defines it stays visible. The golden test
 * pins the derived value against the constant the contract's vector file
 * publishes, so a change to either side is still caught.
 */
export const PEGIN_FINGERPRINT_DOMAIN: Hex = keccak256(
  toHex(PEGIN_FINGERPRINT_DOMAIN_PREIMAGE),
);

/** Inclusive upper bound of Solidity `uint16`, the width of all four versions. */
const UINT16_MAX = 65_535;
/** Inclusive upper bound of Solidity `uint64`, the width of both key epochs. */
const UINT64_MAX = 2n ** 64n - 1n;
/** Inclusive upper bound of Solidity `uint256`, the width of `block.chainid`. */
const UINT256_MAX = 2n ** 256n - 1n;
/** A `bytes32` value as viem accepts it: `0x` followed by 64 hex digits. */
const BYTES32_PATTERN = /^0x[0-9a-fA-F]{64}$/;
/**
 * Lowest `vaultCoreVersion` any live contract reports: the setter on
 * `ProtocolParams` rejects 0, so a 0 can only be a mis-decoded read.
 *
 * Mirrors the bound `assertValidVaultCoreVersion` applies in
 * `primitives/vaultCoreVersion.ts`; the two must move together. That function
 * is not called here because it throws a bare `Error`, which would put a second
 * error type into a module whose whole validation surface is
 * {@link PeginFingerprintInputError}.
 */
const VAULT_CORE_VERSION_MIN = 1;

/**
 * Protocol state a Pre-PegIn transaction commits to, one field per encoded
 * word.
 *
 * Declared in encoding order so the interface reads as the specification does.
 * Reordering these fields does not change the output — the encoder names each
 * one explicitly — but keeping them aligned makes a divergence from the
 * contract visible on sight.
 */
export interface PeginFingerprintInput {
  /** `block.chainid` of the chain the registry is deployed on. */
  chainId: bigint;
  /**
   * The `BTCVaultRegistry` address, which the contract encodes as
   * `address(this)`. EIP-55 checksum casing is irrelevant to the encoded word
   * and is not required here; see {@link encodePeginFingerprintPreimage}.
   */
  registryAddress: Address;
  /**
   * The vault provider's RESOLVED operation-BTC key, 32 bytes, `0x`-prefixed.
   *
   * The resolved key, not an epoch counter: the VP epoch is one registry-wide
   * counter that ANY provider's key or payout append bumps, so committing to it
   * would let any registered provider invalidate every in-flight Pre-PegIn
   * protocol-wide. Only the chosen provider's key reaches the HTLC leaf, so
   * that is what is committed.
   *
   * Note the SDK resolves this key as an x-only pubkey WITHOUT a `0x` prefix
   * (`OnChainBtcPubkey`); callers add the prefix.
   */
  vaultProviderBtcKey: Hex;
  /** Vault-keeper operation-key epoch for this application (`uint64`). */
  appKeeperKeyEpoch: bigint;
  /** Universal-challenger operation-key epoch (`uint64`). */
  ucKeyEpoch: bigint;
  /** Roster version selecting which vault keepers are in the leaf (`uint16`). */
  appVaultKeepersVersion: number;
  /** Roster version selecting which universal challengers are in the leaf (`uint16`). */
  universalChallengersVersion: number;
  /** Off-chain params version: `tRefund` and `minPeginFeeRate` (`uint16`). */
  offchainParamsVersion: number;
  /** Vault core (tx-graph) version: the PegIn output count (`uint16`). */
  vaultCoreVersion: number;
}

/** An input field is missing, malformed, or outside the width the contract declares for it. */
export class PeginFingerprintInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PeginFingerprintInputError";
  }
}

/**
 * Recognise the error above, including across a module boundary.
 *
 * Every message it carries names an internal field and the width it broke, so a
 * consumer needs to be able to catch it and substitute its own copy rather than
 * show the depositor what went wrong internally. `instanceof` alone fails
 * across duplicate module copies and test mocks, so the name is the fallback —
 * the same pattern the deposit-path drift guards use.
 */
export function isPeginFingerprintInputError(
  err: unknown,
): err is PeginFingerprintInputError {
  return (
    err instanceof PeginFingerprintInputError ||
    (err instanceof Error && err.name === "PeginFingerprintInputError")
  );
}

/**
 * The type is checked before the range, and deliberately so.
 *
 * A purely relational guard (`value < 0n || value > max`) is not a guard at
 * all for a non-bigint: every comparison against `undefined`, `null` and `NaN`
 * evaluates `false`, so all three slip through, and `"7"` and `true` slip
 * through AND then encode — as 7 and as 1 — producing a well-formed
 * fingerprint from a value nobody supplied. TypeScript does not close this;
 * a JS consumer, a snapshot object missing a key, or an unawaited read all
 * reach here.
 */
function assertUnsignedRange(
  field: string,
  value: bigint,
  max: bigint,
  solidityType: string,
): void {
  if (typeof value !== "bigint") {
    throw new PeginFingerprintInputError(
      `${field} must be a bigint (Solidity ${solidityType}), got ${typeof value}`,
    );
  }
  if (value < 0n || value > max) {
    throw new PeginFingerprintInputError(
      `${field} must fit Solidity ${solidityType} (0..${max}), got ${value}`,
    );
  }
}

function assertUint16(field: string, value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > UINT16_MAX) {
    throw new PeginFingerprintInputError(
      `${field} must be an integer fitting Solidity uint16 (0..${UINT16_MAX}), got ${value}`,
    );
  }
}

/**
 * Validate a `bytes32` field and return it lowercased.
 *
 * viem echoes the caller's hex casing straight into the encoded output, so an
 * upper-case key would yield a correct fingerprint (keccak hashes bytes, not
 * text) beside a preimage that no longer compares equal to the contract's.
 * That would defeat the one job {@link encodePeginFingerprintPreimage} has.
 */
function normalizeBytes32(field: string, value: Hex): Hex {
  if (!BYTES32_PATTERN.test(value)) {
    throw new PeginFingerprintInputError(
      `${field} must be 32 bytes as 0x-prefixed hex (66 characters), got "${value}"`,
    );
  }
  return value.toLowerCase() as Hex;
}

/**
 * Validate the registry address and return it in the form the ABI word encodes.
 *
 * EIP-55 mixed-case is a display checksum over the same 20 bytes, and Solidity
 * never sees it. viem does: `encodeAbiParameters` rejects a mixed-case address
 * whose checksum does not verify, which would make legitimate inputs — the
 * contract's own `maximum_field_values` vector among them — fail to encode. So
 * the checksum is not enforced and the value is lowercased before encoding.
 *
 * This is normalisation, not a fallback: an address that is not 20 bytes of hex
 * is still rejected, loudly, before anything is encoded, as is the zero address
 * (the shape an unresolved contract-address read takes).
 */
function normalizeRegistryAddress(registryAddress: Address): Address {
  if (!isAddress(registryAddress, { strict: false })) {
    throw new PeginFingerprintInputError(
      `registryAddress must be a 20-byte 0x-prefixed address, got "${registryAddress}"`,
    );
  }
  const normalized = registryAddress.toLowerCase() as Address;
  if (normalized === zeroAddress) {
    throw new PeginFingerprintInputError(
      "registryAddress must not be the zero address; a zero here means the registry address was never resolved",
    );
  }
  return normalized;
}

/**
 * The encoded tuple, as one list so the ordering lives in exactly one place.
 *
 * Not re-exported from the module barrel — this is internal, and exists in
 * this shape so the golden test can render it back into the type string the
 * contract's vector file publishes and compare the two. That comparison is a
 * second, independent check on the field order, one that does not depend on
 * the sample values in the vectors.
 */
export const PEGIN_FINGERPRINT_ABI_PARAMETERS = [
  { name: "domain", type: "bytes32" },
  { name: "chainId", type: "uint256" },
  { name: "registry", type: "address" },
  { name: "vaultProviderBtcKey", type: "bytes32" },
  { name: "appKeeperKeyEpoch", type: "uint64" },
  { name: "ucKeyEpoch", type: "uint64" },
  { name: "appVaultKeepersVersion", type: "uint16" },
  { name: "universalChallengersVersion", type: "uint16" },
  { name: "offchainParamsVersion", type: "uint16" },
  { name: "vaultCoreVersion", type: "uint16" },
] as const;

/**
 * The `abi.encode` preimage the contract hashes — ten 32-byte words, 320 bytes.
 *
 * Exposed alongside {@link computePeginFingerprint} because a fingerprint
 * mismatch is otherwise two opaque hashes: comparing preimages word by word
 * localises the disagreement to a field. The contract's vector file ships the
 * same preimage next to each hash for exactly that reason.
 *
 * Three fields are held to a tighter bound than the contract's own width — a
 * zero `chainId`, a zero `registryAddress`, and a `vaultCoreVersion` below 1 —
 * because for each of them a zero is unreachable on-chain and so can only mean
 * a read that failed or was mis-decoded. No chain has id 0, no registry lives
 * at the zero address, and
 * `activeVaultCoreVersion()` is documented `uint16 >= 1` with a setter that
 * rejects 0. Encoding any of them would produce a well-formed fingerprint that
 * cannot ever match, turning a local mistake into an opaque on-chain revert.
 *
 * The three roster and params versions are NOT tightened: 0 is a legitimate
 * value on those axes.
 *
 * @throws {PeginFingerprintInputError} If any field is missing, malformed, or
 *   outside the accepted range, naming the field and what was expected.
 */
export function encodePeginFingerprintPreimage(
  input: PeginFingerprintInput,
): Hex {
  assertUnsignedRange("chainId", input.chainId, UINT256_MAX, "uint256");
  if (input.chainId === 0n) {
    throw new PeginFingerprintInputError(
      "chainId must not be 0; a zero here means the chain id was never resolved",
    );
  }
  const registry = normalizeRegistryAddress(input.registryAddress);
  const vaultProviderBtcKey = normalizeBytes32(
    "vaultProviderBtcKey",
    input.vaultProviderBtcKey,
  );
  assertUnsignedRange(
    "appKeeperKeyEpoch",
    input.appKeeperKeyEpoch,
    UINT64_MAX,
    "uint64",
  );
  assertUnsignedRange("ucKeyEpoch", input.ucKeyEpoch, UINT64_MAX, "uint64");
  assertUint16("appVaultKeepersVersion", input.appVaultKeepersVersion);
  assertUint16(
    "universalChallengersVersion",
    input.universalChallengersVersion,
  );
  assertUint16("offchainParamsVersion", input.offchainParamsVersion);
  assertUint16("vaultCoreVersion", input.vaultCoreVersion);
  if (input.vaultCoreVersion < VAULT_CORE_VERSION_MIN) {
    throw new PeginFingerprintInputError(
      `vaultCoreVersion must be at least ${VAULT_CORE_VERSION_MIN}; ` +
        `${input.vaultCoreVersion} means the version was never resolved`,
    );
  }

  // Field order is the whole specification. The parameter list, this value
  // list, and the contract's `abi.encode(...)` call move together.
  return encodeAbiParameters(PEGIN_FINGERPRINT_ABI_PARAMETERS, [
    PEGIN_FINGERPRINT_DOMAIN,
    input.chainId,
    registry,
    vaultProviderBtcKey,
    input.appKeeperKeyEpoch,
    input.ucKeyEpoch,
    input.appVaultKeepersVersion,
    input.universalChallengersVersion,
    input.offchainParamsVersion,
    input.vaultCoreVersion,
  ]);
}

/**
 * The fingerprint to send as `expectedFingerprint` on a peg-in registration.
 *
 * Must equal what the registry recomputes at inclusion, byte for byte — the
 * comparison is exact equality, never "no older than", because resolving at a
 * superseded epoch would bond a new vault to a retired key.
 *
 * @throws {PeginFingerprintInputError} If any field is outside the width the
 *   contract declares for it.
 */
export function computePeginFingerprint(input: PeginFingerprintInput): Hex {
  return keccak256(encodePeginFingerprintPreimage(input));
}
