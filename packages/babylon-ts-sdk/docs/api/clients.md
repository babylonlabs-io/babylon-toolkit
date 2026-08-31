[@babylonlabs-io/ts-sdk](README.md) / clients

# clients

Transport clients for the external systems the SDK talks to (Ethereum, Bitcoin mempool, vault provider RPC).

Use the `eth` readers for authoritative vault / protocol / signer-set data at the version a vault pinned
at registration — signing-critical values must not come from the indexer mirror.

## Classes

### ViemOperationKeyReader

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/operation-key-reader.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/operation-key-reader.ts)

Reads RFC-006 operation keys and payout scripts.

Usage:
```ts
const reader = new ViemOperationKeyReader(publicClient, contracts);
const keys = await reader.getCurrentOperationKeys(query);
```

#### Implements

- [`OperationKeyReader`](#operationkeyreader)

#### Constructors

##### Constructor

```ts
new ViemOperationKeyReader(publicClient, contracts): ViemOperationKeyReader;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/operation-key-reader.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/operation-key-reader.ts)

###### Parameters

###### publicClient

###### contracts

[`OperationKeyContracts`](#operationkeycontracts)

###### Returns

[`ViemOperationKeyReader`](#viemoperationkeyreader)

#### Methods

##### getCurrentOperationKeys()

```ts
getCurrentOperationKeys(query): Promise<RawOperationKeys>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/operation-key-reader.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/operation-key-reader.ts)

Resolve every participant's *current* operation key.

Used for new peg-ins and for the VP auth pin. Needs no epoch read at all —
each registry's `getCurrentOperationBtcKey` resolves its own genesis
fallback, so an operator that never rotated yields its registration key.

###### Parameters

###### query

[`OperationKeyQuery`](#operationkeyquery)

###### Returns

`Promise`\<[`RawOperationKeys`](#rawoperationkeys)\>

###### Implementation of

[`OperationKeyReader`](#operationkeyreader).[`getCurrentOperationKeys`](#getcurrentoperationkeys-2)

##### getOperationKeysAtEpochs()

```ts
getOperationKeysAtEpochs(query, epochs): Promise<RawOperationKeys>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/operation-key-reader.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/operation-key-reader.ts)

Resolve every participant's operation key bonded at a vault's frozen
epochs. Used for every existing-vault path (resume, payout, refund).

###### Parameters

###### query

[`OperationKeyQuery`](#operationkeyquery)

###### epochs

[`KeyEpochs`](#keyepochs)

###### Returns

`Promise`\<[`RawOperationKeys`](#rawoperationkeys)\>

###### Implementation of

[`OperationKeyReader`](#operationkeyreader).[`getOperationKeysAtEpochs`](#getoperationkeysatepochs-2)

##### getPayoutScriptsAtEpochs()

```ts
getPayoutScriptsAtEpochs(query, epochs): Promise<RawPayoutScripts>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/operation-key-reader.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/operation-key-reader.ts)

Resolve the VP's commission payout script and each keeper's payout script
at a vault's frozen epochs.

The registry backfills BIP-86 P2TR of the epoch's operation key for any
operator that never called `setPayoutScript`, so this returns byte-identical
results to local BIP-86 derivation until an operator registers a custom
script.

###### Parameters

###### query

[`OperationKeyQuery`](#operationkeyquery)

###### epochs

[`KeyEpochs`](#keyepochs)

###### Returns

`Promise`\<[`RawPayoutScripts`](#rawpayoutscripts)\>

###### Implementation of

[`OperationKeyReader`](#operationkeyreader).[`getPayoutScriptsAtEpochs`](#getpayoutscriptsatepochs-2)

***

### ViemPeginRegistrationClient

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts)

Ethereum-only client for the on-chain half of peg-in registration.

It consumes Bitcoin artifacts that were prepared earlier, but owns no BTC
wallet and imports neither Bitcoin libraries nor the Rust/WASM package.

#### Constructors

##### Constructor

```ts
new ViemPeginRegistrationClient(config): ViemPeginRegistrationClient;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts)

###### Parameters

###### config

[`ViemPeginRegistrationClientConfig`](#viempeginregistrationclientconfig)

###### Returns

[`ViemPeginRegistrationClient`](#viempeginregistrationclient)

#### Methods

##### registerPeginOnChain()

```ts
registerPeginOnChain(params): Promise<PeginRegistrationResult>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts)

###### Parameters

###### params

[`RegisterPeginOnChainParams`](#registerpeginonchainparams)

###### Returns

`Promise`\<[`PeginRegistrationResult`](#peginregistrationresult)\>

##### registerPeginBatchOnChain()

```ts
registerPeginBatchOnChain(params): Promise<PeginBatchRegistrationResult>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts)

###### Parameters

###### params

[`RegisterPeginBatchOnChainParams`](#registerpeginbatchonchainparams)

###### Returns

`Promise`\<[`PeginBatchRegistrationResult`](#peginbatchregistrationresult)\>

***

### ViemProtocolParamsReader

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts)

Concrete protocol params reader using viem.

Every read method runs the matching validator from
`protocol-params-validation` before returning, so callers don't have to
remember to validate.

Usage:
```ts
const reader = new ViemProtocolParamsReader(publicClient, protocolParamsAddress);
const config = await reader.getPegInConfiguration();
```

#### Implements

- [`ProtocolParamsReader`](#protocolparamsreader)

#### Constructors

##### Constructor

```ts
new ViemProtocolParamsReader(publicClient, contractAddress): ViemProtocolParamsReader;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts)

###### Parameters

###### publicClient

###### contractAddress

`` `0x${string}` ``

###### Returns

[`ViemProtocolParamsReader`](#viemprotocolparamsreader)

#### Methods

##### getTBVProtocolParams()

```ts
getTBVProtocolParams(): Promise<TBVProtocolParams>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts)

###### Returns

`Promise`\<[`TBVProtocolParams`](#tbvprotocolparams)\>

###### Implementation of

[`ProtocolParamsReader`](#protocolparamsreader).[`getTBVProtocolParams`](#gettbvprotocolparams-2)

##### getLatestOffchainParams()

```ts
getLatestOffchainParams(): Promise<VersionedOffchainParams>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts)

###### Returns

`Promise`\<[`VersionedOffchainParams`](#versionedoffchainparams)\>

###### Implementation of

[`ProtocolParamsReader`](#protocolparamsreader).[`getLatestOffchainParams`](#getlatestoffchainparams-2)

##### getOffchainParamsByVersion()

```ts
getOffchainParamsByVersion(version): Promise<VersionedOffchainParams>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts)

###### Parameters

###### version

`number`

###### Returns

`Promise`\<[`VersionedOffchainParams`](#versionedoffchainparams)\>

###### Implementation of

[`ProtocolParamsReader`](#protocolparamsreader).[`getOffchainParamsByVersion`](#getoffchainparamsbyversion-2)

##### getLatestOffchainParamsVersion()

```ts
getLatestOffchainParamsVersion(): Promise<number>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts)

###### Returns

`Promise`\<`number`\>

###### Implementation of

[`ProtocolParamsReader`](#protocolparamsreader).[`getLatestOffchainParamsVersion`](#getlatestoffchainparamsversion-2)

##### getTimelockPeginByVersion()

```ts
getTimelockPeginByVersion(version): Promise<number>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts)

###### Parameters

###### version

`number`

###### Returns

`Promise`\<`number`\>

###### Implementation of

[`ProtocolParamsReader`](#protocolparamsreader).[`getTimelockPeginByVersion`](#gettimelockpeginbyversion-2)

##### getPeginActivationDelay()

```ts
getPeginActivationDelay(): Promise<bigint>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts)

Returned as `bigint` with no `Number` narrowing: the registry compares it
against `block.number`, so callers must do the same arithmetic the
contract does. `0` is the documented "disabled" case and is returned as
`0n`. A missing getter or a non-bigint payload throws — never coerced to
`0`, which would fail open and skip the observation window.

###### Returns

`Promise`\<`bigint`\>

###### Throws

If the deployment does not expose `peginActivationDelay()`, or
  the decoded payload is not a `bigint`.

###### Implementation of

[`ProtocolParamsReader`](#protocolparamsreader).[`getPeginActivationDelay`](#getpeginactivationdelay-2)

##### getPegInConfiguration()

```ts
getPegInConfiguration(): Promise<PegInConfiguration>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts)

Read TBV protocol params, latest offchain params, and the latest version
label atomically via multicall. The version is paired with the params so
that a governance update between separate reads cannot let JS build BTC
scripts with version N params while the contract registers the vault
under version N+1.

###### Returns

`Promise`\<[`PegInConfiguration`](#peginconfiguration)\>

###### Implementation of

[`ProtocolParamsReader`](#protocolparamsreader).[`getPegInConfiguration`](#getpeginconfiguration-2)

##### fetchAllOffchainParams()

```ts
fetchAllOffchainParams(onSkippedVersion?): Promise<AllOffchainParamsData>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts)

Fetch every historical offchain params version in a single multicall.
Iterates 1..latestVersion and calls `getOffchainParamsByVersion` for each.
Versions whose payload fails validation are skipped (not included in the
returned map) so a single bad historical version doesn't block the
lookup of the rest.

###### Parameters

###### onSkippedVersion?

[`OnSkippedOffchainParamsVersion`](#onskippedoffchainparamsversion)

optional observer invoked once per skipped
  version. Use to log/telemeter without coupling the SDK to a logger.

###### Returns

`Promise`\<[`AllOffchainParamsData`](#alloffchainparamsdata)\>

###### Implementation of

[`ProtocolParamsReader`](#protocolparamsreader).[`fetchAllOffchainParams`](#fetchalloffchainparams-2)

***

### ViemVaultKeeperReader

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/signer-set-reader.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/signer-set-reader.ts)

Reads vault keepers from the ApplicationRegistry contract.

Usage:
```ts
const reader = new ViemVaultKeeperReader(publicClient, applicationRegistryAddress);
const keepers = await reader.getCurrentVaultKeepers(appEntryPoint);
```

#### Implements

- [`VaultKeeperReader`](#vaultkeeperreader)

#### Constructors

##### Constructor

```ts
new ViemVaultKeeperReader(publicClient, contractAddress): ViemVaultKeeperReader;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/signer-set-reader.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/signer-set-reader.ts)

###### Parameters

###### publicClient

###### contractAddress

`` `0x${string}` ``

###### Returns

[`ViemVaultKeeperReader`](#viemvaultkeeperreader)

#### Methods

##### getVaultKeepersByVersion()

```ts
getVaultKeepersByVersion(appEntryPoint, version): Promise<AddressBTCKeyPair[]>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/signer-set-reader.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/signer-set-reader.ts)

###### Parameters

###### appEntryPoint

`` `0x${string}` ``

###### version

`number`

###### Returns

`Promise`\<[`AddressBTCKeyPair`](#addressbtckeypair)[]\>

###### Implementation of

[`VaultKeeperReader`](#vaultkeeperreader).[`getVaultKeepersByVersion`](#getvaultkeepersbyversion-2)

##### getCurrentVaultKeepers()

```ts
getCurrentVaultKeepers(appEntryPoint): Promise<AddressBTCKeyPair[]>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/signer-set-reader.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/signer-set-reader.ts)

###### Parameters

###### appEntryPoint

`` `0x${string}` ``

###### Returns

`Promise`\<[`AddressBTCKeyPair`](#addressbtckeypair)[]\>

###### Implementation of

[`VaultKeeperReader`](#vaultkeeperreader).[`getCurrentVaultKeepers`](#getcurrentvaultkeepers-2)

##### getCurrentVaultKeepersVersion()

```ts
getCurrentVaultKeepersVersion(appEntryPoint): Promise<number>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/signer-set-reader.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/signer-set-reader.ts)

###### Parameters

###### appEntryPoint

`` `0x${string}` ``

###### Returns

`Promise`\<`number`\>

###### Implementation of

[`VaultKeeperReader`](#vaultkeeperreader).[`getCurrentVaultKeepersVersion`](#getcurrentvaultkeepersversion-2)

***

### ViemUniversalChallengerReader

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/signer-set-reader.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/signer-set-reader.ts)

Reads universal challengers from the ProtocolParams contract.

Usage:
```ts
const reader = new ViemUniversalChallengerReader(publicClient, protocolParamsAddress);
const challengers = await reader.getCurrentUniversalChallengers();
```

#### Implements

- [`UniversalChallengerReader`](#universalchallengerreader)

#### Constructors

##### Constructor

```ts
new ViemUniversalChallengerReader(publicClient, contractAddress): ViemUniversalChallengerReader;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/signer-set-reader.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/signer-set-reader.ts)

###### Parameters

###### publicClient

###### contractAddress

`` `0x${string}` ``

###### Returns

[`ViemUniversalChallengerReader`](#viemuniversalchallengerreader)

#### Methods

##### getUniversalChallengersByVersion()

```ts
getUniversalChallengersByVersion(version): Promise<AddressBTCKeyPair[]>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/signer-set-reader.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/signer-set-reader.ts)

###### Parameters

###### version

`number`

###### Returns

`Promise`\<[`AddressBTCKeyPair`](#addressbtckeypair)[]\>

###### Implementation of

[`UniversalChallengerReader`](#universalchallengerreader).[`getUniversalChallengersByVersion`](#getuniversalchallengersbyversion-2)

##### getCurrentUniversalChallengers()

```ts
getCurrentUniversalChallengers(): Promise<AddressBTCKeyPair[]>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/signer-set-reader.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/signer-set-reader.ts)

###### Returns

`Promise`\<[`AddressBTCKeyPair`](#addressbtckeypair)[]\>

###### Implementation of

[`UniversalChallengerReader`](#universalchallengerreader).[`getCurrentUniversalChallengers`](#getcurrentuniversalchallengers-2)

##### getLatestUniversalChallengersVersion()

```ts
getLatestUniversalChallengersVersion(): Promise<number>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/signer-set-reader.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/signer-set-reader.ts)

###### Returns

`Promise`\<`number`\>

###### Implementation of

[`UniversalChallengerReader`](#universalchallengerreader).[`getLatestUniversalChallengersVersion`](#getlatestuniversalchallengersversion-2)

***

### ViemVaultRegistryReader

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts)

Concrete vault registry reader using viem.

Usage:
```ts
const reader = new ViemVaultRegistryReader(publicClient, registryAddress);
const data = await reader.getVaultData(vaultId);
```

#### Implements

- [`VaultRegistryReader`](#vaultregistryreader)

#### Constructors

##### Constructor

```ts
new ViemVaultRegistryReader(publicClient, contractAddress): ViemVaultRegistryReader;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts)

###### Parameters

###### publicClient

###### contractAddress

`` `0x${string}` ``

###### Returns

[`ViemVaultRegistryReader`](#viemvaultregistryreader)

#### Methods

##### getVaultProviderGenesisBtcPubKey()

```ts
getVaultProviderGenesisBtcPubKey(vpAddress): Promise<OnChainBtcPubkey>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts)

Read the VP's **genesis** (registration) x-only BTC pubkey — the key bonded
at version 0, which never moves when the operator rotates.

Resolved as "the operation key at epoch 0" rather than through the
dedicated `getVaultProviderBTCKey` getter, which
https://github.com/babylonlabs-io/vault-contracts-aave-v4/pull/539 removes.
Epoch 0 predates any rotation — appended versions are stamped at epoch 1 or
later — so it resolves to the registration key, and the contracts team has
confirmed that is a property we can rely on rather than an implementation
detail. The devnet comparison behind that claim — both getters returning the
identical key for a provider that *has* rotated, while
`getCurrentOperationBtcKey` differed — is recorded in
https://github.com/babylonlabs-io/babylon-toolkit/issues/2188.

This makes the read RFC-006-only, where the removed getter also existed on a
legacy registry. That costs nothing: every caller of this method already
resolves participant keys through `OperationKeyReader`, so all of them
require an RFC-006 registry regardless.

Validates length, hex form, and secp256k1 curve membership before minting
the brand. Returns 64-char lowercase hex without the `0x` prefix.

###### Parameters

###### vpAddress

`` `0x${string}` ``

###### Returns

`Promise`\<[`OnChainBtcPubkey`](#onchainbtcpubkey)\>

###### Implementation of

[`VaultRegistryReader`](#vaultregistryreader).[`getVaultProviderGenesisBtcPubKey`](#getvaultprovidergenesisbtcpubkey)

##### getCurrentVaultProviderOperationBtcKey()

```ts
getCurrentVaultProviderOperationBtcKey(vpAddress): Promise<OnChainBtcPubkey>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts)

Read a vault provider's *current* RFC-006 operation BTC key.

Falls back on-chain to the registration key when the provider has never
rotated, so this returns the same value as
`getVaultProviderGenesisBtcPubKey` until the first rotation.

This is the key the VP's server signs its BIP-322 auth tokens with — a
live per-operator identity, not a per-vault binding, so the auth pin uses
the current key rather than any vault's frozen epoch.

###### Parameters

###### vpAddress

`` `0x${string}` ``

###### Returns

`Promise`\<[`OnChainBtcPubkey`](#onchainbtcpubkey)\>

###### Implementation of

[`VaultRegistryReader`](#vaultregistryreader).[`getCurrentVaultProviderOperationBtcKey`](#getcurrentvaultprovideroperationbtckey)

##### getVaultKeyEpochs()

```ts
getVaultKeyEpochs(vaultId): Promise<KeyEpochs>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts)

Read a vault's frozen RFC-006 operation-key epochs.

Reads `getBtcVaultProtocolInfo` through the **extended** ABI, which is only
valid against an RFC-006 registry: against one whose `BTCVaultProtocolInfo`
struct is not extended this call does not fail for a populated vault, it
silently returns three words of tail data as epochs. Nothing here can detect
that, so the guarantee is a deployment one — every network this ships to has
the RFC-006 getters, and mainnet is a fresh RFC-006 deploy.

A registry missing the operation-key getters entirely is the *safer* of the
two cases: `resolveParticipantKeysAtEpochs` reverts downstream and these
epochs never reach key resolution. See UINT64\_EXCLUSIVE\_UPPER\_BOUND
for which state the range check actually guards, and
`BTCVaultRegistryKeyEpochs.abi.ts` for the decode hazard.

###### Parameters

###### vaultId

`` `0x${string}` ``

###### Returns

`Promise`\<[`KeyEpochs`](#keyepochs)\>

###### Implementation of

[`VaultRegistryReader`](#vaultregistryreader).[`getVaultKeyEpochs`](#getvaultkeyepochs)

##### getVaultKeyEpochsBatch()

```ts
getVaultKeyEpochsBatch(vaultIds): Promise<KeyEpochs[]>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts)

[getVaultKeyEpochs](#getvaultkeyepochs) for many vaults in one multicall.

###### Parameters

###### vaultIds

readonly `` `0x${string}` ``[]

###### Returns

`Promise`\<[`KeyEpochs`](#keyepochs)[]\>

###### Implementation of

[`VaultRegistryReader`](#vaultregistryreader).[`getVaultKeyEpochsBatch`](#getvaultkeyepochsbatch)

##### getVaultBasicInfo()

```ts
getVaultBasicInfo(vaultId): Promise<VaultBasicInfo>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts)

###### Parameters

###### vaultId

`` `0x${string}` ``

###### Returns

`Promise`\<[`VaultBasicInfo`](#vaultbasicinfo)\>

###### Implementation of

[`VaultRegistryReader`](#vaultregistryreader).[`getVaultBasicInfo`](#getvaultbasicinfo)

##### getVaultProtocolInfo()

```ts
getVaultProtocolInfo(vaultId): Promise<VaultProtocolInfo>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts)

###### Parameters

###### vaultId

`` `0x${string}` ``

###### Returns

`Promise`\<[`VaultProtocolInfo`](#vaultprotocolinfo)\>

###### Implementation of

[`VaultRegistryReader`](#vaultregistryreader).[`getVaultProtocolInfo`](#getvaultprotocolinfo)

##### getProtocolInfoBatch()

```ts
getProtocolInfoBatch(vaultIds): Promise<VaultProtocolInfo[]>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts)

###### Parameters

###### vaultIds

readonly `` `0x${string}` ``[]

###### Returns

`Promise`\<[`VaultProtocolInfo`](#vaultprotocolinfo)[]\>

###### Implementation of

[`VaultRegistryReader`](#vaultregistryreader).[`getProtocolInfoBatch`](#getprotocolinfobatch)

##### getPegInFee()

```ts
getPegInFee(vaultProvider): Promise<bigint>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts)

Read the protocol pegin fee (in wei) for a given vault provider.
Mirrors the `getPegInFee(address)` view on BTCVaultRegistry.

###### Parameters

###### vaultProvider

`` `0x${string}` ``

###### Returns

`Promise`\<`bigint`\>

###### Implementation of

[`VaultRegistryReader`](#vaultregistryreader).[`getPegInFee`](#getpeginfee)

##### getVaultProviderCommission()

```ts
getVaultProviderCommission(vaultProvider): Promise<number>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts)

Read a vault provider's current commission in basis points from
BTCVaultRegistry. The contract enforces `commissionBps < 10000`, so the
legitimate range is `[0, 9999]`; anything outside indicates a wrong
contract address or ABI drift and is surfaced as an error rather than
trusted.

###### Parameters

###### vaultProvider

`` `0x${string}` ``

###### Returns

`Promise`\<`number`\>

###### Implementation of

[`VaultRegistryReader`](#vaultregistryreader).[`getVaultProviderCommission`](#getvaultprovidercommission)

##### getVaultData()

```ts
getVaultData(vaultId): Promise<VaultData>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts)

###### Parameters

###### vaultId

`` `0x${string}` ``

###### Returns

`Promise`\<[`VaultData`](#vaultdata)\>

###### Implementation of

[`VaultRegistryReader`](#vaultregistryreader).[`getVaultData`](#getvaultdata)

***

### VaultProviderRpcClient

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts)

Concrete VP RPC client implementing all service interfaces.

Usage:
```ts
const client = new VaultProviderRpcClient("https://vp.example.com/rpc");
const status = await client.getPeginStatus({ pegin_txid: "abc..." });
```

#### Implements

- [`PeginStatusReader`](services.md#peginstatusreader)
- [`WotsKeySubmitter`](services.md#wotskeysubmitter)
- [`PresignClient`](services.md#presignclient)
- [`ClaimerArtifactsReader`](services.md#claimerartifactsreader)

#### Constructors

##### Constructor

```ts
new VaultProviderRpcClient(baseUrl, options?): VaultProviderRpcClient;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts)

###### Parameters

###### baseUrl

`string`

###### options?

[`VaultProviderRpcClientOptions`](#vaultproviderrpcclientoptions)

###### Returns

[`VaultProviderRpcClient`](#vaultproviderrpcclient)

#### Methods

##### requestDepositorPresignTransactions()

```ts
requestDepositorPresignTransactions(params, signal?): Promise<RequestDepositorPresignTransactionsResponse>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts)

Request the payout/claim/assert transactions that the depositor
needs to pre-sign before the vault can be activated on Bitcoin.

###### Parameters

###### params

[`RequestDepositorPresignTransactionsParams`](#requestdepositorpresigntransactionsparams)

###### signal?

`AbortSignal`

###### Returns

`Promise`\<[`RequestDepositorPresignTransactionsResponse`](#requestdepositorpresigntransactionsresponse)\>

###### Implementation of

[`PresignClient`](services.md#presignclient).[`requestDepositorPresignTransactions`](services.md#requestdepositorpresigntransactions)

##### submitDepositorPresignatures()

```ts
submitDepositorPresignatures(params, signal?): Promise<void>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts)

Submit the depositor's pre-signatures for the payout transactions
and the depositor-as-claimer graph.

###### Parameters

###### params

[`SubmitDepositorPresignaturesParams`](#submitdepositorpresignaturesparams)

###### signal?

`AbortSignal`

###### Returns

`Promise`\<`void`\>

###### Implementation of

[`PresignClient`](services.md#presignclient).[`submitDepositorPresignatures`](services.md#submitdepositorpresignatures)

##### submitDepositorWotsKey()

```ts
submitDepositorWotsKey(params, signal?): Promise<void>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts)

Submit the depositor's WOTS public key to the vault provider.
Called after the pegin is finalized on Ethereum, when the VP is in
`PendingDepositorWotsPK` status.

###### Parameters

###### params

[`SubmitDepositorWotsKeyParams`](#submitdepositorwotskeyparams)

###### signal?

`AbortSignal`

###### Returns

`Promise`\<`void`\>

###### Implementation of

[`WotsKeySubmitter`](services.md#wotskeysubmitter).[`submitDepositorWotsKey`](services.md#submitdepositorwotskey)

##### requestDepositorClaimerArtifacts()

```ts
requestDepositorClaimerArtifacts(params, signal?): Promise<RequestDepositorClaimerArtifactsResponse>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts)

Request the BaBe DecryptorArtifacts needed for the depositor to
independently evaluate garbled circuits during a challenge.

###### Parameters

###### params

[`RequestDepositorClaimerArtifactsParams`](#requestdepositorclaimerartifactsparams)

###### signal?

`AbortSignal`

###### Returns

`Promise`\<[`RequestDepositorClaimerArtifactsResponse`](#requestdepositorclaimerartifactsresponse)\>

###### Implementation of

[`ClaimerArtifactsReader`](services.md#claimerartifactsreader).[`requestDepositorClaimerArtifacts`](services.md#requestdepositorclaimerartifacts)

##### getPeginStatus()

```ts
getPeginStatus(params, signal?): Promise<GetPeginStatusResponse>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts)

Get the current pegin status from the vault provider daemon.

###### Parameters

###### params

[`GetPeginStatusParams`](#getpeginstatusparams)

###### signal?

`AbortSignal`

###### Returns

`Promise`\<[`GetPeginStatusResponse`](#getpeginstatusresponse)\>

###### Implementation of

[`PeginStatusReader`](services.md#peginstatusreader).[`getPeginStatus`](services.md#getpeginstatus)

##### batchGetPeginStatus()

```ts
batchGetPeginStatus(params, signal?): Promise<BatchGetPeginStatusResponse>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts)

Get pegin status for many txids in one round trip. Per-result envelope
isolates per-pegin failures from the overall RPC. Caller must chunk
inputs at `VP_BATCH_MAX_SIZE`.

###### Parameters

###### params

[`BatchGetPeginStatusParams`](#batchgetpeginstatusparams)

###### signal?

`AbortSignal`

###### Returns

`Promise`\<[`BatchGetPeginStatusResponse`](#batchgetpeginstatusresponse)\>

##### batchGetPegoutStatus()

```ts
batchGetPegoutStatus(params, signal?): Promise<BatchGetPegoutStatusResponse>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts)

Get pegout status for many txids in one round trip. Same per-result
envelope semantics as `batchGetPeginStatus`.

###### Parameters

###### params

[`BatchGetPegoutStatusParams`](#batchgetpegoutstatusparams)

###### signal?

`AbortSignal`

###### Returns

`Promise`\<[`BatchGetPegoutStatusResponse`](#batchgetpegoutstatusresponse)\>

***

### ServerIdentityError

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts)

#### Extends

- `Error`

#### Constructors

##### Constructor

```ts
new ServerIdentityError(message, reason): ServerIdentityError;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts)

###### Parameters

###### message

`string`

###### reason

`"pinned_pubkey_mismatch"` | `"expired"` | `"expires_too_far"` | `"invalid_expires_at"` | `"invalid_max_lifetime"` | `"invalid_pubkey_encoding"` | `"invalid_ephemeral_pubkey"` | `"invalid_signature_encoding"` | `"signature_verification_failed"`

###### Returns

[`ServerIdentityError`](#serveridentityerror)

###### Overrides

```ts
Error.constructor
```

#### Properties

##### reason

```ts
readonly reason: 
  | "pinned_pubkey_mismatch"
  | "expired"
  | "expires_too_far"
  | "invalid_expires_at"
  | "invalid_max_lifetime"
  | "invalid_pubkey_encoding"
  | "invalid_ephemeral_pubkey"
  | "invalid_signature_encoding"
  | "signature_verification_failed";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts)

***

### VpTokenRegistry

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenRegistry.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenRegistry.ts)

#### Accessors

##### size

###### Get Signature

```ts
get size(): number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenRegistry.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenRegistry.ts)

###### Returns

`number`

#### Constructors

##### Constructor

```ts
new VpTokenRegistry(): VpTokenRegistry;
```

###### Returns

[`VpTokenRegistry`](#vptokenregistry)

#### Methods

##### getOrCreate()

```ts
getOrCreate(input): VpTokenProvider;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenRegistry.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenRegistry.ts)

Return the cached `VpTokenProvider` for `peginTxid` if one exists
with matching `authAnchorHex` and `pinnedServerPubkey`, otherwise
construct and cache a fresh provider. A mismatch on either throws —
silent overwrite would mask derivation drift or VP pubkey rotation.

###### Parameters

###### input

[`VpTokenRegistryInput`](#vptokenregistryinput)

###### Returns

`VpTokenProvider`

##### peek()

```ts
peek(peginTxid): VpTokenProvider | undefined;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenRegistry.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenRegistry.ts)

Return the cached provider, or `undefined` if none.

###### Parameters

###### peginTxid

`string`

###### Returns

`VpTokenProvider` \| `undefined`

##### release()

```ts
release(peginTxid): void;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenRegistry.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenRegistry.ts)

Evict the entry for `peginTxid`. Idempotent. Called on terminal
paths — activation success, user-cancel, or component unmount —
so `authAnchorHex` doesn't outlive the deposit session.

###### Parameters

###### peginTxid

`string`

###### Returns

`void`

***

### JsonRpcError

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts)

#### Extends

- `Error`

#### Constructors

##### Constructor

```ts
new JsonRpcError(
   code, 
   message, 
   source, 
   data?): JsonRpcError;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts)

###### Parameters

###### code

`number`

###### message

`string`

###### source

[`JsonRpcErrorSource`](#jsonrpcerrorsource) = `"local"`

"wire" for server-returned envelopes; "local" for SDK-side failures.

###### data?

`unknown`

Structured data from the server `error.data` field, if any.

###### Returns

[`JsonRpcError`](#jsonrpcerror)

###### Overrides

```ts
Error.constructor
```

#### Properties

##### code

```ts
code: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts)

##### source

```ts
source: JsonRpcErrorSource = "local";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts)

"wire" for server-returned envelopes; "local" for SDK-side failures.

##### data?

```ts
optional data: unknown;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts)

Structured data from the server `error.data` field, if any.

***

### JsonRpcClient

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts)

Generic JSON-RPC 2.0 HTTP client with safe retry policy.

#### Constructors

##### Constructor

```ts
new JsonRpcClient(config): JsonRpcClient;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts)

###### Parameters

###### config

[`JsonRpcClientConfig`](#jsonrpcclientconfig)

###### Returns

[`JsonRpcClient`](#jsonrpcclient)

#### Methods

##### call()

```ts
call<TParams, TResult>(
   method, 
   params, 
signal?): Promise<TResult>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts)

Make a JSON-RPC request with optional retry for safe methods.

If the server rejects the bearer token and a `tokenProvider` is
configured, the client invalidates its cached token and retries the
request once with a freshly-acquired bearer.

###### Type Parameters

###### TParams

`TParams`

###### TResult

`TResult`

###### Parameters

###### method

`string`

The RPC method name

###### params

`TParams`

The method parameters

###### signal?

`AbortSignal`

Optional AbortSignal for caller-controlled cancellation

###### Returns

`Promise`\<`TResult`\>

The result from the RPC method

###### Throws

JsonRpcError if the RPC call fails

##### callRaw()

```ts
callRaw<TParams>(
   method, 
   params, 
signal?): Promise<Response>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts)

Make a JSON-RPC request returning the raw Response (unparsed body).

Bearer tokens are injected identically to `call`. **Reactive refresh
is NOT performed here** — the response body may be unbounded (e.g.
claimer-artifact downloads), so the client refuses to parse it to
detect auth errors. Callers relying on token-expired retries for
large downloads must read the body themselves and re-invoke
`callRaw` after `tokenProvider.invalidate()`.

###### Type Parameters

###### TParams

`TParams`

###### Parameters

###### method

`string`

###### params

`TParams`

###### signal?

`AbortSignal`

###### Returns

`Promise`\<`Response`\>

##### getBaseUrl()

```ts
getBaseUrl(): string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts)

###### Returns

`string`

***

### VpResponseValidationError

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/validators.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/validators.ts)

Thrown when a VP RPC response fails runtime validation.

`.message` is a user-facing string safe to display in the UI.
`.detail` contains the technical reason, suitable for logging.

#### Extends

- `Error`

#### Constructors

##### Constructor

```ts
new VpResponseValidationError(detail): VpResponseValidationError;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/validators.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/validators.ts)

###### Parameters

###### detail

`string`

###### Returns

[`VpResponseValidationError`](#vpresponsevalidationerror)

###### Overrides

```ts
Error.constructor
```

#### Properties

##### detail

```ts
readonly detail: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/validators.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/validators.ts)

## Interfaces

### ProtocolAddresses

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/contract-address-resolver.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/contract-address-resolver.ts)

#### Properties

##### protocolParams

```ts
protocolParams: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/contract-address-resolver.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/contract-address-resolver.ts)

Address of the ProtocolParams contract

##### applicationRegistry

```ts
applicationRegistry: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/contract-address-resolver.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/contract-address-resolver.ts)

Address of the ApplicationRegistry contract

***

### OperationKeyContracts

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/operation-key-reader.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/operation-key-reader.ts)

Addresses of the three registries an operation-key resolution spans.

#### Properties

##### btcVaultRegistry

```ts
btcVaultRegistry: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/operation-key-reader.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/operation-key-reader.ts)

##### applicationRegistry

```ts
applicationRegistry: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/operation-key-reader.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/operation-key-reader.ts)

##### protocolParams

```ts
protocolParams: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/operation-key-reader.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/operation-key-reader.ts)

***

### ViemPeginRegistrationClientConfig

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts)

#### Properties

##### ethWallet

```ts
ethWallet: object;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts)

##### ethChain

```ts
ethChain: Chain;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts)

##### publicClient

```ts
publicClient: object;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts)

##### btcVaultRegistry

```ts
btcVaultRegistry: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts)

##### receiptTimeoutMs?

```ts
optional receiptTimeoutMs: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts)

##### requireQuotedCommissionBps

```ts
requireQuotedCommissionBps: boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts)

Refuse to register without a `quotedCommissionBps`. Set it to `true` when
the depositor approved deposit terms on a device: approval froze the
commission ceiling from the quote, so the chain-current fallback could
admit a commission the device would later refuse to pay out.

Required, with no default: an omitted flag would silently pick the unsafe
direction for the integrator least able to probe the wallet capability.

***

### RegisterPeginOnChainParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts)

#### Properties

##### unsignedPrePeginTx

```ts
unsignedPrePeginTx: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts)

##### depositorSignedPeginTx

```ts
depositorSignedPeginTx: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts)

##### vaultProvider

```ts
vaultProvider: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts)

##### hashlock

```ts
hashlock: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts)

##### depositorWotsPkHash

```ts
depositorWotsPkHash: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts)

##### popSignature

```ts
popSignature: PopSignature;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts)

##### depositorBtcPubkeyRaw

```ts
depositorBtcPubkeyRaw: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts)

Raw x-only, compressed, or uncompressed BTC pubkey from the PoP wallet.

##### htlcVout

```ts
htlcVout: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts)

##### depositorPayoutScriptPubKey

```ts
depositorPayoutScriptPubKey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts)

Bitcoin output script bytes, not an address. The client verifies that the
script pays the proof-of-possession key before it submits the transaction.

##### quotedCommissionBps?

```ts
optional quotedCommissionBps: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts)

***

### PeginRegistrationResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts)

#### Properties

##### ethTxHash

```ts
ethTxHash: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts)

##### vaultId

```ts
vaultId: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts)

##### peginTxHash

```ts
peginTxHash: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts)

***

### BatchPeginRegistrationItem

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts)

#### Properties

##### depositorSignedPeginTx

```ts
depositorSignedPeginTx: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts)

##### hashlock

```ts
hashlock: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts)

##### htlcVout

```ts
htlcVout: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts)

##### depositorPayoutScriptPubKey

```ts
depositorPayoutScriptPubKey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts)

Bitcoin output script bytes, not an address. The client verifies that the
script pays the proof-of-possession key before it submits the transaction.

##### depositorWotsPkHash

```ts
depositorWotsPkHash: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts)

***

### RegisterPeginBatchOnChainParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts)

#### Properties

##### vaultProvider

```ts
vaultProvider: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts)

##### unsignedPrePeginTx

```ts
unsignedPrePeginTx: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts)

##### requests

```ts
requests: BatchPeginRegistrationItem[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts)

##### popSignature

```ts
popSignature: PopSignature;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts)

##### depositorBtcPubkeyRaw

```ts
depositorBtcPubkeyRaw: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts)

Raw x-only, compressed, or uncompressed BTC pubkey from the PoP wallet.

##### quotedCommissionBps?

```ts
optional quotedCommissionBps: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts)

***

### BatchPeginRegistrationResultItem

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts)

#### Properties

##### vaultId

```ts
vaultId: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts)

##### peginTxHash

```ts
peginTxHash: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts)

***

### PeginBatchRegistrationResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts)

#### Properties

##### ethTxHash

```ts
ethTxHash: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts)

##### vaults

```ts
vaults: BatchPeginRegistrationResultItem[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-registration-client.ts)

***

### VaultBasicInfo

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

Basic vault info from BTCVaultRegistry.getBtcVaultBasicInfo

#### Properties

##### depositor

```ts
depositor: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### depositorBtcPubKey

```ts
depositorBtcPubKey: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### amount

```ts
amount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### vaultProvider

```ts
vaultProvider: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### status

```ts
status: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### applicationEntryPoint

```ts
applicationEntryPoint: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### createdAt

```ts
createdAt: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

***

### VaultProtocolInfo

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

Protocol info from BTCVaultRegistry.getBtcVaultProtocolInfo

#### Properties

##### depositorSignedPeginTx

```ts
depositorSignedPeginTx: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### universalChallengersVersion

```ts
universalChallengersVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### appVaultKeepersVersion

```ts
appVaultKeepersVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### offchainParamsVersion

```ts
offchainParamsVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### verifiedAt

```ts
verifiedAt: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

ETH block number stamped at the Pending→Verified transition.
Compared against `block.number` (inclusive:
`block.number >= verifiedAt + peginActivationDelay`), never a unix timestamp.

##### depositorWotsPkHash

```ts
depositorWotsPkHash: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### hashlock

```ts
hashlock: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### htlcVout

```ts
htlcVout: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### depositorPopSignature

```ts
depositorPopSignature: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### prePeginTxHash

```ts
prePeginTxHash: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### vaultProviderCommissionBps

```ts
vaultProviderCommissionBps: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### claimExpiredUntil

```ts
claimExpiredUntil: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

Block deadline (uint256) for depositor reclaim. TODO(#1690): wire to refund flow.

##### vaultCoreVersion

```ts
vaultCoreVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

Vault core version (uint16) stamped at registration. VP-side gating only — see #1690.

***

### VaultData

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

Combined vault data (basic + protocol)

#### Properties

##### basic

```ts
basic: VaultBasicInfo;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### protocol

```ts
protocol: VaultProtocolInfo;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

***

### KeyEpochs

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

RFC-006 operation-key epochs a vault froze at `submitPeginRequest`.

Each registry keeps a monotonic epoch counter that every key/payout setter
pre-increments. A vault stamps the counters live at its creation, and every
participant resolves "which key did this vault bond?" by asking the registry
for the key whose appended version is the latest stamped `<=` this epoch. A
rotation after the vault was created therefore never moves its keys.

`uint64` — kept as `bigint` end-to-end and passed straight back to the
`...AtEpoch` getters, never narrowed through `Number`.

Only ever read through [VaultRegistryReader.getVaultKeyEpochs](#getvaultkeyepochs), which
uses the extended ABI. See `BTCVaultRegistryKeyEpochs.abi.ts` for why that
read is quarantined to its own ABI.

#### Properties

##### vpKeyEpoch

```ts
vpKeyEpoch: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### appKeeperKeyEpoch

```ts
appKeeperKeyEpoch: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### ucKeyEpoch

```ts
ucKeyEpoch: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

***

### VaultRegistryReader

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

Interface for reading vault data from the BTCVaultRegistry contract.

#### Methods

##### getVaultBasicInfo()

```ts
getVaultBasicInfo(vaultId): Promise<VaultBasicInfo>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

###### Parameters

###### vaultId

`` `0x${string}` ``

###### Returns

`Promise`\<[`VaultBasicInfo`](#vaultbasicinfo)\>

##### getVaultProtocolInfo()

```ts
getVaultProtocolInfo(vaultId): Promise<VaultProtocolInfo>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

###### Parameters

###### vaultId

`` `0x${string}` ``

###### Returns

`Promise`\<[`VaultProtocolInfo`](#vaultprotocolinfo)\>

##### getProtocolInfoBatch()

```ts
getProtocolInfoBatch(vaultIds): Promise<VaultProtocolInfo[]>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

###### Parameters

###### vaultIds

readonly `` `0x${string}` ``[]

###### Returns

`Promise`\<[`VaultProtocolInfo`](#vaultprotocolinfo)[]\>

##### getVaultData()

```ts
getVaultData(vaultId): Promise<VaultData>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

###### Parameters

###### vaultId

`` `0x${string}` ``

###### Returns

`Promise`\<[`VaultData`](#vaultdata)\>

##### getVaultProviderGenesisBtcPubKey()

```ts
getVaultProviderGenesisBtcPubKey(vpAddress): Promise<OnChainBtcPubkey>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

Read a vault provider's *genesis* (registration) BTC key — the key bonded
at version 0, which never moves when the operator rotates.

Used only as the genesis fallback for epoch-based resolution and as a
candidate when cross-checking an indexer hint. Never the key to build a
Bitcoin lock with; that comes from `OperationKeyReader`.

Resolves via `getOperationBtcKeyAtEpoch` at epoch 0, so it requires an
RFC-006 registry — as does every caller.

###### Parameters

###### vpAddress

`` `0x${string}` ``

###### Returns

`Promise`\<[`OnChainBtcPubkey`](#onchainbtcpubkey)\>

##### getPegInFee()

```ts
getPegInFee(vaultProvider): Promise<bigint>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

Read the protocol pegin fee (in wei) for a given vault provider.

###### Parameters

###### vaultProvider

`` `0x${string}` ``

###### Returns

`Promise`\<`bigint`\>

##### getVaultProviderCommission()

```ts
getVaultProviderCommission(vaultProvider): Promise<number>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

Read a vault provider's current commission in basis points.

Validates the contract-enforced `[0, 9999]` range — an out-of-range
value signals a wrong contract address or ABI drift, not a real rate.

###### Parameters

###### vaultProvider

`` `0x${string}` ``

###### Returns

`Promise`\<`number`\>

##### getVaultKeyEpochs()

```ts
getVaultKeyEpochs(vaultId): Promise<KeyEpochs>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

Read a vault's frozen RFC-006 key epochs.

Uses the extended `getBtcVaultProtocolInfo` ABI. Against a registry whose
`BTCVaultProtocolInfo` struct is not extended this returns silent garbage
for a populated vault rather than throwing, so it must only be called
against an RFC-006 registry — a deployment invariant, not something this
call can detect. A registry missing the operation-key getters altogether is
the safer case: key resolution reverts downstream and these epochs are never
used. See `BTCVaultRegistryKeyEpochs.abi.ts`.

###### Parameters

###### vaultId

`` `0x${string}` ``

###### Returns

`Promise`\<[`KeyEpochs`](#keyepochs)\>

##### getVaultKeyEpochsBatch()

```ts
getVaultKeyEpochsBatch(vaultIds): Promise<KeyEpochs[]>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

[getVaultKeyEpochs](#getvaultkeyepochs) for many vaults in one multicall.

###### Parameters

###### vaultIds

readonly `` `0x${string}` ``[]

###### Returns

`Promise`\<[`KeyEpochs`](#keyepochs)[]\>

##### getCurrentVaultProviderOperationBtcKey()

```ts
getCurrentVaultProviderOperationBtcKey(vpAddress): Promise<OnChainBtcPubkey>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

Read a vault provider's *current* RFC-006 operation BTC key — the key its
server signs auth tokens with. Falls back to the registration key when the
provider has never rotated.

###### Parameters

###### vpAddress

`` `0x${string}` ``

###### Returns

`Promise`\<[`OnChainBtcPubkey`](#onchainbtcpubkey)\>

***

### TBVProtocolParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

TBV protocol parameters from the ProtocolParams contract.
Matches Solidity struct `IProtocolParams.TBVProtocolParams` exactly.

All uint64 amounts use bigint (satoshi values can exceed 2^53).
uint8 uses number (bounded, max 255).

#### Properties

##### minimumPegInAmount

```ts
minimumPegInAmount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### maxPegInAmount

```ts
maxPegInAmount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### pegInAckTimeout

```ts
pegInAckTimeout: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### pegInActivationTimeout

```ts
pegInActivationTimeout: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### maxHtlcOutputCount

```ts
maxHtlcOutputCount: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### expiredPegInGraceBlocks

```ts
expiredPegInGraceBlocks: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

Number of blocks added to the activation deadline as a grace window
during which a depositor may still reclaim an expired pegin via the
HTLC preimage. Source: `IProtocolParams.TBVProtocolParams.expiredPegInGraceBlocks`.

***

### VersionedOffchainParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

Versioned offchain parameters from the ProtocolParams contract.
Matches Solidity struct `IProtocolParams.VersionedOffchainParams` exactly.

bigint for: uint256 timelocks, uint64 fee rates/amounts.
number for: uint8/uint16/uint32 fields (bounded, safe for JS arithmetic).

#### Properties

##### timelockAssert

```ts
timelockAssert: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### timelockChallengeAssert

```ts
timelockChallengeAssert: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### securityCouncilKeys

```ts
securityCouncilKeys: `0x${string}`[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### councilQuorum

```ts
councilQuorum: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### feeRate

```ts
feeRate: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### babeTotalInstances

```ts
babeTotalInstances: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### babeInstancesToFinalize

```ts
babeInstancesToFinalize: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### minVpCommissionBps

```ts
minVpCommissionBps: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### tRefund

```ts
tRefund: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### tStale

```ts
tStale: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### minPeginFeeRate

```ts
minPeginFeeRate: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### proverCircuitVersion

```ts
proverCircuitVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### minPrepeginDepth

```ts
minPrepeginDepth: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

***

### PegInConfiguration

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

Combined peg-in configuration read atomically via multicall.
Prevents TOCTOU inconsistency if governance updates params between reads.

#### Properties

##### minimumPegInAmount

```ts
minimumPegInAmount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### maxPegInAmount

```ts
maxPegInAmount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### pegInAckTimeout

```ts
pegInAckTimeout: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### pegInActivationTimeout

```ts
pegInActivationTimeout: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### maxHtlcOutputCount

```ts
maxHtlcOutputCount: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### expiredPegInGraceBlocks

```ts
expiredPegInGraceBlocks: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### timelockPegin

```ts
timelockPegin: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### timelockRefund

```ts
timelockRefund: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### minVpCommissionBps

```ts
minVpCommissionBps: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### offchainParams

```ts
offchainParams: VersionedOffchainParams;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### offchainParamsVersion

```ts
offchainParamsVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

Version label paired atomically with `offchainParams`.
Read in the same multicall as the params struct so that, if a parameter
update lands between separate reads, the script-construction code and
the version label stay consistent.

##### activeVaultCoreVersion

```ts
activeVaultCoreVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

Currently-active vault core (tx-graph) version
(`ProtocolParams.activeVaultCoreVersion()`, uint16 ≥ 1). Stamped onto
every new vault at peg-in submission; fresh deposits must build this
graph version. Read in the same multicall so a governance version bump
can't land between reading the params and reading the version.

***

### AllOffchainParamsData

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

All offchain params snapshots indexed by version, plus the latest version
number known when the snapshot was taken. Used by consumers that need to
resolve any historical version (e.g. signing for an existing vault locked
to an older version).

#### Properties

##### byVersion

```ts
byVersion: Map<number, VersionedOffchainParams>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### latestVersion

```ts
latestVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

***

### ProtocolParamsReader

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

Interface for reading protocol parameters from the ProtocolParams contract.

#### Methods

##### getTBVProtocolParams()

```ts
getTBVProtocolParams(): Promise<TBVProtocolParams>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

###### Returns

`Promise`\<[`TBVProtocolParams`](#tbvprotocolparams)\>

##### getOffchainParamsByVersion()

```ts
getOffchainParamsByVersion(version): Promise<VersionedOffchainParams>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

###### Parameters

###### version

`number`

###### Returns

`Promise`\<[`VersionedOffchainParams`](#versionedoffchainparams)\>

##### getLatestOffchainParams()

```ts
getLatestOffchainParams(): Promise<VersionedOffchainParams>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

###### Returns

`Promise`\<[`VersionedOffchainParams`](#versionedoffchainparams)\>

##### getLatestOffchainParamsVersion()

```ts
getLatestOffchainParamsVersion(): Promise<number>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

###### Returns

`Promise`\<`number`\>

##### getTimelockPeginByVersion()

```ts
getTimelockPeginByVersion(version): Promise<number>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

###### Parameters

###### version

`number`

###### Returns

`Promise`\<`number`\>

##### getPegInConfiguration()

```ts
getPegInConfiguration(): Promise<PegInConfiguration>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

###### Returns

`Promise`\<[`PegInConfiguration`](#peginconfiguration)\>

##### getPeginActivationDelay()

```ts
getPeginActivationDelay(): Promise<bigint>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

Observation window enforced between a vault's final ACK and its
activation, in ETH blocks measured from `verifiedAt`. `0` disables it.

Deliberately its own read rather than a field on
[PegInConfiguration](#peginconfiguration): the parameter is absent from deployments that
predate it, so folding it into the shared multicall would make every
protocol-param read fail wherever it is missing.

###### Returns

`Promise`\<`bigint`\>

###### Throws

If the deployment does not expose `peginActivationDelay()`, or
  the decoded payload is not a `bigint`.

##### fetchAllOffchainParams()

```ts
fetchAllOffchainParams(onSkippedVersion?): Promise<AllOffchainParamsData>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

###### Parameters

###### onSkippedVersion?

[`OnSkippedOffchainParamsVersion`](#onskippedoffchainparamsversion)

###### Returns

`Promise`\<[`AllOffchainParamsData`](#alloffchainparamsdata)\>

***

### AddressBTCKeyPair

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

Matches Solidity struct `BTCVaultTypes.AddressBTCKeyPair` exactly.
Used for vault keepers and universal challengers.

#### Properties

##### ethAddress

```ts
ethAddress: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### btcPubKey

```ts
btcPubKey: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

***

### VaultKeeperReader

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

Interface for reading vault keepers from the ApplicationRegistry contract.

#### Methods

##### getVaultKeepersByVersion()

```ts
getVaultKeepersByVersion(appEntryPoint, version): Promise<AddressBTCKeyPair[]>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

###### Parameters

###### appEntryPoint

`` `0x${string}` ``

###### version

`number`

###### Returns

`Promise`\<[`AddressBTCKeyPair`](#addressbtckeypair)[]\>

##### getCurrentVaultKeepers()

```ts
getCurrentVaultKeepers(appEntryPoint): Promise<AddressBTCKeyPair[]>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

###### Parameters

###### appEntryPoint

`` `0x${string}` ``

###### Returns

`Promise`\<[`AddressBTCKeyPair`](#addressbtckeypair)[]\>

##### getCurrentVaultKeepersVersion()

```ts
getCurrentVaultKeepersVersion(appEntryPoint): Promise<number>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

###### Parameters

###### appEntryPoint

`` `0x${string}` ``

###### Returns

`Promise`\<`number`\>

***

### UniversalChallengerReader

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

Interface for reading universal challengers from the ProtocolParams contract.

#### Methods

##### getUniversalChallengersByVersion()

```ts
getUniversalChallengersByVersion(version): Promise<AddressBTCKeyPair[]>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

###### Parameters

###### version

`number`

###### Returns

`Promise`\<[`AddressBTCKeyPair`](#addressbtckeypair)[]\>

##### getCurrentUniversalChallengers()

```ts
getCurrentUniversalChallengers(): Promise<AddressBTCKeyPair[]>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

###### Returns

`Promise`\<[`AddressBTCKeyPair`](#addressbtckeypair)[]\>

##### getLatestUniversalChallengersVersion()

```ts
getLatestUniversalChallengersVersion(): Promise<number>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

###### Returns

`Promise`\<`number`\>

***

### OperationKeyQuery

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

The participants whose operation keys are being resolved, and the roster
they are resolved against.

A roster entry's `ethAddress` is the operator's **admin** address — the
lookup key for its key history — and its `btcPubKey` is the operator's
**genesis** key. Both are needed: the `...AtEpochOrGenesis` getters take the
roster key explicitly because the correct genesis for a keeper/challenger is
its key in the vault's *frozen membership version*, which an operator that
was later dropped from the roster no longer has a current entry for.

#### Properties

##### vaultProviderEthAddress

```ts
vaultProviderEthAddress: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### vaultProviderGenesisBtcPubkey

```ts
vaultProviderGenesisBtcPubkey: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

The VP's genesis (registration) key, from
[VaultRegistryReader.getVaultProviderGenesisBtcPubKey](#getvaultprovidergenesisbtcpubkey).

The VP has no roster entry to carry a genesis key the way keepers and
challengers do, so it is supplied here. Every call site already reads it:
it is what the indexer hint is compared against, and what makes the VP's
`rotated` flag mean the same thing as everyone else's.

##### applicationEntryPoint

```ts
applicationEntryPoint: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### vaultKeepers

```ts
vaultKeepers: readonly AddressBTCKeyPair[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

Keeper roster at the membership version being resolved against.

##### universalChallengers

```ts
universalChallengers: readonly AddressBTCKeyPair[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

Challenger roster at the membership version being resolved against.

***

### RawOperationKeys

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

Raw registry-returned operation keys, index-aligned with the query rosters.

#### Properties

##### vaultProvider

```ts
vaultProvider: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### vaultKeepers

```ts
vaultKeepers: `0x${string}`[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### universalChallengers

```ts
universalChallengers: `0x${string}`[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

***

### RawPayoutScripts

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

Registry-returned payout scriptPubKeys, index-aligned with the query
rosters. `universalChallengers` has no counterpart: a UC is never a claimer,
so it has no payout script.

#### Properties

##### vaultProvider

```ts
vaultProvider: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### vaultKeepers

```ts
vaultKeepers: `0x${string}`[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

***

### OperationKeyReader

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

Reads RFC-006 operation keys and payout scripts across all three registries
(BTCVaultRegistry, ApplicationRegistry, ProtocolParams).

Every method resolves the whole participant set in a **single** multicall so
the keys are pinned to one block. That atomicity is load-bearing: a rotation
landing between two `eth_call`s would yield a self-inconsistent key set that
builds a lock no counterparty agrees with.

#### Methods

##### getCurrentOperationKeys()

```ts
getCurrentOperationKeys(query): Promise<RawOperationKeys>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

Resolve every participant's *current* operation key.

Used for new peg-ins and for the VP auth pin. Needs no epoch read at all —
each registry's `getCurrentOperationBtcKey` resolves its own genesis
fallback, so an operator that never rotated yields its registration key.

###### Parameters

###### query

[`OperationKeyQuery`](#operationkeyquery)

###### Returns

`Promise`\<[`RawOperationKeys`](#rawoperationkeys)\>

##### getOperationKeysAtEpochs()

```ts
getOperationKeysAtEpochs(query, epochs): Promise<RawOperationKeys>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

Resolve every participant's operation key bonded at a vault's frozen
epochs. Used for every existing-vault path (resume, payout, refund).

###### Parameters

###### query

[`OperationKeyQuery`](#operationkeyquery)

###### epochs

[`KeyEpochs`](#keyepochs)

###### Returns

`Promise`\<[`RawOperationKeys`](#rawoperationkeys)\>

##### getPayoutScriptsAtEpochs()

```ts
getPayoutScriptsAtEpochs(query, epochs): Promise<RawPayoutScripts>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

Resolve the VP's commission payout script and each keeper's payout script
at a vault's frozen epochs.

The registry backfills BIP-86 P2TR of the epoch's operation key for any
operator that never called `setPayoutScript`, so this returns byte-identical
results to local BIP-86 derivation until an operator registers a custom
script.

###### Parameters

###### query

[`OperationKeyQuery`](#operationkeyquery)

###### epochs

[`KeyEpochs`](#keyepochs)

###### Returns

`Promise`\<[`RawPayoutScripts`](#rawpayoutscripts)\>

***

### AddressTx

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts)

Transaction summary from address transactions endpoint.

#### Properties

##### txid

```ts
txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts)

##### status

```ts
status: object;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts)

###### confirmed

```ts
confirmed: boolean;
```

###### block\_height?

```ts
optional block_height: number;
```

***

### MempoolUTXO

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

UTXO information from mempool API.

#### Properties

##### txid

```ts
txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

##### vout

```ts
vout: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

##### value

```ts
value: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

##### scriptPubKey

```ts
scriptPubKey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

##### confirmed

```ts
confirmed: boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

***

### TxInput

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

Transaction input from mempool API.

#### Properties

##### txid

```ts
txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

##### vout

```ts
vout: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

##### prevout

```ts
prevout: object;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

###### scriptpubkey

```ts
scriptpubkey: string;
```

###### scriptpubkey\_asm

```ts
scriptpubkey_asm: string;
```

###### scriptpubkey\_type

```ts
scriptpubkey_type: string;
```

###### scriptpubkey\_address

```ts
scriptpubkey_address: string;
```

###### value

```ts
value: number;
```

##### scriptsig

```ts
scriptsig: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

##### scriptsig\_asm

```ts
scriptsig_asm: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

##### witness

```ts
witness: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

##### is\_coinbase

```ts
is_coinbase: boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

##### sequence

```ts
sequence: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

***

### TxOutput

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

Transaction output from mempool API.

#### Properties

##### scriptpubkey

```ts
scriptpubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

##### scriptpubkey\_asm

```ts
scriptpubkey_asm: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

##### scriptpubkey\_type

```ts
scriptpubkey_type: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

##### scriptpubkey\_address

```ts
scriptpubkey_address: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

##### value

```ts
value: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

***

### TxStatus

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

Transaction status from mempool API.

#### Properties

##### confirmed

```ts
confirmed: boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

##### block\_height?

```ts
optional block_height: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

##### block\_hash?

```ts
optional block_hash: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

##### block\_time?

```ts
optional block_time: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

***

### OutspendStatus

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

Spend status of a single transaction output, from the esplora-compatible
`GET /tx/{txid}/outspend/{vout}` endpoint served by the mempool.space
backend.

Source: mempool/electrs `src/rest.rs` `SpendingValue` — an unspent output
serializes as `{ "spent": false }` (the optional fields use
`skip_serializing_if`); a spent output serializes as
`{ "spent": true, "txid", "vin", "status" }`.

#### Properties

##### spent

```ts
spent: boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

True when the output has been spent (mempool or a block).

##### txid?

```ts
optional txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

Spending transaction id; present only when `spent`.

##### vin?

```ts
optional vin: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

Input index within the spending tx; present only when `spent`.

##### status?

```ts
optional status: TxStatus;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

Confirmation status of the spending tx; present only when `spent`.

***

### TxInfo

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

Full transaction info from mempool API.

#### Properties

##### txid

```ts
txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

##### version

```ts
version: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

##### locktime

```ts
locktime: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

##### vin

```ts
vin: TxInput[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

##### vout

```ts
vout: TxOutput[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

##### size

```ts
size: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

##### weight

```ts
weight: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

##### fee

```ts
fee: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

##### status

```ts
status: TxStatus;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

***

### UtxoInfo

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

UTXO info for a specific output (used for PSBT construction).

Only supports Taproot (P2TR) and native SegWit (P2WPKH, P2WSH) script types.

#### Properties

##### txid

```ts
txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

##### vout

```ts
vout: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

##### value

```ts
value: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

##### scriptPubKey

```ts
scriptPubKey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

***

### NetworkFees

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

Bitcoin network fee recommendations (sat/vbyte) from mempool.space API.

#### See

https://mempool.space/docs/api/rest#get-recommended-fees

#### Properties

##### fastestFee

```ts
fastestFee: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

Next block (~10 min)

##### halfHourFee

```ts
halfHourFee: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

~30 minutes

##### hourFee

```ts
hourFee: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

~1 hour

##### economyFee

```ts
economyFee: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

Economy (no time guarantee)

##### minimumFee

```ts
minimumFee: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts)

Minimum network fee

***

### VaultProviderRpcClientOptions

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts)

#### Properties

##### timeout?

```ts
optional timeout: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts)

Timeout in milliseconds per request (default: 60000)

##### retries?

```ts
optional retries: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts)

Number of retry attempts for safe methods (default: 3)

##### retryDelay?

```ts
optional retryDelay: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts)

Initial retry delay in milliseconds (default: 1000)

##### retryableFor()?

```ts
optional retryableFor: (method) => boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts)

Custom retry predicate. Default retries only the idempotent read
methods: `getPeginStatus`, `batchGetPeginStatus`, `batchGetPegoutStatus`,
`requestDepositorPresignTransactions`.

###### Parameters

###### method

`string`

###### Returns

`boolean`

##### headers?

```ts
optional headers: Record<string, string>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts)

Custom headers.

##### tokenProvider?

```ts
optional tokenProvider: BearerTokenProvider;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts)

Per-request bearer-token source. A non-null return attaches
`Authorization: Bearer <token>`; `null` skips auth. Wire a
VpTokenProvider for depositor-gated methods.

##### maxResponseBytes?

```ts
optional maxResponseBytes: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts)

Maximum response body size, in bytes, for typed JSON-RPC calls

***

### AuthenticatedVpClientConfig

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/createAuthenticatedVpClient.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/createAuthenticatedVpClient.ts)

#### Properties

##### baseUrl

```ts
baseUrl: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/createAuthenticatedVpClient.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/createAuthenticatedVpClient.ts)

Base URL of the VP RPC endpoint (already proxied if applicable).

##### peginTxid

```ts
peginTxid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/createAuthenticatedVpClient.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/createAuthenticatedVpClient.ts)

Per-vault depositor-signed PegIn tx id (registry cache key).

##### authAnchorHex

```ts
authAnchorHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/createAuthenticatedVpClient.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/createAuthenticatedVpClient.ts)

Already-derived 32-byte auth-anchor preimage (64-char hex, no `0x`).

##### pinnedServerPubkey

```ts
pinnedServerPubkey: OnChainBtcPubkey;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/createAuthenticatedVpClient.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/createAuthenticatedVpClient.ts)

On-chain VP pubkey, branded so it can only come from the registry reader.

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/createAuthenticatedVpClient.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/createAuthenticatedVpClient.ts)

Depositor BTC pubkey (x-only or compressed hex). Normalized to
x-only and asserted against every issued token's CWT `aud` claim.

##### options?

```ts
optional options: VaultProviderRpcClientOptions;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/createAuthenticatedVpClient.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/createAuthenticatedVpClient.ts)

Optional outer-client tunables (timeout, retries, headers, etc.).

***

### PrimeVpAuthInput

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/primeVpAuth.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/primeVpAuth.ts)

#### Properties

##### baseUrl

```ts
baseUrl: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/primeVpAuth.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/primeVpAuth.ts)

##### peginTxid

```ts
peginTxid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/primeVpAuth.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/primeVpAuth.ts)

##### authAnchorHex

```ts
authAnchorHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/primeVpAuth.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/primeVpAuth.ts)

##### pinnedServerPubkey

```ts
pinnedServerPubkey: OnChainBtcPubkey;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/primeVpAuth.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/primeVpAuth.ts)

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/primeVpAuth.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/primeVpAuth.ts)

Depositor BTC pubkey (x-only or compressed hex). Normalized to
x-only and asserted against every issued token's CWT `aud` claim.

##### headers?

```ts
optional headers: Record<string, string>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/primeVpAuth.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/primeVpAuth.ts)

Optional headers forwarded to the inner token client (e.g. gateway auth).

***

### ServerIdentityResponse

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts)

Wire representation from btc-vault's `ServerIdentityResponse`.

#### Properties

##### server\_pubkey

```ts
server_pubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts)

Hex-encoded x-only (32-byte) persistent server pubkey.

##### ephemeral\_pubkey

```ts
ephemeral_pubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts)

Hex-encoded compressed (33-byte) ephemeral token-signing pubkey.

##### expires\_at

```ts
expires_at: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts)

Unix timestamp at which the ephemeral key expires.

##### signature

```ts
signature: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts)

Hex-encoded 64-byte BIP-322 Schnorr signature.

***

### VerifyServerIdentityInput

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts)

#### Properties

##### proof

```ts
proof: ServerIdentityResponse;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts)

The proof returned by `auth_createDepositorToken`.

##### pinnedServerPubkey

```ts
pinnedServerPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts)

The x-only persistent server pubkey the FE expects (sourced from
the on-chain `VaultProvider.btcPubKey` via the vault registry
reader). 64-char lowercase hex, no `0x` prefix.

##### now

```ts
now: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts)

Current Unix timestamp in seconds. Injected for testability.

##### maxLifetimeSecs?

```ts
optional maxLifetimeSecs: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts)

Cap on `proof.expires_at - now` (seconds). Defaults to DEFAULT\_MAX\_PROOF\_LIFETIME\_SECS.

***

### VpTokenRegistryInput

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenRegistry.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenRegistry.ts)

#### Properties

##### client

```ts
client: JsonRpcClient;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenRegistry.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenRegistry.ts)

##### peginTxid

```ts
peginTxid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenRegistry.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenRegistry.ts)

##### authAnchorHex

```ts
authAnchorHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenRegistry.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenRegistry.ts)

##### pinnedServerPubkey

```ts
pinnedServerPubkey: OnChainBtcPubkey;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenRegistry.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenRegistry.ts)

##### expectedAudienceXOnlyPubkey

```ts
expectedAudienceXOnlyPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenRegistry.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenRegistry.ts)

Depositor x-only pubkey (32-byte hex), asserted against each token's CWT `aud`.

***

### BatchResultEntry

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchAttribution.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchAttribution.ts)

Per-item entry in a VP batch response.

#### Type Parameters

##### T

`T`

#### Properties

##### pegin\_txid

```ts
pegin_txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchAttribution.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchAttribution.ts)

##### result

```ts
result: T | null;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchAttribution.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchAttribution.ts)

##### error

```ts
error: string | null;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchAttribution.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchAttribution.ts)

***

### BatchPollByProviderOptions

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchPoll.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchPoll.ts)

#### Type Parameters

##### TItem

`TItem`

##### TResult

`TResult`

#### Properties

##### items

```ts
items: TItem[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchPoll.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchPoll.ts)

Items to poll for this provider, e.g. `DepositToPoll[]`.

##### getTxid()

```ts
getTxid: (item) => string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchPoll.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchPoll.ts)

Extract the canonical txid for each item. Helper lowercases it.

###### Parameters

###### item

`TItem`

###### Returns

`string`

##### batchCall()

```ts
batchCall: (txids) => Promise<{
  results: readonly BatchResultEntry<TResult>[];
}>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchPoll.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchPoll.ts)

Per-chunk RPC call. Receives lowercased txids; returns the batch
envelope. Caller wraps `rpcClient.batchGet*Status({ pegin_txids })`.

###### Parameters

###### txids

`string`[]

###### Returns

`Promise`\<\{
  `results`: readonly [`BatchResultEntry`](#batchresultentry)\<`TResult`\>[];
\}\>

##### onItem()

```ts
onItem: (item, envelope) => void;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchPoll.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchPoll.ts)

Handle a per-item envelope. Exactly one of `result` / `error` is
populated (validator invariant). Caller decides UI state, logging,
etc. Not invoked for txids surfaced via [onDuplicate](#onduplicate).

Note: `envelope.pegin_txid` is the lowercased txid the helper
sent in the request, not whatever case/encoding the server echoed.

###### Parameters

###### item

`TItem`

###### envelope

[`BatchResultEntry`](#batchresultentry)\<`TResult`\>

###### Returns

`void`

##### onMissing()

```ts
onMissing: (item) => void;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchPoll.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchPoll.ts)

Server omitted this item from the response.

###### Parameters

###### item

`TItem`

###### Returns

`void`

##### onDuplicate()

```ts
onDuplicate: (item) => void;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchPoll.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchPoll.ts)

Server returned this item more than once. Caller picks UI state.

###### Parameters

###### item

`TItem`

###### Returns

`void`

##### onDuplicateBatch()?

```ts
optional onDuplicateBatch: (count) => void;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchPoll.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchPoll.ts)

Optional aggregate signal for an entire chunk where the server
returned duplicates. Fires once per chunk (only if `count > 0`)
AFTER all per-item `onDuplicate` dispatches. Caller typically logs
the count alongside the provider name.

###### Parameters

###### count

`number`

###### Returns

`void`

##### onWholeBatchError()

```ts
onWholeBatchError: (chunk, error) => void;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchPoll.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchPoll.ts)

The whole chunk's RPC call failed (transport or response
validation). Receives the chunk and the error. Caller decides how
to project that onto per-item state.

###### Parameters

###### chunk

`TItem`[]

###### error

`unknown`

###### Returns

`void`

##### onUnexpected()?

```ts
optional onUnexpected: (echoedTxids) => void;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchPoll.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchPoll.ts)

Server returned txids that were not in the request. Caller
typically logs the count for observability — there's no recovery
action since the original request items are unaffected. Optional;
defaults to no-op.

###### Parameters

###### echoedTxids

`string`[]

###### Returns

`void`

##### batchSize?

```ts
optional batchSize: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchPoll.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchPoll.ts)

Maximum items per RPC call. Defaults to [VP\_BATCH\_MAX\_SIZE](#vp_batch_max_size).
Exposed for tests so chunking can be exercised without 50+
fixtures.

***

### BearerTokenProvider

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts)

Injects bearer tokens into requests for auth-gated methods, and is
notified when the server rejects a bearer so it can invalidate its cache.

The `JsonRpcClient` is agnostic to which methods are auth-gated —
the provider's `getToken(method)` decides. Returning `null` means
"no auth required for this method"; the client then sends the
request with no `Authorization` header.

#### Methods

##### getToken()

```ts
getToken(method): Promise<string | null>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts)

Return the bearer token to inject for `method`, or `null` if the
method does not require auth.

###### Parameters

###### method

`string`

###### Returns

`Promise`\<`string` \| `null`\>

##### invalidate()

```ts
invalidate(): void;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts)

Drop the cached token. Next call to `getToken` must re-acquire.
Called by the client on reactive-refresh-trigger responses.

###### Returns

`void`

***

### JsonRpcClientConfig

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts)

#### Properties

##### baseUrl

```ts
baseUrl: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts)

Base URL of the RPC service

##### timeout

```ts
timeout: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts)

Timeout in milliseconds per request attempt

##### headers?

```ts
optional headers: Record<string, string>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts)

Optional custom headers

##### retries?

```ts
optional retries: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts)

Number of retry attempts for transient errors (default: 3)

##### retryDelay?

```ts
optional retryDelay: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts)

Initial retry delay in milliseconds (default: 1000)

##### maxResponseBytes?

```ts
optional maxResponseBytes: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts)

Maximum response body size, in bytes, for typed JSON-RPC calls.
`callRaw` intentionally returns the unparsed Response and is not capped here.
Default: 2 MiB.

##### retryableFor()?

```ts
optional retryableFor: (method) => boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts)

Predicate that decides which methods retry on transient errors.
Default retries only `getPeginStatus`, `batchGetPeginStatus`,
`batchGetPegoutStatus`, and `requestDepositorPresignTransactions`.
Write methods are not retried by default.

###### Parameters

###### method

`string`

###### Returns

`boolean`

##### tokenProvider?

```ts
optional tokenProvider: BearerTokenProvider;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts)

Per-request bearer-token source. A non-null return attaches
`Authorization: Bearer <token>`; `null` skips auth. `call`
additionally retries once when the server rejects the bearer
(invalidate + refetch + retry) — see [isAuthRejectedError](#isauthrejectederror).
`callRaw` skips reactive refresh.

***

### WotsConfig

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

WOTS configuration for a single block.
Matches Rust `babe::wots::Config` serde format.

#### Properties

##### d

```ts
d: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

Digit bit-width (e.g. 4 → base-16 digits).

##### n

```ts
n: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

Number of message digits in this block.

##### checksum\_radix

```ts
checksum_radix: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

Radix used for the checksum computation.

***

### WotsBlockPublicKey

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

A single block of WOTS public keys.
Chain values are arrays of byte values (matching Rust `[u8; 20]`).

#### Properties

##### config

```ts
config: WotsConfig;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### message\_terminals

```ts
message_terminals: number[][];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### checksum\_major\_terminal

```ts
checksum_major_terminal: number[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### checksum\_minor\_terminal

```ts
checksum_minor_terminal: number[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

***

### RequestDepositorPresignTransactionsParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

Params for requesting the payout/claim/assert transactions to pre-sign.

#### Properties

##### pegin\_txid

```ts
pegin_txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### depositor\_pk

```ts
depositor_pk: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

***

### SubmitDepositorWotsKeyParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

Params for submitting the depositor's WOTS public key to the VP.

#### Properties

##### pegin\_txid

```ts
pegin_txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### depositor\_pk

```ts
depositor_pk: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### wots\_public\_keys

```ts
wots_public_keys: WotsBlockPublicKey[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

***

### DepositorPreSigsPerChallenger

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

Per-challenger signatures for the depositor-as-claimer flow.

#### Properties

##### nopayout\_signature

```ts
nopayout_signature: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

***

### DepositorAsClaimerPresignatures

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

Depositor-as-claimer pre-signatures (payout + per-challenger).

#### Properties

##### payout\_signatures

```ts
payout_signatures: ClaimerSignatures;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### per\_challenger

```ts
per_challenger: Record<string, DepositorPreSigsPerChallenger>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

***

### SubmitDepositorPresignaturesParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

Params for submitting depositor pre-signatures including claimer presignatures.

#### Properties

##### pegin\_txid

```ts
pegin_txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### depositor\_pk

```ts
depositor_pk: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### signatures

```ts
signatures: Record<string, ClaimerSignatures>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### depositor\_claimer\_presignatures

```ts
depositor_claimer_presignatures: DepositorAsClaimerPresignatures;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

***

### ClaimerSignatures

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

Payout signatures per claimer.

#### Properties

##### payout\_signature

```ts
payout_signature: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

***

### RequestDepositorClaimerArtifactsParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

Params for requesting BaBe DecryptorArtifacts from the VP.

#### Properties

##### pegin\_txid

```ts
pegin_txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### depositor\_pk

```ts
depositor_pk: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

***

### TransactionData

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

A raw Bitcoin transaction with its hex encoding.

#### Properties

##### tx\_hex

```ts
tx_hex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

***

### ClaimerTransactions

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

Set of transactions the depositor must pre-sign for a single claimer.

#### Properties

##### claimer\_pubkey

```ts
claimer_pubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### claim\_tx

```ts
claim_tx: TransactionData;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### assert\_tx

```ts
assert_tx: TransactionData;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### payout\_tx

```ts
payout_tx: TransactionData;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### payout\_psbt

```ts
payout_psbt: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

***

### ChallengeAssertConnectorData

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

Per-segment connector data for ChallengeAssert inputs.

#### Properties

##### wots\_pks\_json

```ts
wots_pks_json: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### gc\_wots\_keys\_json

```ts
gc_wots_keys_json: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

***

### PresignDataPerChallenger

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

Challenger-specific transactions and signing data for the depositor graph.

#### Properties

##### challenger\_pubkey

```ts
challenger_pubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### challenge\_assert\_x\_tx

```ts
challenge_assert_x_tx: TransactionData;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### challenge\_assert\_y\_tx

```ts
challenge_assert_y_tx: TransactionData;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### nopayout\_tx

```ts
nopayout_tx: TransactionData;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### nopayout\_psbt

```ts
nopayout_psbt: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### challenge\_assert\_connectors

```ts
challenge_assert_connectors: ChallengeAssertConnectorData[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### output\_label\_hashes

```ts
output_label_hashes: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

***

### DepositorGraphTransactions

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

Depositor-as-claimer TxGraph transactions.

#### Properties

##### claim\_tx

```ts
claim_tx: TransactionData;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### assert\_tx

```ts
assert_tx: TransactionData;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### payout\_tx

```ts
payout_tx: TransactionData;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### payout\_psbt

```ts
payout_psbt: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### challenger\_presign\_data

```ts
challenger_presign_data: PresignDataPerChallenger[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### offchain\_params\_version

```ts
offchain_params_version: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

***

### RequestDepositorPresignTransactionsResponse

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

Response from `requestDepositorPresignTransactions`.

#### Properties

##### txs

```ts
txs: ClaimerTransactions[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### depositor\_graph

```ts
depositor_graph: DepositorGraphTransactions;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

***

### BaBeSessionData

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

BaBe garbled-circuit session data for a single challenger.

#### Properties

##### decryptor\_artifacts\_hex

```ts
decryptor_artifacts_hex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

***

### RequestDepositorClaimerArtifactsResponse

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

Response from `requestDepositorClaimerArtifacts`.

#### Properties

##### tx\_graph\_json

```ts
tx_graph_json: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### verifying\_key\_hex

```ts
verifying_key_hex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### babe\_sessions

```ts
babe_sessions: Record<string, BaBeSessionData>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

***

### ChallengerProgress

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

Progress tracker for a multi-challenger operation.

#### Extended by

- [`PresigningProgress`](#presigningprogress)

#### Properties

##### total\_challengers

```ts
total_challengers: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### completed\_challengers

```ts
completed_challengers: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### completed\_challenger\_pubkeys

```ts
completed_challenger_pubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### pending\_challenger\_pubkeys

```ts
pending_challenger_pubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

***

### PresigningProgress

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

Extended presigning progress with all 3 concurrent phases.

#### Extends

- [`ChallengerProgress`](#challengerprogress)

#### Properties

##### total\_challengers

```ts
total_challengers: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

###### Inherited from

[`ChallengerProgress`](#challengerprogress).[`total_challengers`](#total_challengers)

##### completed\_challengers

```ts
completed_challengers: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

###### Inherited from

[`ChallengerProgress`](#challengerprogress).[`completed_challengers`](#completed_challengers)

##### completed\_challenger\_pubkeys

```ts
completed_challenger_pubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

###### Inherited from

[`ChallengerProgress`](#challengerprogress).[`completed_challenger_pubkeys`](#completed_challenger_pubkeys)

##### pending\_challenger\_pubkeys

```ts
pending_challenger_pubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

###### Inherited from

[`ChallengerProgress`](#challengerprogress).[`pending_challenger_pubkeys`](#pending_challenger_pubkeys)

##### depositor\_graph\_created?

```ts
optional depositor_graph_created: boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### vk\_challenger\_presigning\_completed?

```ts
optional vk_challenger_presigning_completed: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### vk\_challenger\_presigning\_total?

```ts
optional vk_challenger_presigning_total: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

***

### PeginProgressDetails

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

Detailed progress breakdown for an in-progress pegin.

#### Properties

##### gc\_data?

```ts
optional gc_data: ChallengerProgress;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### presigning?

```ts
optional presigning: PresigningProgress;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### ack\_collection?

```ts
optional ack_collection: ChallengerProgress;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### claimer\_graphs?

```ts
optional claimer_graphs: ClaimerGraphStatus[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

***

### ClaimerGraphStatus

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

Per-claimer graph status (challenger perspective).

#### Properties

##### claimer\_pubkey

```ts
claimer_pubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### presigned

```ts
presigned: boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

***

### GetPeginStatusResponse

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

Response from `getPeginStatus`.

#### Properties

##### pegin\_txid

```ts
pegin_txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### status

```ts
status: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### progress

```ts
progress: PeginProgressDetails;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### health\_info

```ts
health_info: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### last\_error?

```ts
optional last_error: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

***

### ClaimerPegoutStatus

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

Claimer-side pegout progress.
Source: btc-vault crates/vaultd/src/rpc/server/pegout_status.rs ClaimerPegoutStatus.

#### Properties

##### status

```ts
status: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

Wire string from PegoutStatus enum.

##### failed

```ts
failed: boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### claim\_txid

```ts
claim_txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### claimer\_pubkey

```ts
claimer_pubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### assert\_txid

```ts
assert_txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### created\_at

```ts
created_at: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

Unix epoch seconds.

##### updated\_at

```ts
updated_at: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

Unix epoch seconds.

***

### ChallengerStatus

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

Challenger-side pegout progress.
Source: btc-vault crates/vaultd/src/rpc/server/pegout_status.rs ChallengerStatus.

#### Properties

##### status

```ts
status: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### claim\_txid

```ts
claim_txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### claimer\_pubkey

```ts
claimer_pubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### assert\_txid

```ts
assert_txid: string | null;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### challenge\_assert\_x\_txid

```ts
challenge_assert_x_txid: string | null;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### challenge\_assert\_y\_txid

```ts
challenge_assert_y_txid: string | null;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### nopayout\_txid

```ts
nopayout_txid: string | null;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### created\_at

```ts
created_at: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### updated\_at

```ts
updated_at: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

***

### GetPegoutStatusResponse

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

Pegout status response. Embedded by `batchGetPegoutStatus` per-result
envelopes. Mirrors btc-vault `GetPegoutStatusResponse`.

#### Properties

##### pegin\_txid

```ts
pegin_txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### found

```ts
found: boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### claimer

```ts
claimer: ClaimerPegoutStatus | null;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### challengers

```ts
challengers: ChallengerStatus[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

***

### BatchGetPeginStatusParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

Params for `batchGetPeginStatus`.

#### Properties

##### pegin\_txids

```ts
pegin_txids: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

Up to MAX_BATCH_SIZE (50) txids per call.

***

### BatchPeginStatusResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

Per-pegin entry in a `batchGetPeginStatus` response.

#### Properties

##### pegin\_txid

```ts
pegin_txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### result

```ts
result: GetPeginStatusResponse | null;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### error

```ts
error: string | null;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

***

### BatchGetPeginStatusResponse

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

Response from `batchGetPeginStatus`. Results are returned in request order.

#### Properties

##### results

```ts
results: BatchPeginStatusResult[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

***

### BatchGetPegoutStatusParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

Params for `batchGetPegoutStatus`.

#### Properties

##### pegin\_txids

```ts
pegin_txids: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

***

### BatchPegoutStatusResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

Per-vault entry in a `batchGetPegoutStatus` response.

#### Properties

##### pegin\_txid

```ts
pegin_txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### result

```ts
result: GetPegoutStatusResponse | null;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### error

```ts
error: string | null;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

***

### BatchGetPegoutStatusResponse

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

Response from `batchGetPegoutStatus`. Results are returned in request order.

#### Properties

##### results

```ts
results: BatchPegoutStatusResult[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

## Type Aliases

### OnChainBtcPubkey

```ts
type OnChainBtcPubkey = string & object;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

64-char lowercase hex (no `0x`) x-only BTC pubkey sourced from an on-chain
registry. Minted only by `assertOnChainBtcPubkey`, which is the shared
validator behind both producers:
[VaultRegistryReader.getVaultProviderGenesisBtcPubKey](#getvaultprovidergenesisbtcpubkey) (the fixed
registration key) and [OperationKeyReader](#operationkeyreader) (RFC-006 operation keys,
resolved current or at a vault's frozen epoch).

#### Type Declaration

##### \[onChainBtcPubkeyBrand\]

```ts
readonly [onChainBtcPubkeyBrand]: true;
```

#### Stability

frozen

***

### OnSkippedOffchainParamsVersion()

```ts
type OnSkippedOffchainParamsVersion = (version, error) => void;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

Optional observer invoked by `fetchAllOffchainParams` when a historical
version fails validation. Called once per skipped version so callers can
log/telemeter without coupling the SDK to a specific logger.

#### Parameters

##### version

`number`

##### error

`Error`

#### Returns

`void`

***

### JsonRpcErrorSource

```ts
type JsonRpcErrorSource = "wire" | "local";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts)

***

### GetPeginStatusParams

```ts
type GetPeginStatusParams = 
  | {
  pegin_txid: string;
  vault_id?: never;
}
  | {
  vault_id: string;
  pegin_txid?: never;
};
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

Params for querying pegin status. Either pegin_txid or vault_id must be provided.

***

### GcDataProgress

```ts
type GcDataProgress = ChallengerProgress;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

***

### AckCollectionProgress

```ts
type AckCollectionProgress = ChallengerProgress;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

## Functions

### resolveProtocolAddresses()

```ts
function resolveProtocolAddresses(publicClient, btcVaultRegistryAddress): Promise<ProtocolAddresses>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/contract-address-resolver.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/contract-address-resolver.ts)

Resolve ProtocolParams and ApplicationRegistry addresses from BTCVaultRegistry.

Uses a single multicall for atomicity and efficiency.

#### Parameters

##### publicClient

viem PublicClient instance

##### btcVaultRegistryAddress

`` `0x${string}` ``

Address of the BTCVaultRegistry contract

#### Returns

`Promise`\<[`ProtocolAddresses`](#protocoladdresses)\>

Resolved contract addresses

***

### assertOnChainBtcPubkey()

```ts
function assertOnChainBtcPubkey(value, label): OnChainBtcPubkey;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/onChainBtcPubkey.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/onChainBtcPubkey.ts)

Validate a registry-returned `bytes32` as an x-only BTC pubkey and mint the
brand. Checks length, hex form, and secp256k1 curve membership. Returns
64-char lowercase hex without the `0x` prefix.

`label` identifies the read site in error messages (e.g.
`getOperationBtcKeyAtEpoch (vp=0x…, epoch=0)`), so a failure names which
participant and which getter produced it.

A zero hash fails the curve check, so an unregistered operator or an epoch
with no bonded key surfaces as an error rather than a silent all-zero key.

#### Parameters

##### value

`` `0x${string}` ``

##### label

`string`

#### Returns

[`OnChainBtcPubkey`](#onchainbtcpubkey)

***

### calculateBtcTxHash()

```ts
function calculateBtcTxHash(transactionHex): `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-transaction.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-transaction.ts)

Calculate a Bitcoin txid without importing bitcoinjs-lib.

#### Parameters

##### transactionHex

`string`

#### Returns

`` `0x${string}` ``

***

### derivePeginVaultId()

```ts
function derivePeginVaultId(peginTxHash, depositor): string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-transaction.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-transaction.ts)

Derive the Solidity vault ID without loading the Rust/WASM package.

Inputs accept an optional `0x` prefix to match the current PeginManager
call sites. Address validation stays strict: lowercase and valid EIP-55
addresses pass, while uppercase and incorrectly checksummed mixed-case
addresses fail. The synchronous result is lowercase hex without a prefix,
matching the WASM helper that this function replaces.

#### Parameters

##### peginTxHash

`string`

##### depositor

`string`

#### Returns

`string`

***

### validateOffchainParams()

```ts
function validateOffchainParams(params): void;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-validation.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-validation.ts)

Validate offchain params consistency and bounds.

#### Parameters

##### params

[`VersionedOffchainParams`](#versionedoffchainparams)

#### Returns

`void`

#### Throws

Error on invalid values to prevent constructing invalid Bitcoin scripts.

***

### validateTBVProtocolParams()

```ts
function validateTBVProtocolParams(params): void;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-validation.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-validation.ts)

Validate TBV protocol params returned from the contract.

#### Parameters

##### params

[`TBVProtocolParams`](#tbvprotocolparams)

#### Returns

`void`

#### Throws

Error on invalid amounts or out-of-range bounded fields.

***

### validatePegInConfiguration()

```ts
function validatePegInConfiguration(config): void;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-validation.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-validation.ts)

Validate the full peg-in configuration after assembly.
Checks both TBV params and offchain params consistency, and the
top-level `offchainParamsVersion` (which originates from a separate
multicall result and so must be range-checked alongside the params it
names).

#### Parameters

##### config

[`PegInConfiguration`](#peginconfiguration)

#### Returns

`void`

***

### pushTx()

```ts
function pushTx(txHex, apiUrl): Promise<string>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts)

Push a signed transaction to the Bitcoin network.

#### Parameters

##### txHex

`string`

The signed transaction hex string

##### apiUrl

`string`

Mempool API base URL

#### Returns

`Promise`\<`string`\>

The transaction ID

#### Throws

Error if broadcasting fails

***

### getTxInfo()

```ts
function getTxInfo(txid, apiUrl): Promise<TxInfo>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts)

Get transaction information from mempool.

#### Parameters

##### txid

`string`

The transaction ID

##### apiUrl

`string`

Mempool API base URL

#### Returns

`Promise`\<[`TxInfo`](#txinfo)\>

Transaction information

***

### getTipHeight()

```ts
function getTipHeight(apiUrl): Promise<number>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts)

Get the current block tip height.

Source: mempool.space API — `GET /api/blocks/tip/height` returns the height
of the most recent block as a plain-text integer.

#### Parameters

##### apiUrl

`string`

Mempool API base URL

#### Returns

`Promise`\<`number`\>

The height of the most recent block

#### Throws

Error if the response is not a whole number

***

### getOutspend()

```ts
function getOutspend(
   txid, 
   vout, 
apiUrl): Promise<OutspendStatus>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts)

Get the spend status of a specific transaction output.

Calls the esplora-compatible `GET /tx/{txid}/outspend/{vout}` endpoint
(mempool.space backend, mempool/electrs `rest.rs`). Returns
`{ spent: false }` for an unspent output, or
`{ spent: true, txid, vin, status }` when the output has been spent.

#### Parameters

##### txid

`string`

The transaction id whose output is being checked (no 0x prefix)

##### vout

`number`

The output index

##### apiUrl

`string`

Mempool API base URL

#### Returns

`Promise`\<[`OutspendStatus`](#outspendstatus)\>

The output's spend status

***

### getTxHex()

```ts
function getTxHex(txid, apiUrl): Promise<string>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts)

Get the hex representation of a transaction.

#### Parameters

##### txid

`string`

The transaction ID

##### apiUrl

`string`

Mempool API base URL

#### Returns

`Promise`\<`string`\>

The transaction hex string

#### Throws

Error if the request fails or transaction is not found

***

### getUtxoInfo()

```ts
function getUtxoInfo(
   txid, 
   vout, 
apiUrl): Promise<UtxoInfo>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts)

Get UTXO information for a specific transaction output.

This is used for constructing PSBTs where we need the witnessUtxo data.
Only supports Taproot (P2TR) and native SegWit (P2WPKH, P2WSH) script types.

#### Parameters

##### txid

`string`

The transaction ID containing the UTXO

##### vout

`number`

The output index

##### apiUrl

`string`

Mempool API base URL

#### Returns

`Promise`\<[`UtxoInfo`](#utxoinfo)\>

UTXO information with value and scriptPubKey

***

### getAddressUtxos()

```ts
function getAddressUtxos(address, apiUrl): Promise<MempoolUTXO[]>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts)

Get all UTXOs for a Bitcoin address.

#### Parameters

##### address

`string`

The Bitcoin address

##### apiUrl

`string`

Mempool API base URL

#### Returns

`Promise`\<[`MempoolUTXO`](#mempoolutxo)[]\>

Array of UTXOs sorted by value (largest first)

***

### getMempoolApiUrl()

```ts
function getMempoolApiUrl(network): string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts)

Get the mempool API URL for a given network.

#### Parameters

##### network

Bitcoin network (mainnet, testnet, signet)

`"mainnet"` | `"testnet"` | `"signet"`

#### Returns

`string`

The mempool API URL

***

### getAddressTxs()

```ts
function getAddressTxs(address, apiUrl): Promise<AddressTx[]>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts)

Get recent transactions for a Bitcoin address.

Returns the last 25 confirmed transactions plus any unconfirmed (mempool) transactions.
This is useful for checking if a specific transaction has been broadcast.

#### Parameters

##### address

`string`

The Bitcoin address

##### apiUrl

`string`

Mempool API base URL

#### Returns

`Promise`\<[`AddressTx`](#addresstx)[]\>

Array of recent transactions

***

### getNetworkFees()

```ts
function getNetworkFees(apiUrl): Promise<NetworkFees>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts)

Fetches Bitcoin network fee recommendations from mempool.space API.

#### Parameters

##### apiUrl

`string`

Mempool API base URL

#### Returns

`Promise`\<[`NetworkFees`](#networkfees)\>

Fee rates in sat/vbyte for different confirmation times

#### Throws

Error if request fails or returns invalid data

#### See

https://mempool.space/docs/api/rest#get-recommended-fees

***

### createAuthenticatedVpClient()

```ts
function createAuthenticatedVpClient(config): VaultProviderRpcClient;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/createAuthenticatedVpClient.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/createAuthenticatedVpClient.ts)

#### Parameters

##### config

[`AuthenticatedVpClientConfig`](#authenticatedvpclientconfig)

#### Returns

[`VaultProviderRpcClient`](#vaultproviderrpcclient)

***

### primeVpTokenRegistry()

```ts
function primeVpTokenRegistry(input): void;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/primeVpAuth.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/primeVpAuth.ts)

#### Parameters

##### input

[`PrimeVpAuthInput`](#primevpauthinput)

#### Returns

`void`

***

### verifyServerIdentity()

```ts
function verifyServerIdentity(input): void;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts)

Verify a server identity proof against a pinned server pubkey.

Checks:
  1. `server_pubkey` matches the pin.
  2. `now < expires_at <= now + maxLifetimeSecs` (with integer guards).
  3. `ephemeral_pubkey` is a well-formed 33-byte compressed pubkey.
  4. `signature` is a well-formed 64-byte Schnorr hex string.
  5. The BIP-322 Schnorr signature cryptographically verifies
     against `server_pubkey` over the CBOR-encoded tuple
     `(SERVER_IDENTITY_DOMAIN, ephemeral_pubkey, expires_at)`.

Step 5 is what actually binds the ephemeral key to the persistent
pubkey — without it, a TLS-MITM attacker who reads the pinned
pubkey from the on-chain registry could substitute an arbitrary
ephemeral pubkey paired with any lexically-valid signature.

#### Parameters

##### input

[`VerifyServerIdentityInput`](#verifyserveridentityinput)

#### Returns

`void`

#### Throws

ServerIdentityError on any validation failure.

***

### batchPollByProvider()

```ts
function batchPollByProvider<TItem, TResult>(options): Promise<void>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchPoll.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchPoll.ts)

#### Type Parameters

##### TItem

`TItem`

##### TResult

`TResult`

#### Parameters

##### options

[`BatchPollByProviderOptions`](#batchpollbyprovideroptions)\<`TItem`, `TResult`\>

#### Returns

`Promise`\<`void`\>

***

### isAuthRejectedError()

```ts
function isAuthRejectedError(error): boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts)

True when `error` is the vault provider rejecting our bearer token.

Classified on the error code, which is the only thing the server
guarantees: its auth errors carry `data: null` unconditionally
(`rpc_error` passes `None::<()>`), so any predicate keyed on an
`error.data` field can never match a real response.

`source === "wire"` is load-bearing: this client reuses -32001
internally as [JSON\_RPC\_ERROR\_CODES.NETWORK](#network), always with
source "local".

Known, bounded collision: the vault-provider proxy reuses -32001 for
"Provider not found". A call to a deregistered provider therefore
costs one wasted token-mint round-trip, which fails against the same
registry check and surfaces the same message.

#### Parameters

##### error

`unknown`

#### Returns

`boolean`

***

### validateRequestDepositorClaimerArtifactsResponse()

```ts
function validateRequestDepositorClaimerArtifactsResponse(response): asserts response is RequestDepositorClaimerArtifactsResponse;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/validators.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/validators.ts)

Validate a requestDepositorClaimerArtifacts response.

#### Parameters

##### response

`unknown`

#### Returns

`asserts response is RequestDepositorClaimerArtifactsResponse`

## Enumerations

### OnChainBtcVaultStatus

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

Mirrors `IBTCVaultRegistry.BTCVaultStatus` in BTCVaultRegistry.sol exactly.
Use this when consuming `status` from `getVaultBasicInfo` /
`getBtcVaultBasicInfo`.

Do NOT confuse with the app-side `ContractStatus` enum
(`services/deposit/peginState.ts`) — that one is for the indexer and
extends this with values 5-7, reassigning 4 to LIQUIDATED. Reading an
on-chain status through `ContractStatus[n]` for labels will mislabel
Expired(4) as LIQUIDATED.

#### Enumeration Members

##### PENDING

```ts
PENDING: 0;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### VERIFIED

```ts
VERIFIED: 1;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### ACTIVE

```ts
ACTIVE: 2;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### REDEEMED

```ts
REDEEMED: 3;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

##### EXPIRED

```ts
EXPIRED: 4;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts)

***

### DaemonStatus

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

Backend daemon status (vault provider database).
Source: btc-vault crates/vaultd/src/workers/claimer/mod.rs PegInStatus enum

State flow (happy path):
PendingIngestion -> PendingDepositorWotsPK -> PendingBabeSetup -> PendingChallengerPresigning
  -> PendingPeginSigsAvailability -> PendingPrePegInConfirmations
  -> PendingDepositorSignatures -> PendingACKs -> PendingActivation
  -> ActivatedPendingBroadcast -> Activated

Branching / terminal states:
- IngestionRejected: terminal — ingestion permanently failed (e.g. malformed
  Pre-PegIn, invalid HTLC outputs); reachable directly from PendingIngestion.
- Expired: activation timed out; non-terminal during the grace window
  (RFC 003) — transitions to ExpiredCleanedUp or ExpiredInClaim.
- InvalidSigInContract: terminal — pegin input signature posted on
  chain failed verification.
- AmlRejected: terminal — AML address screening rejected the pegin.
- ExpiredCleanedUp: terminal — grace window expired, per-pegin
  artifacts deleted.
- ExpiredInClaim: terminal at the pegin-state-machine level; pegout-side
  work continues on the pegout_tracking row.

#### Enumeration Members

##### PENDING\_INGESTION

```ts
PENDING_INGESTION: "PendingIngestion";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### PENDING\_DEPOSITOR\_WOTS\_PK

```ts
PENDING_DEPOSITOR_WOTS_PK: "PendingDepositorWotsPK";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### PENDING\_BABE\_SETUP

```ts
PENDING_BABE_SETUP: "PendingBabeSetup";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### PENDING\_CHALLENGER\_PRESIGNING

```ts
PENDING_CHALLENGER_PRESIGNING: "PendingChallengerPresigning";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### PENDING\_PEGIN\_SIGS\_AVAILABILITY

```ts
PENDING_PEGIN_SIGS_AVAILABILITY: "PendingPeginSigsAvailability";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### PENDING\_PRE\_PEGIN\_CONFIRMATIONS

```ts
PENDING_PRE_PEGIN_CONFIRMATIONS: "PendingPrePegInConfirmations";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### PENDING\_DEPOSITOR\_SIGNATURES

```ts
PENDING_DEPOSITOR_SIGNATURES: "PendingDepositorSignatures";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### PENDING\_ACKS

```ts
PENDING_ACKS: "PendingACKs";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### PENDING\_ACTIVATION

```ts
PENDING_ACTIVATION: "PendingActivation";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### ACTIVATED\_PENDING\_BROADCAST

```ts
ACTIVATED_PENDING_BROADCAST: "ActivatedPendingBroadcast";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### ACTIVATED

```ts
ACTIVATED: "Activated";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### EXPIRED

```ts
EXPIRED: "Expired";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### INGESTION\_REJECTED

```ts
INGESTION_REJECTED: "IngestionRejected";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### INVALID\_SIG\_IN\_CONTRACT

```ts
INVALID_SIG_IN_CONTRACT: "InvalidSigInContract";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### AML\_REJECTED

```ts
AML_REJECTED: "AmlRejected";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### EXPIRED\_CLEANED\_UP

```ts
EXPIRED_CLEANED_UP: "ExpiredCleanedUp";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

##### EXPIRED\_IN\_CLAIM

```ts
EXPIRED_IN_CLAIM: "ExpiredInClaim";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

***

### RpcErrorCode

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

JSON-RPC error codes returned by the vault provider.
Source: btc-vault `crates/vaultd/src/rpc/error.rs::RpcError::error_code`.

#### Enumeration Members

##### PEGIN\_NOT\_FOUND

```ts
PEGIN_NOT_FOUND: 4001;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

## References

### PopSignature

Re-exports [PopSignature](managers.md#popsignature)

***

### assertValidVaultCoreVersion

Re-exports [assertValidVaultCoreVersion](primitives.md#assertvalidvaultcoreversion)

## Variables

### MEMPOOL\_API\_URLS

```ts
const MEMPOOL_API_URLS: object;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts)

Default mempool API URLs by network.

#### Type Declaration

##### mainnet

```ts
readonly mainnet: "https://mempool.space/api" = "https://mempool.space/api";
```

##### testnet

```ts
readonly testnet: "https://mempool.space/testnet/api" = "https://mempool.space/testnet/api";
```

##### signet

```ts
readonly signet: "https://mempool.space/signet/api" = "https://mempool.space/signet/api";
```

***

### vpTokenRegistry

```ts
const vpTokenRegistry: VpTokenRegistryPublic;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenRegistry.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenRegistry.ts)

***

### JSON\_RPC\_ERROR\_CODES

```ts
const JSON_RPC_ERROR_CODES: object;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts)

#### Type Declaration

##### TIMEOUT

```ts
readonly TIMEOUT: -32000 = -32000;
```

##### NETWORK

```ts
readonly NETWORK: -32001 = -32001;
```

##### PROXY\_TIMEOUT

```ts
readonly PROXY_TIMEOUT: -32002 = -32002;
```

VP proxy: request timed out at proxy level

##### PROXY\_UNAVAILABLE

```ts
readonly PROXY_UNAVAILABLE: -32003 = -32003;
```

VP proxy: VP unreachable / DNS failure / response too large

##### INVALID\_RESPONSE

```ts
readonly INVALID_RESPONSE: -32700 = -32700;
```

SDK client: response missing "result" field (malformed JSON-RPC)

##### RESPONSE\_TOO\_LARGE

```ts
readonly RESPONSE_TOO_LARGE: -32701 = -32701;
```

SDK client: response body exceeded the configured byte limit

***

### AUTH\_REJECTED\_RPC\_CODE

```ts
const AUTH_REJECTED_RPC_CODE: -32001 = -32001;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts)

JSON-RPC error code the vault provider returns for every bearer-token
rejection: expired, not-yet-valid, missing bearer, invalid signature,
invalid claims, invalid structure, subject mismatch, issuer mismatch.
All eight variants collapse onto this one code, distinguished only by
message text — see btc-vault `crates/btc-auth/src/rpc.rs`
(`auth_error_to_rpc_error`). Operationally they all mean the same
thing: this bearer is dead, mint a new one.

Numerically equal to [JSON\_RPC\_ERROR\_CODES.NETWORK](#network), which this
client throws for local network failures. `source` is what separates
them — see [isAuthRejectedError](#isauthrejectederror).

***

### PRE\_DEPOSITOR\_SIGNATURES\_STATES

```ts
const PRE_DEPOSITOR_SIGNATURES_STATES: readonly DaemonStatus[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

States where the VP is still processing (no depositor action needed).
Excludes PENDING_DEPOSITOR_WOTS_PK (requires depositor action).

***

### VP\_TRANSIENT\_STATUSES

```ts
const VP_TRANSIENT_STATUSES: ReadonlySet<DaemonStatus>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

Statuses where no depositor action is needed (VP processing or already past
depositor interaction). Excludes PENDING_INGESTION and PENDING_DEPOSITOR_WOTS_PK.

***

### VP\_TERMINAL\_FAILURE\_STATUSES

```ts
const VP_TERMINAL_FAILURE_STATUSES: ReadonlySet<DaemonStatus>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

Terminal VP statuses that represent failure outcomes — polling should
stop immediately with an error rather than wait for timeout.

Mirrors the failure subset of the server-side terminals
(`allowed_transitions()` empty, see
`btc-vault/crates/vaultd/src/workers/claimer/mod.rs:230-242`).
`Activated` IS terminal on-chain but is the success outcome, so it is
intentionally excluded — a caller polling for an earlier state that
races straight to `Activated` should treat that as success-via-overshoot,
not failure. `Expired` is also excluded — under RFC 003 it is a
grace-window interim that transitions to `ExpiredCleanedUp` or
`ExpiredInClaim`. Callers that want to stop polling on any expiry
should check `status === DaemonStatus.EXPIRED ||
VP_TERMINAL_FAILURE_STATUSES.has(status)`.

***

### POST\_WOTS\_STATUSES

```ts
const POST_WOTS_STATUSES: ReadonlySet<DaemonStatus>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

Statuses that come after WOTS key submission.
If the VP is already in one of these states, the WOTS key was already
submitted and we can skip.

***

### VP\_BATCH\_MAX\_SIZE

```ts
const VP_BATCH_MAX_SIZE: 50 = 50;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts)

Maximum number of items per batch call. Mirrors the server-side
`MAX_BATCH_SIZE` in btc-vault (`crates/vaultd/src/rpc/server/vault_provider.rs:7`).
Callers must chunk requests larger than this.
