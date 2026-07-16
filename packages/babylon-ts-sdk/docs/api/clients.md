[@babylonlabs-io/ts-sdk](README.md) / clients

# clients

Transport clients for the external systems the SDK talks to (Ethereum, Bitcoin mempool, vault provider RPC).

Use the `eth` readers for authoritative vault / protocol / signer-set data at the version a vault pinned
at registration — signing-critical values must not come from the indexer mirror.

## Classes

### ViemProtocolParamsReader

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts:126](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts#L126)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts:127](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts#L127)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts:132](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts#L132)

###### Returns

`Promise`\<[`TBVProtocolParams`](#tbvprotocolparams)\>

###### Implementation of

[`ProtocolParamsReader`](#protocolparamsreader).[`getTBVProtocolParams`](#gettbvprotocolparams-2)

##### getLatestOffchainParams()

```ts
getLatestOffchainParams(): Promise<VersionedOffchainParams>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts:144](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts#L144)

###### Returns

`Promise`\<[`VersionedOffchainParams`](#versionedoffchainparams)\>

###### Implementation of

[`ProtocolParamsReader`](#protocolparamsreader).[`getLatestOffchainParams`](#getlatestoffchainparams-2)

##### getOffchainParamsByVersion()

```ts
getOffchainParamsByVersion(version): Promise<VersionedOffchainParams>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts:156](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts#L156)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts:171](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts#L171)

###### Returns

`Promise`\<`number`\>

###### Implementation of

[`ProtocolParamsReader`](#protocolparamsreader).[`getLatestOffchainParamsVersion`](#getlatestoffchainparamsversion-2)

##### getTimelockPeginByVersion()

```ts
getTimelockPeginByVersion(version): Promise<number>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts:182](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts#L182)

###### Parameters

###### version

`number`

###### Returns

`Promise`\<`number`\>

###### Implementation of

[`ProtocolParamsReader`](#protocolparamsreader).[`getTimelockPeginByVersion`](#gettimelockpeginbyversion-2)

##### getPegInConfiguration()

```ts
getPegInConfiguration(): Promise<PegInConfiguration>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts:194](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts#L194)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts:255](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts#L255)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/signer-set-reader.ts:37](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/signer-set-reader.ts#L37)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/signer-set-reader.ts:38](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/signer-set-reader.ts#L38)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/signer-set-reader.ts:43](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/signer-set-reader.ts#L43)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/signer-set-reader.ts:57](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/signer-set-reader.ts#L57)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/signer-set-reader.ts:70](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/signer-set-reader.ts#L70)

###### Parameters

###### appEntryPoint

`` `0x${string}` ``

###### Returns

`Promise`\<`number`\>

###### Implementation of

[`VaultKeeperReader`](#vaultkeeperreader).[`getCurrentVaultKeepersVersion`](#getcurrentvaultkeepersversion-2)

***

### ViemUniversalChallengerReader

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/signer-set-reader.ts:93](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/signer-set-reader.ts#L93)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/signer-set-reader.ts:94](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/signer-set-reader.ts#L94)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/signer-set-reader.ts:99](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/signer-set-reader.ts#L99)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/signer-set-reader.ts:112](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/signer-set-reader.ts#L112)

###### Returns

`Promise`\<[`AddressBTCKeyPair`](#addressbtckeypair)[]\>

###### Implementation of

[`UniversalChallengerReader`](#universalchallengerreader).[`getCurrentUniversalChallengers`](#getcurrentuniversalchallengers-2)

##### getLatestUniversalChallengersVersion()

```ts
getLatestUniversalChallengersVersion(): Promise<number>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/signer-set-reader.ts:122](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/signer-set-reader.ts#L122)

###### Returns

`Promise`\<`number`\>

###### Implementation of

[`UniversalChallengerReader`](#universalchallengerreader).[`getLatestUniversalChallengersVersion`](#getlatestuniversalchallengersversion-2)

***

### ViemVaultRegistryReader

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts:97](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts#L97)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts:98](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts#L98)

###### Parameters

###### publicClient

###### contractAddress

`` `0x${string}` ``

###### Returns

[`ViemVaultRegistryReader`](#viemvaultregistryreader)

#### Methods

##### getVaultProviderBtcPubKey()

```ts
getVaultProviderBtcPubKey(vpAddress): Promise<OnChainBtcPubkey>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts:109](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts#L109)

Read the VP's persistent x-only BTC pubkey from the on-chain
registry. Validates length, hex form, and secp256k1 curve
membership before minting the brand. Returns 64-char lowercase
hex without the `0x` prefix.

###### Parameters

###### vpAddress

`` `0x${string}` ``

###### Returns

`Promise`\<[`OnChainBtcPubkey`](#onchainbtcpubkey)\>

###### Implementation of

[`VaultRegistryReader`](#vaultregistryreader).[`getVaultProviderBtcPubKey`](#getvaultproviderbtcpubkey)

##### getVaultBasicInfo()

```ts
getVaultBasicInfo(vaultId): Promise<VaultBasicInfo>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts:133](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts#L133)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts:144](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts#L144)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts:155](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts#L155)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts:218](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts#L218)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts:234](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts#L234)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts:253](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts#L253)

###### Parameters

###### vaultId

`` `0x${string}` ``

###### Returns

`Promise`\<[`VaultData`](#vaultdata)\>

###### Implementation of

[`VaultRegistryReader`](#vaultregistryreader).[`getVaultData`](#getvaultdata)

##### getOffchainParamsVersionsByVaultIds()

```ts
getOffchainParamsVersionsByVaultIds(vaultIds): Promise<number[]>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts:295](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts#L295)

Read `offchainParamsVersion` for many vaults in a single multicall.
Reads only `getBtcVaultProtocolInfo` (one read per vault), so an N-vault
batch costs one RPC round-trip instead of 2N parallel `eth_call`s.

###### Parameters

###### vaultIds

readonly `` `0x${string}` ``[]

###### Returns

`Promise`\<`number`[]\>

###### Implementation of

[`VaultRegistryReader`](#vaultregistryreader).[`getOffchainParamsVersionsByVaultIds`](#getoffchainparamsversionsbyvaultids)

***

### VaultProviderRpcClient

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts:79](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts#L79)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts:84](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts#L84)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts:102](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts#L102)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts:118](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts#L118)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts:134](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts#L134)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts:149](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts#L149)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts:162](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts#L162)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts:180](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts#L180)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts:196](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts#L196)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts:80](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts#L80)

#### Extends

- `Error`

#### Constructors

##### Constructor

```ts
new ServerIdentityError(message, reason): ServerIdentityError;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts:81](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts#L81)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts:83](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts#L83)

***

### VpTokenRegistry

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenRegistry.ts:31](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenRegistry.ts#L31)

#### Accessors

##### size

###### Get Signature

```ts
get size(): number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenRegistry.ts:110](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenRegistry.ts#L110)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenRegistry.ts:40](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenRegistry.ts#L40)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenRegistry.ts:87](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenRegistry.ts#L87)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenRegistry.ts:96](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenRegistry.ts#L96)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts:93](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts#L93)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts:94](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts#L94)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts:95](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts#L95)

##### source

```ts
source: JsonRpcErrorSource = "local";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts:98](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts#L98)

"wire" for server-returned envelopes; "local" for SDK-side failures.

##### data?

```ts
optional data: unknown;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts:100](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts#L100)

Structured data from the server `error.data` field, if any.

***

### JsonRpcClient

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts:186](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts#L186)

Generic JSON-RPC 2.0 HTTP client with safe retry policy.

#### Constructors

##### Constructor

```ts
new JsonRpcClient(config): JsonRpcClient;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts:197](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts#L197)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts:239](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts#L239)

Make a JSON-RPC request with optional retry for safe methods.

If the request fails with a wire-origin `auth_expired` error and a
`tokenProvider` is configured, the client invalidates its cached
token and retries the request once with a freshly-acquired bearer.

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts:338](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts#L338)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts:474](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts#L474)

###### Returns

`string`

***

### VpResponseValidationError

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/validators.ts:48](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/validators.ts#L48)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/validators.ts:51](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/validators.ts#L51)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/validators.ts:49](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/validators.ts#L49)

## Interfaces

### ProtocolAddresses

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/contract-address-resolver.ts:15](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/contract-address-resolver.ts#L15)

#### Properties

##### protocolParams

```ts
protocolParams: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/contract-address-resolver.ts:17](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/contract-address-resolver.ts#L17)

Address of the ProtocolParams contract

##### applicationRegistry

```ts
applicationRegistry: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/contract-address-resolver.ts:19](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/contract-address-resolver.ts#L19)

Address of the ApplicationRegistry contract

***

### VaultBasicInfo

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:47](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L47)

Basic vault info from BTCVaultRegistry.getBtcVaultBasicInfo

#### Properties

##### depositor

```ts
depositor: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:48](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L48)

##### depositorBtcPubKey

```ts
depositorBtcPubKey: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:49](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L49)

##### amount

```ts
amount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:50](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L50)

##### vaultProvider

```ts
vaultProvider: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:51](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L51)

##### status

```ts
status: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:52](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L52)

##### applicationEntryPoint

```ts
applicationEntryPoint: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:53](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L53)

##### createdAt

```ts
createdAt: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:54](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L54)

***

### VaultProtocolInfo

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:58](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L58)

Protocol info from BTCVaultRegistry.getBtcVaultProtocolInfo

#### Properties

##### depositorSignedPeginTx

```ts
depositorSignedPeginTx: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:59](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L59)

##### universalChallengersVersion

```ts
universalChallengersVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:60](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L60)

##### appVaultKeepersVersion

```ts
appVaultKeepersVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:61](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L61)

##### offchainParamsVersion

```ts
offchainParamsVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:62](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L62)

##### verifiedAt

```ts
verifiedAt: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:63](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L63)

##### depositorWotsPkHash

```ts
depositorWotsPkHash: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:64](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L64)

##### hashlock

```ts
hashlock: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:65](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L65)

##### htlcVout

```ts
htlcVout: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:66](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L66)

##### depositorPopSignature

```ts
depositorPopSignature: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:67](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L67)

##### prePeginTxHash

```ts
prePeginTxHash: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:68](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L68)

##### vaultProviderCommissionBps

```ts
vaultProviderCommissionBps: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:69](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L69)

##### claimExpiredUntil

```ts
claimExpiredUntil: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:71](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L71)

Block deadline (uint256) for depositor reclaim. TODO(#1690): wire to refund flow.

##### vaultCoreVersion

```ts
vaultCoreVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:73](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L73)

Vault core version (uint16) stamped at registration. VP-side gating only — see #1690.

***

### VaultData

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:77](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L77)

Combined vault data (basic + protocol)

#### Properties

##### basic

```ts
basic: VaultBasicInfo;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:78](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L78)

##### protocol

```ts
protocol: VaultProtocolInfo;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:79](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L79)

***

### VaultRegistryReader

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:83](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L83)

Interface for reading vault data from the BTCVaultRegistry contract.

#### Methods

##### getVaultBasicInfo()

```ts
getVaultBasicInfo(vaultId): Promise<VaultBasicInfo>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:84](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L84)

###### Parameters

###### vaultId

`` `0x${string}` ``

###### Returns

`Promise`\<[`VaultBasicInfo`](#vaultbasicinfo)\>

##### getVaultProtocolInfo()

```ts
getVaultProtocolInfo(vaultId): Promise<VaultProtocolInfo>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:85](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L85)

###### Parameters

###### vaultId

`` `0x${string}` ``

###### Returns

`Promise`\<[`VaultProtocolInfo`](#vaultprotocolinfo)\>

##### getProtocolInfoBatch()

```ts
getProtocolInfoBatch(vaultIds): Promise<VaultProtocolInfo[]>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:86](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L86)

###### Parameters

###### vaultIds

readonly `` `0x${string}` ``[]

###### Returns

`Promise`\<[`VaultProtocolInfo`](#vaultprotocolinfo)[]\>

##### getVaultData()

```ts
getVaultData(vaultId): Promise<VaultData>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:87](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L87)

###### Parameters

###### vaultId

`` `0x${string}` ``

###### Returns

`Promise`\<[`VaultData`](#vaultdata)\>

##### getVaultProviderBtcPubKey()

```ts
getVaultProviderBtcPubKey(vpAddress): Promise<OnChainBtcPubkey>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:88](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L88)

###### Parameters

###### vpAddress

`` `0x${string}` ``

###### Returns

`Promise`\<[`OnChainBtcPubkey`](#onchainbtcpubkey)\>

##### getPegInFee()

```ts
getPegInFee(vaultProvider): Promise<bigint>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:90](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L90)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:97](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L97)

Read a vault provider's current commission in basis points.

Validates the contract-enforced `[0, 9999]` range — an out-of-range
value signals a wrong contract address or ABI drift, not a real rate.

###### Parameters

###### vaultProvider

`` `0x${string}` ``

###### Returns

`Promise`\<`number`\>

##### getOffchainParamsVersionsByVaultIds()

```ts
getOffchainParamsVersionsByVaultIds(vaultIds): Promise<number[]>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:103](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L103)

Read `offchainParamsVersion` for many vaults in a single multicall.
Returns versions in the same order as the input. Throws if any vault
is missing on-chain.

###### Parameters

###### vaultIds

readonly `` `0x${string}` ``[]

###### Returns

`Promise`\<`number`[]\>

***

### TBVProtocolParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:119](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L119)

TBV protocol parameters from the ProtocolParams contract.
Matches Solidity struct `IProtocolParams.TBVProtocolParams` exactly.

All uint64 amounts use bigint (satoshi values can exceed 2^53).
uint8 uses number (bounded, max 255).

#### Properties

##### minimumPegInAmount

```ts
minimumPegInAmount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:120](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L120)

##### maxPegInAmount

```ts
maxPegInAmount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:121](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L121)

##### pegInAckTimeout

```ts
pegInAckTimeout: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:122](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L122)

##### pegInActivationTimeout

```ts
pegInActivationTimeout: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:123](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L123)

##### maxHtlcOutputCount

```ts
maxHtlcOutputCount: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:124](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L124)

##### expiredPegInGraceBlocks

```ts
expiredPegInGraceBlocks: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:130](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L130)

Number of blocks added to the activation deadline as a grace window
during which a depositor may still reclaim an expired pegin via the
HTLC preimage. Source: `IProtocolParams.TBVProtocolParams.expiredPegInGraceBlocks`.

***

### VersionedOffchainParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:140](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L140)

Versioned offchain parameters from the ProtocolParams contract.
Matches Solidity struct `IProtocolParams.VersionedOffchainParams` exactly.

bigint for: uint256 timelocks, uint64 fee rates/amounts.
number for: uint8/uint16/uint32 fields (bounded, safe for JS arithmetic).

#### Properties

##### timelockAssert

```ts
timelockAssert: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:141](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L141)

##### timelockChallengeAssert

```ts
timelockChallengeAssert: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:142](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L142)

##### securityCouncilKeys

```ts
securityCouncilKeys: `0x${string}`[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:143](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L143)

##### councilQuorum

```ts
councilQuorum: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:144](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L144)

##### feeRate

```ts
feeRate: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:145](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L145)

##### babeTotalInstances

```ts
babeTotalInstances: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:146](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L146)

##### babeInstancesToFinalize

```ts
babeInstancesToFinalize: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:147](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L147)

##### minVpCommissionBps

```ts
minVpCommissionBps: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:148](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L148)

##### tRefund

```ts
tRefund: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:149](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L149)

##### tStale

```ts
tStale: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:150](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L150)

##### minPeginFeeRate

```ts
minPeginFeeRate: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:151](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L151)

##### proverCircuitVersion

```ts
proverCircuitVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:152](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L152)

##### minPrepeginDepth

```ts
minPrepeginDepth: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:153](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L153)

***

### PegInConfiguration

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:160](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L160)

Combined peg-in configuration read atomically via multicall.
Prevents TOCTOU inconsistency if governance updates params between reads.

#### Properties

##### minimumPegInAmount

```ts
minimumPegInAmount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:161](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L161)

##### maxPegInAmount

```ts
maxPegInAmount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:162](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L162)

##### pegInAckTimeout

```ts
pegInAckTimeout: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:163](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L163)

##### pegInActivationTimeout

```ts
pegInActivationTimeout: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:164](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L164)

##### maxHtlcOutputCount

```ts
maxHtlcOutputCount: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:165](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L165)

##### expiredPegInGraceBlocks

```ts
expiredPegInGraceBlocks: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:166](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L166)

##### timelockPegin

```ts
timelockPegin: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:167](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L167)

##### timelockRefund

```ts
timelockRefund: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:168](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L168)

##### minVpCommissionBps

```ts
minVpCommissionBps: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:169](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L169)

##### offchainParams

```ts
offchainParams: VersionedOffchainParams;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:170](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L170)

##### offchainParamsVersion

```ts
offchainParamsVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:177](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L177)

Version label paired atomically with `offchainParams`.
Read in the same multicall as the params struct so that, if a parameter
update lands between separate reads, the script-construction code and
the version label stay consistent.

##### activeVaultCoreVersion

```ts
activeVaultCoreVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:185](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L185)

Currently-active vault core (tx-graph) version
(`ProtocolParams.activeVaultCoreVersion()`, uint16 ≥ 1). Stamped onto
every new vault at peg-in submission; fresh deposits must build this
graph version. Read in the same multicall so a governance version bump
can't land between reading the params and reading the version.

***

### AllOffchainParamsData

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:194](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L194)

All offchain params snapshots indexed by version, plus the latest version
number known when the snapshot was taken. Used by consumers that need to
resolve any historical version (e.g. signing for an existing vault locked
to an older version).

#### Properties

##### byVersion

```ts
byVersion: Map<number, VersionedOffchainParams>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:195](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L195)

##### latestVersion

```ts
latestVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:196](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L196)

***

### ProtocolParamsReader

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:210](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L210)

Interface for reading protocol parameters from the ProtocolParams contract.

#### Methods

##### getTBVProtocolParams()

```ts
getTBVProtocolParams(): Promise<TBVProtocolParams>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:211](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L211)

###### Returns

`Promise`\<[`TBVProtocolParams`](#tbvprotocolparams)\>

##### getOffchainParamsByVersion()

```ts
getOffchainParamsByVersion(version): Promise<VersionedOffchainParams>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:212](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L212)

###### Parameters

###### version

`number`

###### Returns

`Promise`\<[`VersionedOffchainParams`](#versionedoffchainparams)\>

##### getLatestOffchainParams()

```ts
getLatestOffchainParams(): Promise<VersionedOffchainParams>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:213](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L213)

###### Returns

`Promise`\<[`VersionedOffchainParams`](#versionedoffchainparams)\>

##### getLatestOffchainParamsVersion()

```ts
getLatestOffchainParamsVersion(): Promise<number>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:214](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L214)

###### Returns

`Promise`\<`number`\>

##### getTimelockPeginByVersion()

```ts
getTimelockPeginByVersion(version): Promise<number>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:215](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L215)

###### Parameters

###### version

`number`

###### Returns

`Promise`\<`number`\>

##### getPegInConfiguration()

```ts
getPegInConfiguration(): Promise<PegInConfiguration>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:216](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L216)

###### Returns

`Promise`\<[`PegInConfiguration`](#peginconfiguration)\>

##### fetchAllOffchainParams()

```ts
fetchAllOffchainParams(onSkippedVersion?): Promise<AllOffchainParamsData>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:217](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L217)

###### Parameters

###### onSkippedVersion?

[`OnSkippedOffchainParamsVersion`](#onskippedoffchainparamsversion)

###### Returns

`Promise`\<[`AllOffchainParamsData`](#alloffchainparamsdata)\>

***

### AddressBTCKeyPair

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:230](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L230)

Matches Solidity struct `BTCVaultTypes.AddressBTCKeyPair` exactly.
Used for vault keepers and universal challengers.

#### Properties

##### ethAddress

```ts
ethAddress: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:231](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L231)

##### btcPubKey

```ts
btcPubKey: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:232](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L232)

***

### VaultKeeperReader

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:236](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L236)

Interface for reading vault keepers from the ApplicationRegistry contract.

#### Methods

##### getVaultKeepersByVersion()

```ts
getVaultKeepersByVersion(appEntryPoint, version): Promise<AddressBTCKeyPair[]>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:237](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L237)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:241](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L241)

###### Parameters

###### appEntryPoint

`` `0x${string}` ``

###### Returns

`Promise`\<[`AddressBTCKeyPair`](#addressbtckeypair)[]\>

##### getCurrentVaultKeepersVersion()

```ts
getCurrentVaultKeepersVersion(appEntryPoint): Promise<number>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:244](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L244)

###### Parameters

###### appEntryPoint

`` `0x${string}` ``

###### Returns

`Promise`\<`number`\>

***

### UniversalChallengerReader

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:248](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L248)

Interface for reading universal challengers from the ProtocolParams contract.

#### Methods

##### getUniversalChallengersByVersion()

```ts
getUniversalChallengersByVersion(version): Promise<AddressBTCKeyPair[]>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:249](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L249)

###### Parameters

###### version

`number`

###### Returns

`Promise`\<[`AddressBTCKeyPair`](#addressbtckeypair)[]\>

##### getCurrentUniversalChallengers()

```ts
getCurrentUniversalChallengers(): Promise<AddressBTCKeyPair[]>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:252](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L252)

###### Returns

`Promise`\<[`AddressBTCKeyPair`](#addressbtckeypair)[]\>

##### getLatestUniversalChallengersVersion()

```ts
getLatestUniversalChallengersVersion(): Promise<number>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:253](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L253)

###### Returns

`Promise`\<`number`\>

***

### AddressTx

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts:425](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts#L425)

Transaction summary from address transactions endpoint.

#### Properties

##### txid

```ts
txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts:426](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts#L426)

##### status

```ts
status: object;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts:427](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts#L427)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:12](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L12)

UTXO information from mempool API.

#### Properties

##### txid

```ts
txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:13](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L13)

##### vout

```ts
vout: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:14](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L14)

##### value

```ts
value: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:15](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L15)

##### scriptPubKey

```ts
scriptPubKey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:16](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L16)

##### confirmed

```ts
confirmed: boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:17](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L17)

***

### TxInput

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:23](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L23)

Transaction input from mempool API.

#### Properties

##### txid

```ts
txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:24](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L24)

##### vout

```ts
vout: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:25](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L25)

##### prevout

```ts
prevout: object;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:26](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L26)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:33](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L33)

##### scriptsig\_asm

```ts
scriptsig_asm: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:34](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L34)

##### witness

```ts
witness: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:35](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L35)

##### is\_coinbase

```ts
is_coinbase: boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:36](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L36)

##### sequence

```ts
sequence: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:37](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L37)

***

### TxOutput

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:43](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L43)

Transaction output from mempool API.

#### Properties

##### scriptpubkey

```ts
scriptpubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:44](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L44)

##### scriptpubkey\_asm

```ts
scriptpubkey_asm: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:45](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L45)

##### scriptpubkey\_type

```ts
scriptpubkey_type: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:46](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L46)

##### scriptpubkey\_address

```ts
scriptpubkey_address: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:47](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L47)

##### value

```ts
value: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:48](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L48)

***

### TxStatus

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:54](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L54)

Transaction status from mempool API.

#### Properties

##### confirmed

```ts
confirmed: boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:55](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L55)

##### block\_height?

```ts
optional block_height: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:56](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L56)

##### block\_hash?

```ts
optional block_hash: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:57](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L57)

##### block\_time?

```ts
optional block_time: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:58](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L58)

***

### OutspendStatus

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:71](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L71)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:73](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L73)

True when the output has been spent (mempool or a block).

##### txid?

```ts
optional txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:75](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L75)

Spending transaction id; present only when `spent`.

##### vin?

```ts
optional vin: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:77](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L77)

Input index within the spending tx; present only when `spent`.

##### status?

```ts
optional status: TxStatus;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:79](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L79)

Confirmation status of the spending tx; present only when `spent`.

***

### TxInfo

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:85](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L85)

Full transaction info from mempool API.

#### Properties

##### txid

```ts
txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:86](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L86)

##### version

```ts
version: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:87](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L87)

##### locktime

```ts
locktime: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:88](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L88)

##### vin

```ts
vin: TxInput[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:89](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L89)

##### vout

```ts
vout: TxOutput[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:90](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L90)

##### size

```ts
size: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:91](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L91)

##### weight

```ts
weight: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:92](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L92)

##### fee

```ts
fee: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:93](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L93)

##### status

```ts
status: TxStatus;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:94](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L94)

***

### UtxoInfo

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:102](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L102)

UTXO info for a specific output (used for PSBT construction).

Only supports Taproot (P2TR) and native SegWit (P2WPKH, P2WSH) script types.

#### Properties

##### txid

```ts
txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:103](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L103)

##### vout

```ts
vout: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:104](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L104)

##### value

```ts
value: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:105](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L105)

##### scriptPubKey

```ts
scriptPubKey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:106](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L106)

***

### NetworkFees

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:114](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L114)

Bitcoin network fee recommendations (sat/vbyte) from mempool.space API.

#### See

https://mempool.space/docs/api/rest#get-recommended-fees

#### Properties

##### fastestFee

```ts
fastestFee: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:116](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L116)

Next block (~10 min)

##### halfHourFee

```ts
halfHourFee: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:118](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L118)

~30 minutes

##### hourFee

```ts
hourFee: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:120](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L120)

~1 hour

##### economyFee

```ts
economyFee: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:122](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L122)

Economy (no time guarantee)

##### minimumFee

```ts
minimumFee: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:124](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L124)

Minimum network fee

***

### VaultProviderRpcClientOptions

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts:43](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts#L43)

#### Properties

##### timeout?

```ts
optional timeout: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts:45](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts#L45)

Timeout in milliseconds per request (default: 60000)

##### retries?

```ts
optional retries: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts:47](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts#L47)

Number of retry attempts for safe methods (default: 3)

##### retryDelay?

```ts
optional retryDelay: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts:49](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts#L49)

Initial retry delay in milliseconds (default: 1000)

##### retryableFor()?

```ts
optional retryableFor: (method) => boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts:55](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts#L55)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts:57](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts#L57)

Custom headers.

##### tokenProvider?

```ts
optional tokenProvider: BearerTokenProvider;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts:63](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts#L63)

Per-request bearer-token source. A non-null return attaches
`Authorization: Bearer <token>`; `null` skips auth. Wire a
VpTokenProvider for depositor-gated methods.

##### maxResponseBytes?

```ts
optional maxResponseBytes: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts:65](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts#L65)

Maximum response body size, in bytes, for typed JSON-RPC calls

***

### AuthenticatedVpClientConfig

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/createAuthenticatedVpClient.ts:21](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/createAuthenticatedVpClient.ts#L21)

#### Properties

##### baseUrl

```ts
baseUrl: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/createAuthenticatedVpClient.ts:23](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/createAuthenticatedVpClient.ts#L23)

Base URL of the VP RPC endpoint (already proxied if applicable).

##### peginTxid

```ts
peginTxid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/createAuthenticatedVpClient.ts:25](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/createAuthenticatedVpClient.ts#L25)

Per-vault depositor-signed PegIn tx id (registry cache key).

##### authAnchorHex

```ts
authAnchorHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/createAuthenticatedVpClient.ts:27](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/createAuthenticatedVpClient.ts#L27)

Already-derived 32-byte auth-anchor preimage (64-char hex, no `0x`).

##### pinnedServerPubkey

```ts
pinnedServerPubkey: OnChainBtcPubkey;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/createAuthenticatedVpClient.ts:29](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/createAuthenticatedVpClient.ts#L29)

On-chain VP pubkey, branded so it can only come from the registry reader.

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/createAuthenticatedVpClient.ts:34](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/createAuthenticatedVpClient.ts#L34)

Depositor BTC pubkey (x-only or compressed hex). Normalized to
x-only and asserted against every issued token's CWT `aud` claim.

##### options?

```ts
optional options: VaultProviderRpcClientOptions;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/createAuthenticatedVpClient.ts:36](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/createAuthenticatedVpClient.ts#L36)

Optional outer-client tunables (timeout, retries, headers, etc.).

***

### PrimeVpAuthInput

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/primeVpAuth.ts:16](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/primeVpAuth.ts#L16)

#### Properties

##### baseUrl

```ts
baseUrl: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/primeVpAuth.ts:17](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/primeVpAuth.ts#L17)

##### peginTxid

```ts
peginTxid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/primeVpAuth.ts:18](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/primeVpAuth.ts#L18)

##### authAnchorHex

```ts
authAnchorHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/primeVpAuth.ts:19](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/primeVpAuth.ts#L19)

##### pinnedServerPubkey

```ts
pinnedServerPubkey: OnChainBtcPubkey;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/primeVpAuth.ts:20](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/primeVpAuth.ts#L20)

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/primeVpAuth.ts:25](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/primeVpAuth.ts#L25)

Depositor BTC pubkey (x-only or compressed hex). Normalized to
x-only and asserted against every issued token's CWT `aud` claim.

##### headers?

```ts
optional headers: Record<string, string>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/primeVpAuth.ts:27](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/primeVpAuth.ts#L27)

Optional headers forwarded to the inner token client (e.g. gateway auth).

***

### ServerIdentityResponse

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts:54](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts#L54)

Wire representation from btc-vault's `ServerIdentityResponse`.

#### Properties

##### server\_pubkey

```ts
server_pubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts:56](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts#L56)

Hex-encoded x-only (32-byte) persistent server pubkey.

##### ephemeral\_pubkey

```ts
ephemeral_pubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts:58](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts#L58)

Hex-encoded compressed (33-byte) ephemeral token-signing pubkey.

##### expires\_at

```ts
expires_at: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts:60](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts#L60)

Unix timestamp at which the ephemeral key expires.

##### signature

```ts
signature: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts:62](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts#L62)

Hex-encoded 64-byte BIP-322 Schnorr signature.

***

### VerifyServerIdentityInput

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts:65](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts#L65)

#### Properties

##### proof

```ts
proof: ServerIdentityResponse;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts:67](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts#L67)

The proof returned by `auth_createDepositorToken`.

##### pinnedServerPubkey

```ts
pinnedServerPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts:73](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts#L73)

The x-only persistent server pubkey the FE expects (sourced from
the on-chain `VaultProvider.btcPubKey` via the vault registry
reader). 64-char lowercase hex, no `0x` prefix.

##### now

```ts
now: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts:75](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts#L75)

Current Unix timestamp in seconds. Injected for testability.

##### maxLifetimeSecs?

```ts
optional maxLifetimeSecs: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts:77](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts#L77)

Cap on `proof.expires_at - now` (seconds). Defaults to DEFAULT\_MAX\_PROOF\_LIFETIME\_SECS.

***

### VpTokenRegistryInput

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenRegistry.ts:15](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenRegistry.ts#L15)

#### Properties

##### client

```ts
client: JsonRpcClient;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenRegistry.ts:16](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenRegistry.ts#L16)

##### peginTxid

```ts
peginTxid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenRegistry.ts:17](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenRegistry.ts#L17)

##### authAnchorHex

```ts
authAnchorHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenRegistry.ts:18](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenRegistry.ts#L18)

##### pinnedServerPubkey

```ts
pinnedServerPubkey: OnChainBtcPubkey;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenRegistry.ts:19](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenRegistry.ts#L19)

##### expectedAudienceXOnlyPubkey

```ts
expectedAudienceXOnlyPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenRegistry.ts:21](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenRegistry.ts#L21)

Depositor x-only pubkey (32-byte hex), asserted against each token's CWT `aud`.

***

### BatchResultEntry

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchAttribution.ts:15](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchAttribution.ts#L15)

Per-item entry in a VP batch response.

#### Type Parameters

##### T

`T`

#### Properties

##### pegin\_txid

```ts
pegin_txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchAttribution.ts:16](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchAttribution.ts#L16)

##### result

```ts
result: T | null;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchAttribution.ts:17](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchAttribution.ts#L17)

##### error

```ts
error: string | null;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchAttribution.ts:18](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchAttribution.ts#L18)

***

### BatchPollByProviderOptions

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchPoll.ts:20](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchPoll.ts#L20)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchPoll.ts:22](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchPoll.ts#L22)

Items to poll for this provider, e.g. `DepositToPoll[]`.

##### getTxid()

```ts
getTxid: (item) => string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchPoll.ts:24](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchPoll.ts#L24)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchPoll.ts:29](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchPoll.ts#L29)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchPoll.ts:40](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchPoll.ts#L40)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchPoll.ts:42](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchPoll.ts#L42)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchPoll.ts:44](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchPoll.ts#L44)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchPoll.ts:51](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchPoll.ts#L51)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchPoll.ts:57](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchPoll.ts#L57)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchPoll.ts:64](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchPoll.ts#L64)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchPoll.ts:70](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchPoll.ts#L70)

Maximum items per RPC call. Defaults to [VP\_BATCH\_MAX\_SIZE](#vp_batch_max_size).
Exposed for tests so chunking can be exercised without 50+
fixtures.

***

### BearerTokenProvider

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts:44](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts#L44)

Injects bearer tokens into requests for auth-gated methods, and is
notified on auth-expired responses so it can invalidate its cache.

The `JsonRpcClient` is agnostic to which methods are auth-gated —
the provider's `getToken(method)` decides. Returning `null` means
"no auth required for this method"; the client then sends the
request with no `Authorization` header.

#### Methods

##### getToken()

```ts
getToken(method): Promise<string | null>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts:49](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts#L49)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts:54](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts#L54)

Drop the cached token. Next call to `getToken` must re-acquire.
Called by the client on reactive-refresh-trigger responses.

###### Returns

`void`

***

### JsonRpcClientConfig

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts:57](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts#L57)

#### Properties

##### baseUrl

```ts
baseUrl: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts:59](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts#L59)

Base URL of the RPC service

##### timeout

```ts
timeout: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts:61](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts#L61)

Timeout in milliseconds per request attempt

##### headers?

```ts
optional headers: Record<string, string>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts:63](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts#L63)

Optional custom headers

##### retries?

```ts
optional retries: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts:65](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts#L65)

Number of retry attempts for transient errors (default: 3)

##### retryDelay?

```ts
optional retryDelay: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts:67](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts#L67)

Initial retry delay in milliseconds (default: 1000)

##### maxResponseBytes?

```ts
optional maxResponseBytes: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts:73](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts#L73)

Maximum response body size, in bytes, for typed JSON-RPC calls.
`callRaw` intentionally returns the unparsed Response and is not capped here.
Default: 2 MiB.

##### retryableFor()?

```ts
optional retryableFor: (method) => boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts:80](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts#L80)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts:87](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts#L87)

Per-request bearer-token source. A non-null return attaches
`Authorization: Bearer <token>`; `null` skips auth. `call`
additionally retries once on wire `auth_expired` (invalidate +
refetch + retry). `callRaw` skips reactive refresh.

***

### WotsConfig

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:136](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L136)

WOTS configuration for a single block.
Matches Rust `babe::wots::Config` serde format.

#### Properties

##### d

```ts
d: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:138](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L138)

Digit bit-width (e.g. 4 → base-16 digits).

##### n

```ts
n: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:140](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L140)

Number of message digits in this block.

##### checksum\_radix

```ts
checksum_radix: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:142](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L142)

Radix used for the checksum computation.

***

### WotsBlockPublicKey

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:149](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L149)

A single block of WOTS public keys.
Chain values are arrays of byte values (matching Rust `[u8; 20]`).

#### Properties

##### config

```ts
config: WotsConfig;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:150](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L150)

##### message\_terminals

```ts
message_terminals: number[][];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:151](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L151)

##### checksum\_major\_terminal

```ts
checksum_major_terminal: number[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:152](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L152)

##### checksum\_minor\_terminal

```ts
checksum_minor_terminal: number[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:153](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L153)

***

### RequestDepositorPresignTransactionsParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:161](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L161)

Params for requesting the payout/claim/assert transactions to pre-sign.

#### Properties

##### pegin\_txid

```ts
pegin_txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:162](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L162)

##### depositor\_pk

```ts
depositor_pk: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:163](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L163)

***

### SubmitDepositorWotsKeyParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:167](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L167)

Params for submitting the depositor's WOTS public key to the VP.

#### Properties

##### pegin\_txid

```ts
pegin_txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:168](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L168)

##### depositor\_pk

```ts
depositor_pk: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:169](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L169)

##### wots\_public\_keys

```ts
wots_public_keys: WotsBlockPublicKey[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:170](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L170)

***

### DepositorPreSigsPerChallenger

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:174](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L174)

Per-challenger signatures for the depositor-as-claimer flow.

#### Properties

##### nopayout\_signature

```ts
nopayout_signature: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:175](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L175)

***

### DepositorAsClaimerPresignatures

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:179](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L179)

Depositor-as-claimer pre-signatures (payout + per-challenger).

#### Properties

##### payout\_signatures

```ts
payout_signatures: ClaimerSignatures;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:180](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L180)

##### per\_challenger

```ts
per_challenger: Record<string, DepositorPreSigsPerChallenger>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:181](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L181)

***

### SubmitDepositorPresignaturesParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:185](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L185)

Params for submitting depositor pre-signatures including claimer presignatures.

#### Properties

##### pegin\_txid

```ts
pegin_txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:186](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L186)

##### depositor\_pk

```ts
depositor_pk: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:187](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L187)

##### signatures

```ts
signatures: Record<string, ClaimerSignatures>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:188](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L188)

##### depositor\_claimer\_presignatures

```ts
depositor_claimer_presignatures: DepositorAsClaimerPresignatures;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:189](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L189)

***

### ClaimerSignatures

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:193](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L193)

Payout signatures per claimer.

#### Properties

##### payout\_signature

```ts
payout_signature: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:194](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L194)

***

### RequestDepositorClaimerArtifactsParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:198](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L198)

Params for requesting BaBe DecryptorArtifacts from the VP.

#### Properties

##### pegin\_txid

```ts
pegin_txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:199](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L199)

##### depositor\_pk

```ts
depositor_pk: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:200](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L200)

***

### TransactionData

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:213](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L213)

A raw Bitcoin transaction with its hex encoding.

#### Properties

##### tx\_hex

```ts
tx_hex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:214](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L214)

***

### ClaimerTransactions

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:218](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L218)

Set of transactions the depositor must pre-sign for a single claimer.

#### Properties

##### claimer\_pubkey

```ts
claimer_pubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:219](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L219)

##### claim\_tx

```ts
claim_tx: TransactionData;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:220](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L220)

##### assert\_tx

```ts
assert_tx: TransactionData;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:221](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L221)

##### payout\_tx

```ts
payout_tx: TransactionData;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:222](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L222)

##### payout\_psbt

```ts
payout_psbt: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:223](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L223)

***

### ChallengeAssertConnectorData

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:227](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L227)

Per-segment connector data for ChallengeAssert inputs.

#### Properties

##### wots\_pks\_json

```ts
wots_pks_json: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:228](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L228)

##### gc\_wots\_keys\_json

```ts
gc_wots_keys_json: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:229](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L229)

***

### PresignDataPerChallenger

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:233](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L233)

Challenger-specific transactions and signing data for the depositor graph.

#### Properties

##### challenger\_pubkey

```ts
challenger_pubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:234](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L234)

##### challenge\_assert\_x\_tx

```ts
challenge_assert_x_tx: TransactionData;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:235](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L235)

##### challenge\_assert\_y\_tx

```ts
challenge_assert_y_tx: TransactionData;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:236](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L236)

##### nopayout\_tx

```ts
nopayout_tx: TransactionData;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:237](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L237)

##### nopayout\_psbt

```ts
nopayout_psbt: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:238](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L238)

##### challenge\_assert\_connectors

```ts
challenge_assert_connectors: ChallengeAssertConnectorData[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:239](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L239)

##### output\_label\_hashes

```ts
output_label_hashes: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:240](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L240)

***

### DepositorGraphTransactions

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:244](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L244)

Depositor-as-claimer TxGraph transactions.

#### Properties

##### claim\_tx

```ts
claim_tx: TransactionData;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:245](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L245)

##### assert\_tx

```ts
assert_tx: TransactionData;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:246](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L246)

##### payout\_tx

```ts
payout_tx: TransactionData;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:247](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L247)

##### payout\_psbt

```ts
payout_psbt: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:248](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L248)

##### challenger\_presign\_data

```ts
challenger_presign_data: PresignDataPerChallenger[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:249](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L249)

##### offchain\_params\_version

```ts
offchain_params_version: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:250](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L250)

***

### RequestDepositorPresignTransactionsResponse

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:254](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L254)

Response from `requestDepositorPresignTransactions`.

#### Properties

##### txs

```ts
txs: ClaimerTransactions[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:255](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L255)

##### depositor\_graph

```ts
depositor_graph: DepositorGraphTransactions;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:256](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L256)

***

### BaBeSessionData

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:260](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L260)

BaBe garbled-circuit session data for a single challenger.

#### Properties

##### decryptor\_artifacts\_hex

```ts
decryptor_artifacts_hex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:261](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L261)

***

### RequestDepositorClaimerArtifactsResponse

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:265](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L265)

Response from `requestDepositorClaimerArtifacts`.

#### Properties

##### tx\_graph\_json

```ts
tx_graph_json: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:266](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L266)

##### verifying\_key\_hex

```ts
verifying_key_hex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:267](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L267)

##### babe\_sessions

```ts
babe_sessions: Record<string, BaBeSessionData>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:268](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L268)

***

### ChallengerProgress

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:272](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L272)

Progress tracker for a multi-challenger operation.

#### Extended by

- [`PresigningProgress`](#presigningprogress)

#### Properties

##### total\_challengers

```ts
total_challengers: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:273](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L273)

##### completed\_challengers

```ts
completed_challengers: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:274](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L274)

##### completed\_challenger\_pubkeys

```ts
completed_challenger_pubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:275](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L275)

##### pending\_challenger\_pubkeys

```ts
pending_challenger_pubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:276](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L276)

***

### PresigningProgress

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:283](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L283)

Extended presigning progress with all 3 concurrent phases.

#### Extends

- [`ChallengerProgress`](#challengerprogress)

#### Properties

##### total\_challengers

```ts
total_challengers: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:273](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L273)

###### Inherited from

[`ChallengerProgress`](#challengerprogress).[`total_challengers`](#total_challengers)

##### completed\_challengers

```ts
completed_challengers: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:274](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L274)

###### Inherited from

[`ChallengerProgress`](#challengerprogress).[`completed_challengers`](#completed_challengers)

##### completed\_challenger\_pubkeys

```ts
completed_challenger_pubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:275](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L275)

###### Inherited from

[`ChallengerProgress`](#challengerprogress).[`completed_challenger_pubkeys`](#completed_challenger_pubkeys)

##### pending\_challenger\_pubkeys

```ts
pending_challenger_pubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:276](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L276)

###### Inherited from

[`ChallengerProgress`](#challengerprogress).[`pending_challenger_pubkeys`](#pending_challenger_pubkeys)

##### depositor\_graph\_created?

```ts
optional depositor_graph_created: boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:284](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L284)

##### vk\_challenger\_presigning\_completed?

```ts
optional vk_challenger_presigning_completed: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:285](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L285)

##### vk\_challenger\_presigning\_total?

```ts
optional vk_challenger_presigning_total: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:286](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L286)

***

### PeginProgressDetails

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:290](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L290)

Detailed progress breakdown for an in-progress pegin.

#### Properties

##### gc\_data?

```ts
optional gc_data: ChallengerProgress;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:291](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L291)

##### presigning?

```ts
optional presigning: PresigningProgress;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:292](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L292)

##### ack\_collection?

```ts
optional ack_collection: ChallengerProgress;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:293](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L293)

##### claimer\_graphs?

```ts
optional claimer_graphs: ClaimerGraphStatus[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:294](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L294)

***

### ClaimerGraphStatus

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:298](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L298)

Per-claimer graph status (challenger perspective).

#### Properties

##### claimer\_pubkey

```ts
claimer_pubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:299](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L299)

##### presigned

```ts
presigned: boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:300](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L300)

***

### GetPeginStatusResponse

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:304](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L304)

Response from `getPeginStatus`.

#### Properties

##### pegin\_txid

```ts
pegin_txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:305](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L305)

##### status

```ts
status: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:306](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L306)

##### progress

```ts
progress: PeginProgressDetails;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:307](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L307)

##### health\_info

```ts
health_info: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:308](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L308)

##### last\_error?

```ts
optional last_error: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:309](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L309)

***

### ClaimerPegoutStatus

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:320](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L320)

Claimer-side pegout progress.
Source: btc-vault crates/vaultd/src/rpc/server/pegout_status.rs ClaimerPegoutStatus.

#### Properties

##### status

```ts
status: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:322](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L322)

Wire string from PegoutStatus enum.

##### failed

```ts
failed: boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:323](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L323)

##### claim\_txid

```ts
claim_txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:324](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L324)

##### claimer\_pubkey

```ts
claimer_pubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:325](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L325)

##### assert\_txid

```ts
assert_txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:326](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L326)

##### created\_at

```ts
created_at: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:328](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L328)

Unix epoch seconds.

##### updated\_at

```ts
updated_at: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:330](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L330)

Unix epoch seconds.

***

### ChallengerStatus

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:337](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L337)

Challenger-side pegout progress.
Source: btc-vault crates/vaultd/src/rpc/server/pegout_status.rs ChallengerStatus.

#### Properties

##### status

```ts
status: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:338](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L338)

##### claim\_txid

```ts
claim_txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:339](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L339)

##### claimer\_pubkey

```ts
claimer_pubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:340](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L340)

##### assert\_txid

```ts
assert_txid: string | null;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:341](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L341)

##### challenge\_assert\_x\_txid

```ts
challenge_assert_x_txid: string | null;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:342](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L342)

##### challenge\_assert\_y\_txid

```ts
challenge_assert_y_txid: string | null;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:343](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L343)

##### nopayout\_txid

```ts
nopayout_txid: string | null;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:344](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L344)

##### created\_at

```ts
created_at: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:345](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L345)

##### updated\_at

```ts
updated_at: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:346](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L346)

***

### GetPegoutStatusResponse

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:353](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L353)

Pegout status response. Embedded by `batchGetPegoutStatus` per-result
envelopes. Mirrors btc-vault `GetPegoutStatusResponse`.

#### Properties

##### pegin\_txid

```ts
pegin_txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:354](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L354)

##### found

```ts
found: boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:355](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L355)

##### claimer

```ts
claimer: ClaimerPegoutStatus | null;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:356](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L356)

##### challengers

```ts
challengers: ChallengerStatus[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:357](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L357)

***

### BatchGetPeginStatusParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:365](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L365)

Params for `batchGetPeginStatus`.

#### Properties

##### pegin\_txids

```ts
pegin_txids: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:367](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L367)

Up to MAX_BATCH_SIZE (50) txids per call.

***

### BatchPeginStatusResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:371](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L371)

Per-pegin entry in a `batchGetPeginStatus` response.

#### Properties

##### pegin\_txid

```ts
pegin_txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:372](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L372)

##### result

```ts
result: GetPeginStatusResponse | null;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:373](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L373)

##### error

```ts
error: string | null;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:374](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L374)

***

### BatchGetPeginStatusResponse

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:378](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L378)

Response from `batchGetPeginStatus`. Results are returned in request order.

#### Properties

##### results

```ts
results: BatchPeginStatusResult[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:379](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L379)

***

### BatchGetPegoutStatusParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:383](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L383)

Params for `batchGetPegoutStatus`.

#### Properties

##### pegin\_txids

```ts
pegin_txids: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:384](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L384)

***

### BatchPegoutStatusResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:388](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L388)

Per-vault entry in a `batchGetPegoutStatus` response.

#### Properties

##### pegin\_txid

```ts
pegin_txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:389](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L389)

##### result

```ts
result: GetPegoutStatusResponse | null;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:390](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L390)

##### error

```ts
error: string | null;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:391](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L391)

***

### BatchGetPegoutStatusResponse

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:395](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L395)

Response from `batchGetPegoutStatus`. Results are returned in request order.

#### Properties

##### results

```ts
results: BatchPegoutStatusResult[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:396](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L396)

## Type Aliases

### OnChainBtcPubkey

```ts
type OnChainBtcPubkey = string & object;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:23](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L23)

64-char lowercase hex (no `0x`) x-only BTC pubkey sourced from the
on-chain BTCVaultRegistry. The only legitimate producer is
[VaultRegistryReader.getVaultProviderBtcPubKey](#getvaultproviderbtcpubkey).

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:204](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L204)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts:91](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts#L91)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:204](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L204)

Params for querying pegin status. Either pegin_txid or vault_id must be provided.

***

### GcDataProgress

```ts
type GcDataProgress = ChallengerProgress;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:279](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L279)

***

### AckCollectionProgress

```ts
type AckCollectionProgress = ChallengerProgress;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:280](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L280)

## Functions

### resolveProtocolAddresses()

```ts
function resolveProtocolAddresses(publicClient, btcVaultRegistryAddress): Promise<ProtocolAddresses>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/contract-address-resolver.ts:31](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/contract-address-resolver.ts#L31)

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

### validateOffchainParams()

```ts
function validateOffchainParams(params): void;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-validation.ts:58](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-validation.ts#L58)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-validation.ts:165](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-validation.ts#L165)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-validation.ts:223](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-validation.ts#L223)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts:169](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts#L169)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts:213](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts#L213)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts:228](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts#L228)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts:252](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts#L252)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts:272](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts#L272)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts:304](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts#L304)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts:339](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts#L339)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts:416](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts#L416)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts:443](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts#L443)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts:460](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts#L460)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/createAuthenticatedVpClient.ts:39](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/createAuthenticatedVpClient.ts#L39)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/primeVpAuth.ts:30](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/primeVpAuth.ts#L30)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts:128](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts#L128)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchPoll.ts:73](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/batchPoll.ts#L73)

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

### validateRequestDepositorClaimerArtifactsResponse()

```ts
function validateRequestDepositorClaimerArtifactsResponse(response): asserts response is RequestDepositorClaimerArtifactsResponse;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/validators.ts:340](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/validators.ts#L340)

Validate a requestDepositorClaimerArtifacts response.

#### Parameters

##### response

`unknown`

#### Returns

`asserts response is RequestDepositorClaimerArtifactsResponse`

## Enumerations

### OnChainBtcVaultStatus

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:38](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L38)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:39](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L39)

##### VERIFIED

```ts
VERIFIED: 1;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:40](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L40)

##### ACTIVE

```ts
ACTIVE: 2;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:41](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L41)

##### REDEEMED

```ts
REDEEMED: 3;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:42](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L42)

##### EXPIRED

```ts
EXPIRED: 4;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:43](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L43)

***

### DaemonStatus

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:38](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L38)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:39](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L39)

##### PENDING\_DEPOSITOR\_WOTS\_PK

```ts
PENDING_DEPOSITOR_WOTS_PK: "PendingDepositorWotsPK";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:40](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L40)

##### PENDING\_BABE\_SETUP

```ts
PENDING_BABE_SETUP: "PendingBabeSetup";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:41](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L41)

##### PENDING\_CHALLENGER\_PRESIGNING

```ts
PENDING_CHALLENGER_PRESIGNING: "PendingChallengerPresigning";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:42](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L42)

##### PENDING\_PEGIN\_SIGS\_AVAILABILITY

```ts
PENDING_PEGIN_SIGS_AVAILABILITY: "PendingPeginSigsAvailability";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:43](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L43)

##### PENDING\_PRE\_PEGIN\_CONFIRMATIONS

```ts
PENDING_PRE_PEGIN_CONFIRMATIONS: "PendingPrePegInConfirmations";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:44](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L44)

##### PENDING\_DEPOSITOR\_SIGNATURES

```ts
PENDING_DEPOSITOR_SIGNATURES: "PendingDepositorSignatures";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:45](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L45)

##### PENDING\_ACKS

```ts
PENDING_ACKS: "PendingACKs";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:46](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L46)

##### PENDING\_ACTIVATION

```ts
PENDING_ACTIVATION: "PendingActivation";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:47](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L47)

##### ACTIVATED\_PENDING\_BROADCAST

```ts
ACTIVATED_PENDING_BROADCAST: "ActivatedPendingBroadcast";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:48](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L48)

##### ACTIVATED

```ts
ACTIVATED: "Activated";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:49](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L49)

##### EXPIRED

```ts
EXPIRED: "Expired";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:50](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L50)

##### INGESTION\_REJECTED

```ts
INGESTION_REJECTED: "IngestionRejected";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:51](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L51)

##### INVALID\_SIG\_IN\_CONTRACT

```ts
INVALID_SIG_IN_CONTRACT: "InvalidSigInContract";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:52](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L52)

##### AML\_REJECTED

```ts
AML_REJECTED: "AmlRejected";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:53](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L53)

##### EXPIRED\_CLEANED\_UP

```ts
EXPIRED_CLEANED_UP: "ExpiredCleanedUp";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:54](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L54)

##### EXPIRED\_IN\_CLAIM

```ts
EXPIRED_IN_CLAIM: "ExpiredInClaim";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:55](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L55)

***

### RpcErrorCode

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:414](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L414)

JSON-RPC error codes returned by the vault provider.
Source: btc-vault `crates/vaultd/src/rpc/error.rs::RpcError::error_code`.

#### Enumeration Members

##### PEGIN\_NOT\_FOUND

```ts
PEGIN_NOT_FOUND: 4001;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:415](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L415)

## Variables

### MEMPOOL\_API\_URLS

```ts
const MEMPOOL_API_URLS: object;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts:124](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts#L124)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenRegistry.ts:126](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenRegistry.ts#L126)

***

### JSON\_RPC\_ERROR\_CODES

```ts
const JSON_RPC_ERROR_CODES: object;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts:107](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts#L107)

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

### AUTH\_EXPIRED\_DATA\_KIND

```ts
const AUTH_EXPIRED_DATA_KIND: "auth_expired" = "auth_expired";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts:172](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts#L172)

Token-expired marker the server emits in `error.data.kind`. When
present on a wire-origin error, the client invalidates its cached
token and retries the request once with a freshly-acquired bearer.

Kept in sync with btc-vault's auth middleware. Absence of the marker
means the server does not support reactive refresh yet; we fall back
to proactive-only refresh via `BearerTokenProvider.getToken()` TTL
checks.

***

### PRE\_DEPOSITOR\_SIGNATURES\_STATES

```ts
const PRE_DEPOSITOR_SIGNATURES_STATES: readonly DaemonStatus[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:66](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L66)

States where the VP is still processing (no depositor action needed).
Excludes PENDING_DEPOSITOR_WOTS_PK (requires depositor action).

***

### VP\_TRANSIENT\_STATUSES

```ts
const VP_TRANSIENT_STATUSES: ReadonlySet<DaemonStatus>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:86](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L86)

Statuses where no depositor action is needed (VP processing or already past
depositor interaction). Excludes PENDING_INGESTION and PENDING_DEPOSITOR_WOTS_PK.

***

### VP\_TERMINAL\_FAILURE\_STATUSES

```ts
const VP_TERMINAL_FAILURE_STATUSES: ReadonlySet<DaemonStatus>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:110](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L110)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:123](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L123)

Statuses that come after WOTS key submission.
If the VP is already in one of these states, the WOTS key was already
submitted and we can skip.

***

### VP\_BATCH\_MAX\_SIZE

```ts
const VP_BATCH_MAX_SIZE: 50 = 50;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:404](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L404)

Maximum number of items per batch call. Mirrors the server-side
`MAX_BATCH_SIZE` in btc-vault (`crates/vaultd/src/rpc/server/vault_provider.rs:7`).
Callers must chunk requests larger than this.
