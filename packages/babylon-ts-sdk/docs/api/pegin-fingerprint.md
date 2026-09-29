[@babylonlabs-io/ts-sdk](README.md) / pegin-fingerprint

# pegin-fingerprint

Peg-in configuration fingerprint: the `keccak256(abi.encode(...))` commitment
over the protocol state a Pre-PegIn transaction was built against, sent with
the peg-in registration so the registry can reject a request whose protocol
state moved between the build and inclusion.

Reproduces `PeginLogic._peginFingerprint` from the vault contracts exactly;
see [computePeginFingerprint](#computepeginfingerprint) for the encoding rules that matter.

## Classes

### PeginFingerprintInputError

Defined in: [packages/babylon-ts-sdk/src/tbv/core/pegin-fingerprint/peginFingerprint.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/pegin-fingerprint/peginFingerprint.ts)

An input field is missing, malformed, or outside the width the contract declares for it.

#### Extends

- `Error`

#### Constructors

##### Constructor

```ts
new PeginFingerprintInputError(message): PeginFingerprintInputError;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/pegin-fingerprint/peginFingerprint.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/pegin-fingerprint/peginFingerprint.ts)

###### Parameters

###### message

`string`

###### Returns

[`PeginFingerprintInputError`](#peginfingerprintinputerror)

###### Overrides

```ts
Error.constructor
```

## Interfaces

### PeginFingerprintInput

Defined in: [packages/babylon-ts-sdk/src/tbv/core/pegin-fingerprint/peginFingerprint.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/pegin-fingerprint/peginFingerprint.ts)

Protocol state a Pre-PegIn transaction commits to, one field per encoded
word.

Declared in encoding order so the interface reads as the specification does.
Reordering these fields does not change the output — the encoder names each
one explicitly — but keeping them aligned makes a divergence from the
contract visible on sight.

#### Properties

##### chainId

```ts
chainId: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/pegin-fingerprint/peginFingerprint.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/pegin-fingerprint/peginFingerprint.ts)

`block.chainid` of the chain the registry is deployed on.

##### registryAddress

```ts
registryAddress: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/pegin-fingerprint/peginFingerprint.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/pegin-fingerprint/peginFingerprint.ts)

The `BTCVaultRegistry` address, which the contract encodes as
`address(this)`. EIP-55 checksum casing is irrelevant to the encoded word
and is not required here; see [encodePeginFingerprintPreimage](#encodepeginfingerprintpreimage).

##### vaultProviderBtcKey

```ts
vaultProviderBtcKey: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/pegin-fingerprint/peginFingerprint.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/pegin-fingerprint/peginFingerprint.ts)

The vault provider's RESOLVED operation-BTC key, 32 bytes, `0x`-prefixed.

The resolved key, not an epoch counter: the VP epoch is one registry-wide
counter that ANY provider's key or payout append bumps, so committing to it
would let any registered provider invalidate every in-flight Pre-PegIn
protocol-wide. Only the chosen provider's key reaches the HTLC leaf, so
that is what is committed.

Note the SDK resolves this key as an x-only pubkey WITHOUT a `0x` prefix
(`OnChainBtcPubkey`); callers add the prefix.

##### appKeeperKeyEpoch

```ts
appKeeperKeyEpoch: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/pegin-fingerprint/peginFingerprint.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/pegin-fingerprint/peginFingerprint.ts)

Vault-keeper operation-key epoch for this application (`uint64`).

##### ucKeyEpoch

```ts
ucKeyEpoch: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/pegin-fingerprint/peginFingerprint.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/pegin-fingerprint/peginFingerprint.ts)

Universal-challenger operation-key epoch (`uint64`).

##### appVaultKeepersVersion

```ts
appVaultKeepersVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/pegin-fingerprint/peginFingerprint.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/pegin-fingerprint/peginFingerprint.ts)

Roster version selecting which vault keepers are in the leaf (`uint16`).

##### universalChallengersVersion

```ts
universalChallengersVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/pegin-fingerprint/peginFingerprint.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/pegin-fingerprint/peginFingerprint.ts)

Roster version selecting which universal challengers are in the leaf (`uint16`).

##### offchainParamsVersion

```ts
offchainParamsVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/pegin-fingerprint/peginFingerprint.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/pegin-fingerprint/peginFingerprint.ts)

Off-chain params version: `tRefund` and `minPeginFeeRate` (`uint16`).

##### vaultCoreVersion

```ts
vaultCoreVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/pegin-fingerprint/peginFingerprint.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/pegin-fingerprint/peginFingerprint.ts)

Vault core (tx-graph) version: the PegIn output count (`uint16`).

## Functions

### isPeginFingerprintInputError()

```ts
function isPeginFingerprintInputError(err): err is PeginFingerprintInputError;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/pegin-fingerprint/peginFingerprint.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/pegin-fingerprint/peginFingerprint.ts)

Recognise the error above, including across a module boundary.

Every message it carries names an internal field and the width it broke, so a
consumer needs to be able to catch it and substitute its own copy rather than
show the depositor what went wrong internally. `instanceof` alone fails
across duplicate module copies and test mocks, so the name is the fallback —
the same pattern the deposit-path drift guards use.

#### Parameters

##### err

`unknown`

#### Returns

`err is PeginFingerprintInputError`

***

### encodePeginFingerprintPreimage()

```ts
function encodePeginFingerprintPreimage(input): `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/pegin-fingerprint/peginFingerprint.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/pegin-fingerprint/peginFingerprint.ts)

The `abi.encode` preimage the contract hashes — ten 32-byte words, 320 bytes.

Exposed alongside [computePeginFingerprint](#computepeginfingerprint) because a fingerprint
mismatch is otherwise two opaque hashes: comparing preimages word by word
localises the disagreement to a field. The contract's vector file ships the
same preimage next to each hash for exactly that reason.

Three fields are held to a tighter bound than the contract's own width — a
zero `chainId`, a zero `registryAddress`, and a `vaultCoreVersion` below 1 —
because for each of them a zero is unreachable on-chain and so can only mean
a read that failed or was mis-decoded. No chain has id 0, no registry lives
at the zero address, and
`activeVaultCoreVersion()` is documented `uint16 >= 1` with a setter that
rejects 0. Encoding any of them would produce a well-formed fingerprint that
cannot ever match, turning a local mistake into an opaque on-chain revert.

The three roster and params versions are NOT tightened: 0 is a legitimate
value on those axes.

#### Parameters

##### input

[`PeginFingerprintInput`](#peginfingerprintinput)

#### Returns

`` `0x${string}` ``

#### Throws

If any field is missing, malformed, or
  outside the accepted range, naming the field and what was expected.

***

### computePeginFingerprint()

```ts
function computePeginFingerprint(input): `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/pegin-fingerprint/peginFingerprint.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/pegin-fingerprint/peginFingerprint.ts)

The fingerprint to send as `expectedFingerprint` on a peg-in registration.

Must equal what the registry recomputes at inclusion, byte for byte — the
comparison is exact equality, never "no older than", because resolving at a
superseded epoch would bond a new vault to a retired key.

#### Parameters

##### input

[`PeginFingerprintInput`](#peginfingerprintinput)

#### Returns

`` `0x${string}` ``

#### Throws

If any field is outside the width the
  contract declares for it.

## Variables

### PEGIN\_FINGERPRINT\_DOMAIN\_PREIMAGE

```ts
const PEGIN_FINGERPRINT_DOMAIN_PREIMAGE: "TBV.PeginFingerprint.v1" = "TBV.PeginFingerprint.v1";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/pegin-fingerprint/peginFingerprint.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/pegin-fingerprint/peginFingerprint.ts)

Domain-separation string hashed into every fingerprint, so the commitment
cannot be replayed as a different one. Matches the contract's
`PEGIN_FINGERPRINT_DOMAIN` preimage.

***

### PEGIN\_FINGERPRINT\_DOMAIN

```ts
const PEGIN_FINGERPRINT_DOMAIN: Hex;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/pegin-fingerprint/peginFingerprint.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/pegin-fingerprint/peginFingerprint.ts)

`keccak256("TBV.PeginFingerprint.v1")`, the first word of the encoded
preimage.

Derived from [PEGIN\_FINGERPRINT\_DOMAIN\_PREIMAGE](#pegin_fingerprint_domain_preimage) rather than pasted as
a hex literal, so the string that defines it stays visible. The golden test
pins the derived value against the constant the contract's vector file
publishes, so a change to either side is still caught.
