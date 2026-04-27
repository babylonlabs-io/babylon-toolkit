[@babylonlabs-io/ts-sdk](README.md) / clients

# clients

Transport clients for the external systems the SDK talks to (Ethereum, Bitcoin mempool, vault provider RPC).

Use the `eth` readers for authoritative vault / protocol / signer-set data at the version a vault pinned
at registration — signing-critical values must not come from the indexer mirror.

## Classes

### ViemProtocolParamsReader

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts:111](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts#L111)

Concrete protocol params reader using viem.

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts:112](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts#L112)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts:117](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts#L117)

###### Returns

`Promise`\<[`TBVProtocolParams`](#tbvprotocolparams)\>

###### Implementation of

[`ProtocolParamsReader`](#protocolparamsreader).[`getTBVProtocolParams`](#gettbvprotocolparams-2)

##### getLatestOffchainParams()

```ts
getLatestOffchainParams(): Promise<VersionedOffchainParams>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts:127](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts#L127)

###### Returns

`Promise`\<[`VersionedOffchainParams`](#versionedoffchainparams)\>

###### Implementation of

[`ProtocolParamsReader`](#protocolparamsreader).[`getLatestOffchainParams`](#getlatestoffchainparams-2)

##### getOffchainParamsByVersion()

```ts
getOffchainParamsByVersion(version): Promise<VersionedOffchainParams>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts:137](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts#L137)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts:150](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts#L150)

###### Returns

`Promise`\<`number`\>

###### Implementation of

[`ProtocolParamsReader`](#protocolparamsreader).[`getLatestOffchainParamsVersion`](#getlatestoffchainparamsversion-2)

##### getTimelockPeginByVersion()

```ts
getTimelockPeginByVersion(version): Promise<number>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts:160](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts#L160)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts:169](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/protocol-params-reader.ts#L169)

Read TBV protocol params and latest offchain params atomically via multicall.
Prevents TOCTOU inconsistency if governance updates params between reads.

###### Returns

`Promise`\<[`PegInConfiguration`](#peginconfiguration)\>

###### Implementation of

[`ProtocolParamsReader`](#protocolparamsreader).[`getPegInConfiguration`](#getpeginconfiguration-2)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts:27](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts#L27)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts:28](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts#L28)

###### Parameters

###### publicClient

###### contractAddress

`` `0x${string}` ``

###### Returns

[`ViemVaultRegistryReader`](#viemvaultregistryreader)

#### Methods

##### getVaultBasicInfo()

```ts
getVaultBasicInfo(vaultId): Promise<VaultBasicInfo>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts:33](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts#L33)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts:52](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts#L52)

###### Parameters

###### vaultId

`` `0x${string}` ``

###### Returns

`Promise`\<[`VaultProtocolInfo`](#vaultprotocolinfo)\>

###### Implementation of

[`VaultRegistryReader`](#vaultregistryreader).[`getVaultProtocolInfo`](#getvaultprotocolinfo)

##### getVaultData()

```ts
getVaultData(vaultId): Promise<VaultData>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts:87](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/vault-registry-reader.ts#L87)

###### Parameters

###### vaultId

`` `0x${string}` ``

###### Returns

`Promise`\<[`VaultData`](#vaultdata)\>

###### Implementation of

[`VaultRegistryReader`](#vaultregistryreader).[`getVaultData`](#getvaultdata)

***

### VaultProviderRpcClient

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts:60](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts#L60)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts:65](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts#L65)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts:81](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts#L81)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts:97](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts#L97)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts:113](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts#L113)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts:128](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts#L128)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts:141](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts#L141)

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

##### getPegoutStatus()

```ts
getPegoutStatus(params, signal?): Promise<GetPegoutStatusResponse>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts:155](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts#L155)

Get the current pegout status from the vault provider daemon.

###### Parameters

###### params

[`GetPegoutStatusParams`](#getpegoutstatusparams)

###### signal?

`AbortSignal`

###### Returns

`Promise`\<[`GetPegoutStatusResponse`](#getpegoutstatusresponse)\>

***

### ServerIdentityError

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts:55](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts#L55)

#### Extends

- `Error`

#### Constructors

##### Constructor

```ts
new ServerIdentityError(message, reason): ServerIdentityError;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts:56](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts#L56)

###### Parameters

###### message

`string`

###### reason

`"pinned_pubkey_mismatch"` | `"expired"` | `"invalid_pubkey_encoding"` | `"invalid_ephemeral_pubkey"` | `"invalid_signature_encoding"`

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
  | "invalid_pubkey_encoding"
  | "invalid_ephemeral_pubkey"
  | "invalid_signature_encoding";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts:58](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts#L58)

***

### VpTokenProvider

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenProvider.ts:99](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenProvider.ts#L99)

Acquire, cache, and refresh VP bearer tokens.

Implements [BearerTokenProvider](#bearertokenprovider). Safe to pass directly into
`JsonRpcClient` as `tokenProvider`.

#### Implements

- [`BearerTokenProvider`](#bearertokenprovider)

#### Constructors

##### Constructor

```ts
new VpTokenProvider(config): VpTokenProvider;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenProvider.ts:111](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenProvider.ts#L111)

###### Parameters

###### config

[`VpTokenProviderConfig`](#vptokenproviderconfig)

###### Returns

[`VpTokenProvider`](#vptokenprovider)

#### Methods

##### getToken()

```ts
getToken(method): Promise<string | null>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenProvider.ts:126](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenProvider.ts#L126)

Return a bearer token for `method`, or `null` if `method` is not
auth-gated. Triggers a token acquisition if no token is cached or
the cached token is within refreshSkewSecs of expiry.

###### Parameters

###### method

`string`

###### Returns

`Promise`\<`string` \| `null`\>

###### Implementation of

[`BearerTokenProvider`](#bearertokenprovider).[`getToken`](#gettoken-2)

##### invalidate()

```ts
invalidate(): void;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenProvider.ts:142](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenProvider.ts#L142)

Drop the cached token. Next `getToken` call re-acquires.
Called by `JsonRpcClient` on wire `auth_expired` responses.

###### Returns

`void`

###### Implementation of

[`BearerTokenProvider`](#bearertokenprovider).[`invalidate`](#invalidate-2)

***

### JsonRpcError

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts:99](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts#L99)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts:100](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts#L100)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts:101](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts#L101)

##### source

```ts
source: JsonRpcErrorSource = "local";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts:104](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts#L104)

"wire" for server-returned envelopes; "local" for SDK-side failures.

##### data?

```ts
optional data: unknown;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts:106](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts#L106)

Structured data from the server `error.data` field, if any.

***

### JsonRpcClient

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts:178](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts#L178)

Generic JSON-RPC 2.0 HTTP client with safe retry policy.

#### Constructors

##### Constructor

```ts
new JsonRpcClient(config): JsonRpcClient;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts:188](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts#L188)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts:225](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts#L225)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts:308](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts#L308)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts:444](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts#L444)

###### Returns

`string`

***

### VpResponseValidationError

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/validators.ts:45](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/validators.ts#L45)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/validators.ts:48](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/validators.ts#L48)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/validators.ts:46](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/validators.ts#L46)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:15](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L15)

Basic vault info from BTCVaultRegistry.getBtcVaultBasicInfo

#### Properties

##### depositor

```ts
depositor: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:16](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L16)

##### depositorBtcPubKey

```ts
depositorBtcPubKey: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:17](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L17)

##### amount

```ts
amount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:18](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L18)

##### vaultProvider

```ts
vaultProvider: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:19](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L19)

##### status

```ts
status: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:20](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L20)

##### applicationEntryPoint

```ts
applicationEntryPoint: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:21](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L21)

##### createdAt

```ts
createdAt: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:22](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L22)

***

### VaultProtocolInfo

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:26](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L26)

Protocol info from BTCVaultRegistry.getBtcVaultProtocolInfo

#### Properties

##### depositorSignedPeginTx

```ts
depositorSignedPeginTx: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:27](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L27)

##### universalChallengersVersion

```ts
universalChallengersVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:28](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L28)

##### appVaultKeepersVersion

```ts
appVaultKeepersVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:29](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L29)

##### offchainParamsVersion

```ts
offchainParamsVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:30](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L30)

##### verifiedAt

```ts
verifiedAt: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:31](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L31)

##### depositorWotsPkHash

```ts
depositorWotsPkHash: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:32](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L32)

##### hashlock

```ts
hashlock: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:33](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L33)

##### htlcVout

```ts
htlcVout: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:34](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L34)

##### depositorPopSignature

```ts
depositorPopSignature: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:35](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L35)

##### prePeginTxHash

```ts
prePeginTxHash: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:36](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L36)

##### vaultProviderCommissionBps

```ts
vaultProviderCommissionBps: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:37](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L37)

***

### VaultData

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:41](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L41)

Combined vault data (basic + protocol)

#### Properties

##### basic

```ts
basic: VaultBasicInfo;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:42](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L42)

##### protocol

```ts
protocol: VaultProtocolInfo;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:43](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L43)

***

### VaultRegistryReader

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:47](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L47)

Interface for reading vault data from the BTCVaultRegistry contract.

#### Methods

##### getVaultBasicInfo()

```ts
getVaultBasicInfo(vaultId): Promise<VaultBasicInfo>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:48](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L48)

###### Parameters

###### vaultId

`` `0x${string}` ``

###### Returns

`Promise`\<[`VaultBasicInfo`](#vaultbasicinfo)\>

##### getVaultProtocolInfo()

```ts
getVaultProtocolInfo(vaultId): Promise<VaultProtocolInfo>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:49](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L49)

###### Parameters

###### vaultId

`` `0x${string}` ``

###### Returns

`Promise`\<[`VaultProtocolInfo`](#vaultprotocolinfo)\>

##### getVaultData()

```ts
getVaultData(vaultId): Promise<VaultData>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:50](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L50)

###### Parameters

###### vaultId

`` `0x${string}` ``

###### Returns

`Promise`\<[`VaultData`](#vaultdata)\>

***

### TBVProtocolParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:64](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L64)

TBV protocol parameters from the ProtocolParams contract.
Matches Solidity struct `IProtocolParams.TBVProtocolParams` exactly.

All uint64 amounts use bigint (satoshi values can exceed 2^53).
uint8 uses number (bounded, max 255).

#### Properties

##### minimumPegInAmount

```ts
minimumPegInAmount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:65](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L65)

##### maxPegInAmount

```ts
maxPegInAmount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:66](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L66)

##### pegInAckTimeout

```ts
pegInAckTimeout: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:67](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L67)

##### pegInActivationTimeout

```ts
pegInActivationTimeout: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:68](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L68)

##### maxHtlcOutputCount

```ts
maxHtlcOutputCount: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:69](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L69)

***

### VersionedOffchainParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:79](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L79)

Versioned offchain parameters from the ProtocolParams contract.
Matches Solidity struct `IProtocolParams.VersionedOffchainParams` exactly.

bigint for: uint256 timelocks, uint64 fee rates/amounts.
number for: uint8/uint16/uint32 fields (bounded, safe for JS arithmetic).

#### Properties

##### timelockAssert

```ts
timelockAssert: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:80](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L80)

##### timelockChallengeAssert

```ts
timelockChallengeAssert: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:81](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L81)

##### securityCouncilKeys

```ts
securityCouncilKeys: `0x${string}`[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:82](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L82)

##### councilQuorum

```ts
councilQuorum: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:83](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L83)

##### feeRate

```ts
feeRate: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:84](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L84)

##### babeTotalInstances

```ts
babeTotalInstances: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:85](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L85)

##### babeInstancesToFinalize

```ts
babeInstancesToFinalize: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:86](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L86)

##### minVpCommissionBps

```ts
minVpCommissionBps: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:87](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L87)

##### tRefund

```ts
tRefund: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:88](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L88)

##### tStale

```ts
tStale: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:89](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L89)

##### minPeginFeeRate

```ts
minPeginFeeRate: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:90](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L90)

##### proverProgramVersion

```ts
proverProgramVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:91](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L91)

##### minPrepeginDepth

```ts
minPrepeginDepth: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:92](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L92)

***

### PegInConfiguration

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:99](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L99)

Combined peg-in configuration read atomically via multicall.
Prevents TOCTOU inconsistency if governance updates params between reads.

#### Properties

##### minimumPegInAmount

```ts
minimumPegInAmount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:100](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L100)

##### maxPegInAmount

```ts
maxPegInAmount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:101](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L101)

##### pegInAckTimeout

```ts
pegInAckTimeout: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:102](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L102)

##### pegInActivationTimeout

```ts
pegInActivationTimeout: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:103](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L103)

##### maxHtlcOutputCount

```ts
maxHtlcOutputCount: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:104](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L104)

##### timelockPegin

```ts
timelockPegin: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:105](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L105)

##### timelockRefund

```ts
timelockRefund: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:106](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L106)

##### minVpCommissionBps

```ts
minVpCommissionBps: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:107](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L107)

##### offchainParams

```ts
offchainParams: VersionedOffchainParams;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:108](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L108)

***

### ProtocolParamsReader

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:112](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L112)

Interface for reading protocol parameters from the ProtocolParams contract.

#### Methods

##### getTBVProtocolParams()

```ts
getTBVProtocolParams(): Promise<TBVProtocolParams>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:113](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L113)

###### Returns

`Promise`\<[`TBVProtocolParams`](#tbvprotocolparams)\>

##### getOffchainParamsByVersion()

```ts
getOffchainParamsByVersion(version): Promise<VersionedOffchainParams>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:114](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L114)

###### Parameters

###### version

`number`

###### Returns

`Promise`\<[`VersionedOffchainParams`](#versionedoffchainparams)\>

##### getLatestOffchainParams()

```ts
getLatestOffchainParams(): Promise<VersionedOffchainParams>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:115](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L115)

###### Returns

`Promise`\<[`VersionedOffchainParams`](#versionedoffchainparams)\>

##### getLatestOffchainParamsVersion()

```ts
getLatestOffchainParamsVersion(): Promise<number>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:116](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L116)

###### Returns

`Promise`\<`number`\>

##### getTimelockPeginByVersion()

```ts
getTimelockPeginByVersion(version): Promise<number>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:117](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L117)

###### Parameters

###### version

`number`

###### Returns

`Promise`\<`number`\>

##### getPegInConfiguration()

```ts
getPegInConfiguration(): Promise<PegInConfiguration>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:118](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L118)

###### Returns

`Promise`\<[`PegInConfiguration`](#peginconfiguration)\>

***

### AddressBTCKeyPair

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:129](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L129)

Matches Solidity struct `BTCVaultTypes.AddressBTCKeyPair` exactly.
Used for vault keepers and universal challengers.

#### Properties

##### ethAddress

```ts
ethAddress: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:130](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L130)

##### btcPubKey

```ts
btcPubKey: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:131](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L131)

***

### VaultKeeperReader

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:135](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L135)

Interface for reading vault keepers from the ApplicationRegistry contract.

#### Methods

##### getVaultKeepersByVersion()

```ts
getVaultKeepersByVersion(appEntryPoint, version): Promise<AddressBTCKeyPair[]>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:136](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L136)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:140](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L140)

###### Parameters

###### appEntryPoint

`` `0x${string}` ``

###### Returns

`Promise`\<[`AddressBTCKeyPair`](#addressbtckeypair)[]\>

##### getCurrentVaultKeepersVersion()

```ts
getCurrentVaultKeepersVersion(appEntryPoint): Promise<number>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:143](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L143)

###### Parameters

###### appEntryPoint

`` `0x${string}` ``

###### Returns

`Promise`\<`number`\>

***

### UniversalChallengerReader

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:147](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L147)

Interface for reading universal challengers from the ProtocolParams contract.

#### Methods

##### getUniversalChallengersByVersion()

```ts
getUniversalChallengersByVersion(version): Promise<AddressBTCKeyPair[]>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:148](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L148)

###### Parameters

###### version

`number`

###### Returns

`Promise`\<[`AddressBTCKeyPair`](#addressbtckeypair)[]\>

##### getCurrentUniversalChallengers()

```ts
getCurrentUniversalChallengers(): Promise<AddressBTCKeyPair[]>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:151](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L151)

###### Returns

`Promise`\<[`AddressBTCKeyPair`](#addressbtckeypair)[]\>

##### getLatestUniversalChallengersVersion()

```ts
getLatestUniversalChallengersVersion(): Promise<number>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts:152](../../packages/babylon-ts-sdk/src/tbv/core/clients/eth/types.ts#L152)

###### Returns

`Promise`\<`number`\>

***

### AddressTx

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts:373](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts#L373)

Transaction summary from address transactions endpoint.

#### Properties

##### txid

```ts
txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts:374](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts#L374)

##### status

```ts
status: object;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts:375](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts#L375)

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

### TxInfo

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:64](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L64)

Full transaction info from mempool API.

#### Properties

##### txid

```ts
txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:65](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L65)

##### version

```ts
version: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:66](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L66)

##### locktime

```ts
locktime: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:67](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L67)

##### vin

```ts
vin: TxInput[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:68](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L68)

##### vout

```ts
vout: TxOutput[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:69](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L69)

##### size

```ts
size: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:70](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L70)

##### weight

```ts
weight: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:71](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L71)

##### fee

```ts
fee: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:72](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L72)

##### status

```ts
status: TxStatus;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:73](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L73)

***

### UtxoInfo

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:81](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L81)

UTXO info for a specific output (used for PSBT construction).

Only supports Taproot (P2TR) and native SegWit (P2WPKH, P2WSH) script types.

#### Properties

##### txid

```ts
txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:82](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L82)

##### vout

```ts
vout: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:83](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L83)

##### value

```ts
value: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:84](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L84)

##### scriptPubKey

```ts
scriptPubKey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:85](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L85)

***

### NetworkFees

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:93](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L93)

Bitcoin network fee recommendations (sat/vbyte) from mempool.space API.

#### See

https://mempool.space/docs/api/rest#get-recommended-fees

#### Properties

##### fastestFee

```ts
fastestFee: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:95](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L95)

Next block (~10 min)

##### halfHourFee

```ts
halfHourFee: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:97](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L97)

~30 minutes

##### hourFee

```ts
hourFee: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:99](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L99)

~1 hour

##### economyFee

```ts
economyFee: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:101](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L101)

Economy (no time guarantee)

##### minimumFee

```ts
minimumFee: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts:103](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/types.ts#L103)

Minimum network fee

***

### VaultProviderRpcClientOptions

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts:36](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts#L36)

#### Properties

##### timeout?

```ts
optional timeout: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts:38](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts#L38)

Timeout in milliseconds per request (default: 60000)

##### retries?

```ts
optional retries: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts:40](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts#L40)

Number of retry attempts for safe methods (default: 3)

##### retryDelay?

```ts
optional retryDelay: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts:42](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts#L42)

Initial retry delay in milliseconds (default: 1000)

##### retryableFor()?

```ts
optional retryableFor: (method) => boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts:44](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts#L44)

Custom retry predicate (default: only retry get* status methods)

###### Parameters

###### method

`string`

###### Returns

`boolean`

##### headers?

```ts
optional headers: Record<string, string>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts:46](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/api.ts#L46)

Custom headers

***

### ServerIdentityResponse

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts:31](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts#L31)

Wire representation from btc-vault's `ServerIdentityResponse`.

#### Properties

##### server\_pubkey

```ts
server_pubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts:33](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts#L33)

Hex-encoded x-only (32-byte) persistent server pubkey.

##### ephemeral\_pubkey

```ts
ephemeral_pubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts:35](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts#L35)

Hex-encoded compressed (33-byte) ephemeral token-signing pubkey.

##### expires\_at

```ts
expires_at: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts:37](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts#L37)

Unix timestamp at which the ephemeral key expires.

##### signature

```ts
signature: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts:39](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts#L39)

Hex-encoded 64-byte BIP-322 Schnorr signature.

***

### VerifyServerIdentityInput

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts:42](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts#L42)

#### Properties

##### proof

```ts
proof: ServerIdentityResponse;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts:44](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts#L44)

The proof returned by `auth_createDepositorToken`.

##### pinnedServerPubkey

```ts
pinnedServerPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts:50](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts#L50)

The x-only persistent server pubkey the FE expects (sourced from
the on-chain `VaultProvider.btcPubKey` via the vault registry
reader). 64-char lowercase hex, no `0x` prefix.

##### now

```ts
now: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts:52](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts#L52)

Current Unix timestamp in seconds. Injected for testability.

***

### CreateDepositorTokenResponse

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenProvider.ts:48](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenProvider.ts#L48)

Wire response shape of `auth_createDepositorToken`.

#### Properties

##### token

```ts
token: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenProvider.ts:50](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenProvider.ts#L50)

Base64url-encoded COSE Sign1 CWT bearer token.

##### expires\_at

```ts
expires_at: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenProvider.ts:52](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenProvider.ts#L52)

Unix timestamp at which the token expires.

##### server\_identity

```ts
server_identity: ServerIdentityResponse;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenProvider.ts:54](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenProvider.ts#L54)

Server identity proof bundled with every token response.

***

### VpTokenProviderConfig

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenProvider.ts:57](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenProvider.ts#L57)

#### Properties

##### client

```ts
client: JsonRpcClient;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenProvider.ts:59](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenProvider.ts#L59)

VP JSON-RPC client to use for `auth_createDepositorToken` calls.

##### peginTxid

```ts
peginTxid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenProvider.ts:61](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenProvider.ts#L61)

Pre-PegIn transaction id this token is scoped to.

##### authAnchorHex

```ts
authAnchorHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenProvider.ts:67](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenProvider.ts#L67)

64-char lowercase hex encoding of the 32-byte `auth_anchor`
preimage committed in the Pre-PegIn OP_RETURN. Presenting this
preimage is what lets the VP issue the token (the "fast path").

##### pinnedServerPubkey

```ts
pinnedServerPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenProvider.ts:73](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenProvider.ts#L73)

64-char lowercase hex x-only pubkey the FE expects the VP to
present as its persistent server identity. Sourced from the
on-chain `VaultProvider.btcPubKey` via the vault-registry reader.

##### authGatedMethods

```ts
authGatedMethods: ReadonlySet<string>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenProvider.ts:78](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenProvider.ts#L78)

Set of method names that require authentication. `getToken()`
returns `null` for any method not in this set.

##### refreshSkewSecs?

```ts
optional refreshSkewSecs: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenProvider.ts:83](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenProvider.ts#L83)

Seconds before `expires_at` to treat a cached token as expired.
Default: DEFAULT\_REFRESH\_SKEW\_SECS.

##### now()?

```ts
optional now: () => number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenProvider.ts:85](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenProvider.ts#L85)

Clock source (injected for testability). Default: `Date.now() / 1000`.

###### Returns

`number`

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

##### retryableFor()?

```ts
optional retryableFor: (method) => boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts:73](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts#L73)

Predicate to determine if a method is safe to retry.
Default: only retry `vaultProvider_getPeginStatus` and `vaultProvider_getPegoutStatus`.
Write/mutating methods are NOT retried by default.

###### Parameters

###### method

`string`

###### Returns

`boolean`

##### tokenProvider?

```ts
optional tokenProvider: BearerTokenProvider;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts:85](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts#L85)

Optional bearer-token provider. If set, the client injects
`Authorization: Bearer <token>` for every method the provider
returns a non-null token for (`call` and `callRaw` alike).

`call` also performs a one-shot reactive refresh when a wire-origin
JSON-RPC error carries `error.data.kind === "auth_expired"` —
it calls `invalidate()`, fetches a fresh token, and retries the
request once. `callRaw` does NOT perform reactive refresh (its
body may be unbounded; we don't parse it).

***

### WotsConfig

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:109](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L109)

WOTS configuration for a single block.
Matches Rust `babe::wots::Config` serde format.

#### Properties

##### d

```ts
d: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:111](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L111)

Digit bit-width (e.g. 4 → base-16 digits).

##### n

```ts
n: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:113](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L113)

Number of message digits in this block.

##### checksum\_radix

```ts
checksum_radix: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:115](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L115)

Radix used for the checksum computation.

***

### WotsBlockPublicKey

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:122](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L122)

A single block of WOTS public keys.
Chain values are arrays of byte values (matching Rust `[u8; 20]`).

#### Properties

##### config

```ts
config: WotsConfig;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:123](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L123)

##### message\_terminals

```ts
message_terminals: number[][];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:124](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L124)

##### checksum\_major\_terminal

```ts
checksum_major_terminal: number[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:125](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L125)

##### checksum\_minor\_terminal

```ts
checksum_minor_terminal: number[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:126](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L126)

***

### RequestDepositorPresignTransactionsParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:134](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L134)

Params for requesting the payout/claim/assert transactions to pre-sign.

#### Properties

##### pegin\_txid

```ts
pegin_txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:135](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L135)

##### depositor\_pk

```ts
depositor_pk: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:136](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L136)

***

### SubmitDepositorWotsKeyParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:140](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L140)

Params for submitting the depositor's WOTS public key to the VP.

#### Properties

##### pegin\_txid

```ts
pegin_txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:141](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L141)

##### depositor\_pk

```ts
depositor_pk: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:142](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L142)

##### wots\_public\_keys

```ts
wots_public_keys: WotsBlockPublicKey[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:143](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L143)

***

### DepositorPreSigsPerChallenger

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:147](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L147)

Per-challenger signatures for the depositor-as-claimer flow.

#### Properties

##### nopayout\_signature

```ts
nopayout_signature: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:148](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L148)

***

### DepositorAsClaimerPresignatures

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:152](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L152)

Depositor-as-claimer pre-signatures (payout + per-challenger).

#### Properties

##### payout\_signatures

```ts
payout_signatures: ClaimerSignatures;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:153](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L153)

##### per\_challenger

```ts
per_challenger: Record<string, DepositorPreSigsPerChallenger>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:154](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L154)

***

### SubmitDepositorPresignaturesParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:158](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L158)

Params for submitting depositor pre-signatures including claimer presignatures.

#### Properties

##### pegin\_txid

```ts
pegin_txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:159](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L159)

##### depositor\_pk

```ts
depositor_pk: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:160](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L160)

##### signatures

```ts
signatures: Record<string, ClaimerSignatures>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:161](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L161)

##### depositor\_claimer\_presignatures

```ts
depositor_claimer_presignatures: DepositorAsClaimerPresignatures;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:162](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L162)

***

### ClaimerSignatures

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:166](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L166)

Payout signatures per claimer.

#### Properties

##### payout\_signature

```ts
payout_signature: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:167](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L167)

***

### RequestDepositorClaimerArtifactsParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:171](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L171)

Params for requesting BaBe DecryptorArtifacts from the VP.

#### Properties

##### pegin\_txid

```ts
pegin_txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:172](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L172)

##### depositor\_pk

```ts
depositor_pk: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:173](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L173)

***

### TransactionData

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:186](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L186)

A raw Bitcoin transaction with its hex encoding.

#### Properties

##### tx\_hex

```ts
tx_hex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:187](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L187)

***

### ClaimerTransactions

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:191](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L191)

Set of transactions the depositor must pre-sign for a single claimer.

#### Properties

##### claimer\_pubkey

```ts
claimer_pubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:192](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L192)

##### claim\_tx

```ts
claim_tx: TransactionData;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:193](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L193)

##### assert\_tx

```ts
assert_tx: TransactionData;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:194](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L194)

##### payout\_tx

```ts
payout_tx: TransactionData;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:195](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L195)

##### payout\_psbt

```ts
payout_psbt: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:196](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L196)

***

### ChallengeAssertConnectorData

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:200](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L200)

Per-segment connector data for ChallengeAssert inputs.

#### Properties

##### wots\_pks\_json

```ts
wots_pks_json: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:201](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L201)

##### gc\_wots\_keys\_json

```ts
gc_wots_keys_json: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:202](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L202)

***

### PresignDataPerChallenger

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:206](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L206)

Challenger-specific transactions and signing data for the depositor graph.

#### Properties

##### challenger\_pubkey

```ts
challenger_pubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:207](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L207)

##### challenge\_assert\_x\_tx

```ts
challenge_assert_x_tx: TransactionData;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:208](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L208)

##### challenge\_assert\_y\_tx

```ts
challenge_assert_y_tx: TransactionData;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:209](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L209)

##### nopayout\_tx

```ts
nopayout_tx: TransactionData;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:210](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L210)

##### nopayout\_psbt

```ts
nopayout_psbt: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:211](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L211)

##### challenge\_assert\_connectors

```ts
challenge_assert_connectors: ChallengeAssertConnectorData[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:212](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L212)

##### output\_label\_hashes

```ts
output_label_hashes: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:213](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L213)

***

### DepositorGraphTransactions

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:217](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L217)

Depositor-as-claimer TxGraph transactions.

#### Properties

##### claim\_tx

```ts
claim_tx: TransactionData;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:218](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L218)

##### assert\_tx

```ts
assert_tx: TransactionData;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:219](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L219)

##### payout\_tx

```ts
payout_tx: TransactionData;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:220](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L220)

##### payout\_psbt

```ts
payout_psbt: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:221](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L221)

##### challenger\_presign\_data

```ts
challenger_presign_data: PresignDataPerChallenger[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:222](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L222)

##### offchain\_params\_version

```ts
offchain_params_version: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:223](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L223)

***

### RequestDepositorPresignTransactionsResponse

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:227](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L227)

Response from `requestDepositorPresignTransactions`.

#### Properties

##### txs

```ts
txs: ClaimerTransactions[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:228](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L228)

##### depositor\_graph

```ts
depositor_graph: DepositorGraphTransactions;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:229](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L229)

***

### BaBeSessionData

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:233](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L233)

BaBe garbled-circuit session data for a single challenger.

#### Properties

##### decryptor\_artifacts\_hex

```ts
decryptor_artifacts_hex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:234](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L234)

***

### RequestDepositorClaimerArtifactsResponse

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:238](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L238)

Response from `requestDepositorClaimerArtifacts`.

#### Properties

##### tx\_graph\_json

```ts
tx_graph_json: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:239](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L239)

##### verifying\_key\_hex

```ts
verifying_key_hex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:240](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L240)

##### babe\_sessions

```ts
babe_sessions: Record<string, BaBeSessionData>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:241](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L241)

***

### ChallengerProgress

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:245](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L245)

Progress tracker for a multi-challenger operation.

#### Extended by

- [`PresigningProgress`](#presigningprogress)

#### Properties

##### total\_challengers

```ts
total_challengers: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:246](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L246)

##### completed\_challengers

```ts
completed_challengers: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:247](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L247)

##### completed\_challenger\_pubkeys

```ts
completed_challenger_pubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:248](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L248)

##### pending\_challenger\_pubkeys

```ts
pending_challenger_pubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:249](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L249)

***

### PresigningProgress

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:256](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L256)

Extended presigning progress with all 3 concurrent phases.

#### Extends

- [`ChallengerProgress`](#challengerprogress)

#### Properties

##### total\_challengers

```ts
total_challengers: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:246](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L246)

###### Inherited from

[`ChallengerProgress`](#challengerprogress).[`total_challengers`](#total_challengers)

##### completed\_challengers

```ts
completed_challengers: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:247](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L247)

###### Inherited from

[`ChallengerProgress`](#challengerprogress).[`completed_challengers`](#completed_challengers)

##### completed\_challenger\_pubkeys

```ts
completed_challenger_pubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:248](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L248)

###### Inherited from

[`ChallengerProgress`](#challengerprogress).[`completed_challenger_pubkeys`](#completed_challenger_pubkeys)

##### pending\_challenger\_pubkeys

```ts
pending_challenger_pubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:249](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L249)

###### Inherited from

[`ChallengerProgress`](#challengerprogress).[`pending_challenger_pubkeys`](#pending_challenger_pubkeys)

##### depositor\_graph\_created?

```ts
optional depositor_graph_created: boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:257](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L257)

##### vk\_challenger\_presigning\_completed?

```ts
optional vk_challenger_presigning_completed: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:258](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L258)

##### vk\_challenger\_presigning\_total?

```ts
optional vk_challenger_presigning_total: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:259](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L259)

***

### PeginProgressDetails

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:263](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L263)

Detailed progress breakdown for an in-progress pegin.

#### Properties

##### gc\_data?

```ts
optional gc_data: ChallengerProgress;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:264](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L264)

##### presigning?

```ts
optional presigning: PresigningProgress;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:265](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L265)

##### ack\_collection?

```ts
optional ack_collection: ChallengerProgress;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:266](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L266)

##### claimer\_graphs?

```ts
optional claimer_graphs: ClaimerGraphStatus[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:267](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L267)

***

### ClaimerGraphStatus

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:271](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L271)

Per-claimer graph status (challenger perspective).

#### Properties

##### claimer\_pubkey

```ts
claimer_pubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:272](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L272)

##### presigned

```ts
presigned: boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:273](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L273)

***

### GetPeginStatusResponse

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:277](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L277)

Response from `getPeginStatus`.

#### Properties

##### pegin\_txid

```ts
pegin_txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:278](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L278)

##### status

```ts
status: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:279](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L279)

##### progress

```ts
progress: PeginProgressDetails;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:280](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L280)

##### health\_info

```ts
health_info: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:281](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L281)

##### last\_error?

```ts
optional last_error: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:282](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L282)

***

### GetPegoutStatusParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:290](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L290)

Params for querying pegout status from the VP daemon.

#### Properties

##### pegin\_txid

```ts
pegin_txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:291](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L291)

***

### ClaimerPegoutStatus

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:295](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L295)

Claimer-side pegout progress.

#### Properties

##### status

```ts
status: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:296](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L296)

##### failed

```ts
failed: boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:297](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L297)

##### claim\_txid?

```ts
optional claim_txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:298](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L298)

##### claimer\_pubkey?

```ts
optional claimer_pubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:299](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L299)

##### challenger\_pubkey?

```ts
optional challenger_pubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:300](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L300)

##### created\_at?

```ts
optional created_at: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:301](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L301)

##### updated\_at?

```ts
optional updated_at: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:302](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L302)

***

### ChallengerPegoutStatus

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:306](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L306)

Challenger-side pegout progress.

#### Properties

##### status

```ts
status: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:307](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L307)

##### claim\_txid?

```ts
optional claim_txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:308](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L308)

##### claimer\_pubkey?

```ts
optional claimer_pubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:309](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L309)

##### assert\_txid?

```ts
optional assert_txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:310](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L310)

##### challenge\_assert\_txid?

```ts
optional challenge_assert_txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:311](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L311)

##### nopayout\_txid?

```ts
optional nopayout_txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:312](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L312)

##### created\_at?

```ts
optional created_at: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:313](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L313)

##### updated\_at?

```ts
optional updated_at: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:314](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L314)

***

### GetPegoutStatusResponse

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:318](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L318)

Response from `getPegoutStatus`.

#### Properties

##### pegin\_txid

```ts
pegin_txid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:319](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L319)

##### found

```ts
found: boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:320](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L320)

##### claimer?

```ts
optional claimer: ClaimerPegoutStatus;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:321](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L321)

##### challenger?

```ts
optional challenger: ChallengerPegoutStatus;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:322](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L322)

## Type Aliases

### JsonRpcErrorSource

```ts
type JsonRpcErrorSource = "wire" | "local";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts:97](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts#L97)

Identifies whether an error was produced locally (timeout, network
failure, malformed response) or parsed from a wire-format JSON-RPC
error envelope returned by the server.

This matters for anyone inspecting the shared `-32001` code: the SDK
uses it internally for network failures AND the server uses it for
auth-middleware rejections. The `source` field disambiguates.

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:177](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L177)

Params for querying pegin status. Either pegin_txid or vault_id must be provided.

***

### GcDataProgress

```ts
type GcDataProgress = ChallengerProgress;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:252](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L252)

***

### AckCollectionProgress

```ts
type AckCollectionProgress = ChallengerProgress;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:253](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L253)

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

### pushTx()

```ts
function pushTx(txHex, apiUrl): Promise<string>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts:163](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts#L163)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts:207](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts#L207)

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

### getTxHex()

```ts
function getTxHex(txid, apiUrl): Promise<string>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts:220](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts#L220)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts:252](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts#L252)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts:287](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts#L287)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts:364](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts#L364)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts:391](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts#L391)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts:408](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts#L408)

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

### verifyServerIdentity()

```ts
function verifyServerIdentity(input): void;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts:82](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts#L82)

Verify a server identity proof against a pinned server pubkey.

Checks: (1) `server_pubkey` matches the pin; (2) `expires_at > now`;
(3) `ephemeral_pubkey` is a well-formed 33-byte compressed pubkey;
(4) `signature` is a well-formed 64-byte hex string.

Full BIP-322 signature verification is deferred to a follow-up.

#### Parameters

##### input

[`VerifyServerIdentityInput`](#verifyserveridentityinput)

#### Returns

`void`

#### Throws

ServerIdentityError on any validation failure.

***

### validateRequestDepositorClaimerArtifactsResponse()

```ts
function validateRequestDepositorClaimerArtifactsResponse(response): asserts response is RequestDepositorClaimerArtifactsResponse;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/validators.ts:328](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/validators.ts#L328)

Validate a requestDepositorClaimerArtifacts response.

#### Parameters

##### response

`unknown`

#### Returns

`asserts response is RequestDepositorClaimerArtifactsResponse`

## Enumerations

### DaemonStatus

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:29](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L29)

Backend daemon status (vault provider database).
Source: btc-vault crates/vaultd/src/workers/claimer/mod.rs PegInStatus enum

State flow (happy path):
PendingIngestion -> PendingDepositorWotsPK -> PendingBabeSetup -> PendingChallengerPresigning
  -> PendingPeginSigsAvailability -> PendingPrePegInConfirmations
  -> PendingDepositorSignatures -> PendingACKs -> PendingActivation -> Activated

Terminal / branching states:
- Expired: vault timed out before activation
- ClaimPosted: claim transaction posted on-chain
- PeggedOut: BTC has been returned to the depositor

#### Enumeration Members

##### PENDING\_INGESTION

```ts
PENDING_INGESTION: "PendingIngestion";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:30](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L30)

##### PENDING\_DEPOSITOR\_WOTS\_PK

```ts
PENDING_DEPOSITOR_WOTS_PK: "PendingDepositorWotsPK";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:31](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L31)

##### PENDING\_BABE\_SETUP

```ts
PENDING_BABE_SETUP: "PendingBabeSetup";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:32](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L32)

##### PENDING\_CHALLENGER\_PRESIGNING

```ts
PENDING_CHALLENGER_PRESIGNING: "PendingChallengerPresigning";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:33](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L33)

##### PENDING\_PEGIN\_SIGS\_AVAILABILITY

```ts
PENDING_PEGIN_SIGS_AVAILABILITY: "PendingPeginSigsAvailability";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:34](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L34)

##### PENDING\_PRE\_PEGIN\_CONFIRMATIONS

```ts
PENDING_PRE_PEGIN_CONFIRMATIONS: "PendingPrePegInConfirmations";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:35](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L35)

##### PENDING\_DEPOSITOR\_SIGNATURES

```ts
PENDING_DEPOSITOR_SIGNATURES: "PendingDepositorSignatures";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:36](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L36)

##### PENDING\_ACKS

```ts
PENDING_ACKS: "PendingACKs";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:37](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L37)

##### PENDING\_ACTIVATION

```ts
PENDING_ACTIVATION: "PendingActivation";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:38](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L38)

##### ACTIVATED

```ts
ACTIVATED: "Activated";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:39](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L39)

##### EXPIRED

```ts
EXPIRED: "Expired";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:40](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L40)

##### CLAIM\_POSTED

```ts
CLAIM_POSTED: "ClaimPosted";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:41](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L41)

##### PEGGED\_OUT

```ts
PEGGED_OUT: "PeggedOut";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:42](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L42)

***

### RpcErrorCode

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:330](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L330)

JSON-RPC error codes returned by the vault provider.

#### Enumeration Members

##### DATABASE\_ERROR

```ts
DATABASE_ERROR: -32005;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:331](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L331)

##### PRESIGN\_ERROR

```ts
PRESIGN_ERROR: -32006;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:332](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L332)

##### JSON\_SERIALIZATION\_ERROR

```ts
JSON_SERIALIZATION_ERROR: -32007;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:333](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L333)

##### TX\_GRAPH\_ERROR

```ts
TX_GRAPH_ERROR: -32008;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:334](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L334)

##### INVALID\_GRAPH

```ts
INVALID_GRAPH: -32009;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:335](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L335)

##### VALIDATION\_ERROR

```ts
VALIDATION_ERROR: -32010;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:336](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L336)

##### NOT\_FOUND

```ts
NOT_FOUND: -32011;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:337](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L337)

##### INTERNAL\_ERROR

```ts
INTERNAL_ERROR: -32603;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:338](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L338)

## Variables

### MEMPOOL\_API\_URLS

```ts
const MEMPOOL_API_URLS: object;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts:118](../../packages/babylon-ts-sdk/src/tbv/core/clients/mempool/mempoolApi.ts#L118)

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

### JSON\_RPC\_ERROR\_CODES

```ts
const JSON_RPC_ERROR_CODES: object;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts:113](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/json-rpc-client.ts#L113)

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

***

### PRE\_DEPOSITOR\_SIGNATURES\_STATES

```ts
const PRE_DEPOSITOR_SIGNATURES_STATES: readonly DaemonStatus[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:53](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L53)

States where the VP is still processing (no depositor action needed).
Excludes PENDING_DEPOSITOR_WOTS_PK (requires depositor action).

***

### VP\_TRANSIENT\_STATUSES

```ts
const VP_TRANSIENT_STATUSES: ReadonlySet<DaemonStatus>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:72](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L72)

Statuses where no depositor action is needed (VP processing or already past
depositor interaction). Excludes PENDING_INGESTION and PENDING_DEPOSITOR_WOTS_PK.

***

### VP\_TERMINAL\_STATUSES

```ts
const VP_TERMINAL_STATUSES: ReadonlySet<DaemonStatus>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:85](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L85)

Terminal VP statuses where no further progress is possible.
If the VP reaches one of these states while polling, polling should
stop immediately with an error rather than waiting for timeout.

***

### POST\_WOTS\_STATUSES

```ts
const POST_WOTS_STATUSES: ReadonlySet<DaemonStatus>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts:96](../../packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/types.ts#L96)

Statuses that come after WOTS key submission.
If the VP is already in one of these states, the WOTS key was already
submitted and we can skip.
