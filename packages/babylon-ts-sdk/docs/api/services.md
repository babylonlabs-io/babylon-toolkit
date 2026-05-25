[@babylonlabs-io/ts-sdk](README.md) / services

# services

Stateless flow helpers that compose primitives + utils with injected I/O callbacks.
Callers own the wallet; services own the orchestration.

## Classes

### RegisteredVaultVersionMismatchError

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredVaultVersions.ts:15](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredVaultVersions.ts#L15)

#### Extends

- `Error`

#### Constructors

##### Constructor

```ts
new RegisteredVaultVersionMismatchError(message): RegisteredVaultVersionMismatchError;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredVaultVersions.ts:16](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredVaultVersions.ts#L16)

###### Parameters

###### message

`string`

###### Returns

[`RegisteredVaultVersionMismatchError`](#registeredvaultversionmismatcherror)

###### Overrides

```ts
Error.constructor
```

***

### BIP68NotMatureError

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/errors.ts:15](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/errors.ts#L15)

Thrown when the broadcast transport rejects the refund tx because the CSV
timelock has not yet matured (BIP68 non-final). Callers can surface a
friendly "wait until block N" message; the original transport error is
available via [cause](#cause).

#### Extends

- `Error`

#### Constructors

##### Constructor

```ts
new BIP68NotMatureError(vaultId, cause): BIP68NotMatureError;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/errors.ts:19](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/errors.ts#L19)

###### Parameters

###### vaultId

`` `0x${string}` ``

###### cause

`Error`

###### Returns

[`BIP68NotMatureError`](#bip68notmatureerror)

###### Overrides

```ts
Error.constructor
```

#### Properties

##### vaultId

```ts
readonly vaultId: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/errors.ts:16](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/errors.ts#L16)

##### cause

```ts
readonly cause: Error;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/errors.ts:17](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/errors.ts#L17)

###### Overrides

```ts
Error.cause
```

## Interfaces

### EthContractWriteCall

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts:58](../../packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts#L58)

A single ETH contract-write call. The SDK assembles these; the caller
executes them via viem, wagmi, a wallet provider, or any other transport.

#### Properties

##### address

```ts
address: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts:59](../../packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts#L59)

##### abi

```ts
abi: Abi;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts:60](../../packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts#L60)

##### functionName

```ts
functionName: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts:61](../../packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts#L61)

##### args

```ts
args: readonly unknown[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts:62](../../packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts#L62)

***

### EthContractWriteResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts:70](../../packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts#L70)

Minimum shape the SDK requires from any contract-write result. Callers may
return richer objects (e.g. including the receipt) — the SDK propagates
them unchanged via the generic parameter on [EthContractWriter](#ethcontractwriter).

#### Properties

##### transactionHash

```ts
transactionHash: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts:71](../../packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts#L71)

***

### ActivateVaultInput

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts:83](../../packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts#L83)

#### Type Parameters

##### R

`R` *extends* [`EthContractWriteResult`](#ethcontractwriteresult) = [`EthContractWriteResult`](#ethcontractwriteresult)

#### Properties

##### btcVaultRegistryAddress

```ts
btcVaultRegistryAddress: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts:87](../../packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts#L87)

BTCVaultRegistry contract address (env-specific).

##### vaultId

```ts
vaultId: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts:89](../../packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts#L89)

Vault ID (bytes32, 0x-prefixed).

##### secret

```ts
secret: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts:94](../../packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts#L94)

HTLC secret preimage (bytes32). A missing `0x` prefix or an uppercase
`0X` prefix is normalised before validation.

##### hashlock?

```ts
optional hashlock: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts:99](../../packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts#L99)

Optional hashlock for client-side pre-validation. When provided, the SDK
rejects before calling `writeContract` if `sha256(secret) != hashlock`.

##### activationMetadata

```ts
activationMetadata: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts:106](../../packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts#L106)

Activation metadata passed through to the contract. Required to keep
the "empty metadata" convention explicit at the call site — pass `"0x"`
(empty bytes) when no metadata is needed. Must be a 0x-prefixed hex
string with an even number of hex chars.

##### writeContract

```ts
writeContract: EthContractWriter<R>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts:108](../../packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts#L108)

Caller-provided write callback — see [EthContractWriter](#ethcontractwriter).

##### signal?

```ts
optional signal: AbortSignal;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts:115](../../packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts#L115)

Optional abort signal. Checked before validation runs; since validation
is fully synchronous, cancellation between validation and the write is
not observable and callers should rely on the transport's own
cancellation support for that window.

***

### PeginStatusReader

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/interfaces.ts:21](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/interfaces.ts#L21)

Read-only VP operations needed by polling/status functions.

#### Methods

##### getPeginStatus()

```ts
getPeginStatus(params, signal?): Promise<GetPeginStatusResponse>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/interfaces.ts:22](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/interfaces.ts#L22)

###### Parameters

###### params

###### pegin_txid

`string`

###### signal?

`AbortSignal`

###### Returns

`Promise`\<[`GetPeginStatusResponse`](clients.md#getpeginstatusresponse)\>

***

### WotsKeySubmitter

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/interfaces.ts:29](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/interfaces.ts#L29)

Write VP operations for WOTS key submission.

#### Methods

##### submitDepositorWotsKey()

```ts
submitDepositorWotsKey(params, signal?): Promise<void>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/interfaces.ts:30](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/interfaces.ts#L30)

###### Parameters

###### params

[`SubmitDepositorWotsKeyParams`](clients.md#submitdepositorwotskeyparams)

###### signal?

`AbortSignal`

###### Returns

`Promise`\<`void`\>

***

### PresignClient

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/interfaces.ts:37](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/interfaces.ts#L37)

VP operations for the presign transaction flow.

#### Methods

##### requestDepositorPresignTransactions()

```ts
requestDepositorPresignTransactions(params, signal?): Promise<RequestDepositorPresignTransactionsResponse>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/interfaces.ts:38](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/interfaces.ts#L38)

###### Parameters

###### params

[`RequestDepositorPresignTransactionsParams`](clients.md#requestdepositorpresigntransactionsparams)

###### signal?

`AbortSignal`

###### Returns

`Promise`\<[`RequestDepositorPresignTransactionsResponse`](clients.md#requestdepositorpresigntransactionsresponse)\>

##### submitDepositorPresignatures()

```ts
submitDepositorPresignatures(params, signal?): Promise<void>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/interfaces.ts:42](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/interfaces.ts#L42)

###### Parameters

###### params

[`SubmitDepositorPresignaturesParams`](clients.md#submitdepositorpresignaturesparams)

###### signal?

`AbortSignal`

###### Returns

`Promise`\<`void`\>

***

### ClaimerArtifactsReader

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/interfaces.ts:49](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/interfaces.ts#L49)

VP operations for depositor-as-claimer artifacts (separate from payout signing).

#### Methods

##### requestDepositorClaimerArtifacts()

```ts
requestDepositorClaimerArtifacts(params, signal?): Promise<RequestDepositorClaimerArtifactsResponse>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/interfaces.ts:50](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/interfaces.ts#L50)

###### Parameters

###### params

[`RequestDepositorClaimerArtifactsParams`](clients.md#requestdepositorclaimerartifactsparams)

###### signal?

`AbortSignal`

###### Returns

`Promise`\<[`RequestDepositorClaimerArtifactsResponse`](clients.md#requestdepositorclaimerartifactsresponse)\>

***

### PeginProtocolState

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts:64](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts#L64)

Protocol-level peg-in state (framework-agnostic)

#### Properties

##### contractStatus

```ts
contractStatus: ContractStatus;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts:66](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts#L66)

Smart contract status (source of truth for on-chain state)

##### availableActions

```ts
availableActions: PeginAction[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts:68](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts#L68)

Available user actions (empty array when no action is available)

***

### GetPeginProtocolStateOptions

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts:78](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts#L78)

Options for getPeginProtocolState function.

All fields represent protocol-level state from the vault provider or
on-chain contracts. Client-side tracking (localStorage, polling state)
is NOT included — consumers handle that in their own layer.

#### Properties

##### transactionsReady?

```ts
optional transactionsReady: boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts:80](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts#L80)

Whether claim/payout transactions are ready from VP

##### needsWotsKey?

```ts
optional needsWotsKey: boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts:82](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts#L82)

Whether the vault provider is waiting for the depositor's WOTS public key

##### pendingIngestion?

```ts
optional pendingIngestion: boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts:84](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts#L84)

Whether the vault provider hasn't ingested this peg-in yet

##### canRefund?

```ts
optional canRefund: boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts:86](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts#L86)

Whether the depositor can refund the HTLC (Pre-PegIn tx available)

##### hasProviderTerminalFailure?

```ts
optional hasProviderTerminalFailure: boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts:88](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts#L88)

Whether the vault provider reported a terminal failure

***

### PayoutSigningContext

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts:36](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts#L36)

Context required for signing payout transactions.
Caller builds this from on-chain data (contract queries, GraphQL, config).

#### Properties

##### peginTxHex

```ts
peginTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts:38](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts#L38)

Raw pegin BTC transaction hex (for PSBT construction)

##### vaultProviderBtcPubkey

```ts
vaultProviderBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts:40](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts#L40)

Vault provider's BTC public key (x-only hex, no prefix)

##### vaultKeeperBtcPubkeys

```ts
vaultKeeperBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts:42](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts#L42)

Sorted vault keeper BTC public keys (x-only hex, no prefix)

##### universalChallengerBtcPubkeys

```ts
universalChallengerBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts:44](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts#L44)

Sorted universal challenger BTC public keys (x-only hex, no prefix)

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts:46](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts#L46)

Depositor's BTC public key (x-only hex, no prefix)

##### timelockPegin

```ts
timelockPegin: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts:48](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts#L48)

Pegin timelock from the locked offchain params version

##### timelockAssert

```ts
timelockAssert: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts:55](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts#L55)

Assert CSV timelock from the locked offchain params version (blocks).
Source: ProtocolParams contract via
`ViemProtocolParamsReader.getOffchainParamsByVersion(...).timelockAssert`.
Required for the depositor-graph NoPayout local rebuild.

##### councilMembers

```ts
councilMembers: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts:62](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts#L62)

Security council member x-only public keys (hex, no prefix).
Source: ProtocolParams contract via
`getOffchainParamsByVersion(...).securityCouncilKeys`.
Required for the depositor-graph NoPayout local rebuild.

##### councilQuorum

```ts
councilQuorum: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts:69](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts#L69)

M-of-N council quorum threshold.
Source: ProtocolParams contract via
`getOffchainParamsByVersion(...).councilQuorum`.
Required for the depositor-graph NoPayout local rebuild.

##### network

```ts
network: Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts:71](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts#L71)

BTC network (Mainnet, Testnet, etc.)

##### registeredPayoutScriptPubKey

```ts
registeredPayoutScriptPubKey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts:73](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts#L73)

On-chain registered depositor payout scriptPubKey (hex)

##### commissionBps

```ts
commissionBps: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts:75](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts#L75)

VP commission (bps) from `BTCVaultRegistry`; caps the VP-claimer payout commission output.

***

### RunDepositorPresignFlowParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts:78](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts#L78)

#### Properties

##### statusReader

```ts
statusReader: PeginStatusReader;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts:80](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts#L80)

VP client implementing the status reader interface

##### presignClient

```ts
presignClient: PresignClient;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts:82](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts#L82)

VP client implementing the presign transaction flow interface

##### btcWallet

```ts
btcWallet: BitcoinWallet;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts:84](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts#L84)

Bitcoin wallet for signing

##### peginTxid

```ts
peginTxid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts:86](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts#L86)

BTC pegin transaction ID (unprefixed hex, 64 chars)

##### depositorPk

```ts
depositorPk: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts:88](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts#L88)

Depositor's x-only BTC public key (unprefixed hex, 64 chars)

##### signingContext

```ts
signingContext: PayoutSigningContext;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts:90](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts#L90)

Signing context built from on-chain data

##### timeoutMs?

```ts
optional timeoutMs: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts:92](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts#L92)

Maximum polling timeout in milliseconds (default: 20 min)

##### signal?

```ts
optional signal: AbortSignal;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts:94](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts#L94)

AbortSignal for cancellation

##### onProgress()?

```ts
optional onProgress: (completed, total) => void;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts:96](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts#L96)

Optional progress callback (completed claimers, total claimers)

###### Parameters

###### completed

`number`

###### total

`number`

###### Returns

`void`

***

### DepositorGraphSigningContext

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts:490](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts#L490)

Authoritative inputs required to construct the depositor's Payout AND every
per-challenger NoPayout PSBT locally. Every field here must come from
trusted on-chain sources, not from the vault provider response. They feed
directly into the Taproot sighash.

#### Properties

##### peginTxHex

```ts
peginTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts:492](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts#L492)

Raw pegin BTC transaction hex (provides the depositor's signed prevout)

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts:494](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts#L494)

Depositor's BTC public key (x-only, 64-char hex, no 0x prefix)

##### vaultProviderBtcPubkey

```ts
vaultProviderBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts:496](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts#L496)

Vault provider's BTC public key (x-only hex, no prefix)

##### vaultKeeperBtcPubkeys

```ts
vaultKeeperBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts:498](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts#L498)

Sorted vault keeper BTC public keys (x-only hex, no prefix)

##### universalChallengerBtcPubkeys

```ts
universalChallengerBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts:500](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts#L500)

Sorted universal challenger BTC public keys (x-only hex, no prefix)

##### timelockPegin

```ts
timelockPegin: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts:502](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts#L502)

Pegin CSV timelock from the locked offchain params version (blocks)

##### timelockAssert

```ts
timelockAssert: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts:508](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts#L508)

Assert CSV timelock from the locked offchain params version (blocks).
Sourced from the on-chain ProtocolParams contract via
`ViemProtocolParamsReader.getOffchainParamsByVersion(...).timelockAssert`.

##### councilMembers

```ts
councilMembers: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts:514](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts#L514)

Security council member x-only public keys (hex, no prefix). Sourced from
the on-chain ProtocolParams contract via
`ViemProtocolParamsReader.getOffchainParamsByVersion(...).securityCouncilKeys`.

##### councilQuorum

```ts
councilQuorum: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts:519](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts#L519)

M-of-N council quorum threshold. Sourced from the on-chain ProtocolParams
contract via `ViemProtocolParamsReader.getOffchainParamsByVersion(...).councilQuorum`.

##### network

```ts
network: Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts:521](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts#L521)

BTC network (Mainnet, Testnet, etc.)

##### registeredPayoutScriptPubKey

```ts
registeredPayoutScriptPubKey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts:527](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts#L527)

On-chain registered depositor payout scriptPubKey (hex, with or without
0x prefix). Used to assert the VP-advertised payout transaction pays to
the depositor's registered address before the wallet produces a signature.

***

### SignDepositorGraphParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts:530](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts#L530)

#### Properties

##### depositorGraph

```ts
depositorGraph: DepositorGraphTransactions;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts:532](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts#L532)

The depositor graph from VP response

##### btcWallet

```ts
btcWallet: BitcoinWallet;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts:534](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts#L534)

Bitcoin wallet for signing

##### signingContext

```ts
signingContext: DepositorGraphSigningContext;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts:536](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts#L536)

Authoritative inputs used to rebuild every PSBT locally

***

### SubmitWotsPublicKeyParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/submitWotsPublicKey.ts:30](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/submitWotsPublicKey.ts#L30)

#### Properties

##### statusReader

```ts
statusReader: PeginStatusReader;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/submitWotsPublicKey.ts:32](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/submitWotsPublicKey.ts#L32)

VP client implementing the status reader interface

##### wotsSubmitter

```ts
wotsSubmitter: WotsKeySubmitter;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/submitWotsPublicKey.ts:34](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/submitWotsPublicKey.ts#L34)

VP client implementing the WOTS key submission interface

##### peginTxid

```ts
peginTxid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/submitWotsPublicKey.ts:36](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/submitWotsPublicKey.ts#L36)

BTC pegin transaction ID (unprefixed hex, 64 chars)

##### depositorPk

```ts
depositorPk: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/submitWotsPublicKey.ts:38](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/submitWotsPublicKey.ts#L38)

Depositor's x-only BTC public key (unprefixed hex, 64 chars)

##### wotsPublicKeys

```ts
wotsPublicKeys: WotsBlockPublicKey[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/submitWotsPublicKey.ts:40](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/submitWotsPublicKey.ts#L40)

Pre-derived WOTS block public keys (one per assert block)

##### timeoutMs?

```ts
optional timeoutMs: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/submitWotsPublicKey.ts:42](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/submitWotsPublicKey.ts#L42)

Maximum time to wait for VP to be ready (default: 5 min)

##### signal?

```ts
optional signal: AbortSignal;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/submitWotsPublicKey.ts:44](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/submitWotsPublicKey.ts#L44)

AbortSignal for cancellation

***

### ValidateOnChainParticipantKeysParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts:10](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts#L10)

#### Properties

##### vaultRegistryReader

```ts
vaultRegistryReader: VaultRegistryReader;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts:11](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts#L11)

##### vaultKeeperReader

```ts
vaultKeeperReader: VaultKeeperReader;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts:12](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts#L12)

##### universalChallengerReader

```ts
universalChallengerReader: UniversalChallengerReader;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts:13](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts#L13)

##### vaultProviderEthAddress

```ts
vaultProviderEthAddress: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts:14](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts#L14)

##### applicationEntryPoint

```ts
applicationEntryPoint: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts:15](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts#L15)

##### expectedVaultProviderBtcPubkey

```ts
expectedVaultProviderBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts:16](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts#L16)

##### expectedVaultKeeperBtcPubkeys

```ts
expectedVaultKeeperBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts:17](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts#L17)

##### expectedUniversalChallengerBtcPubkeys

```ts
expectedUniversalChallengerBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts:18](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts#L18)

***

### ValidatedOnChainParticipantKeys

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts:21](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts#L21)

#### Properties

##### vaultProviderBtcPubkeyXOnly

```ts
vaultProviderBtcPubkeyXOnly: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts:22](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts#L22)

##### vaultKeeperBtcPubkeysSorted

```ts
vaultKeeperBtcPubkeysSorted: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts:23](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts#L23)

##### universalChallengerBtcPubkeysSorted

```ts
universalChallengerBtcPubkeysSorted: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts:24](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts#L24)

##### expectedAppVaultKeepersVersion

```ts
expectedAppVaultKeepersVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts:25](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts#L25)

##### expectedUniversalChallengersVersion

```ts
expectedUniversalChallengersVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts:26](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts#L26)

***

### ValidationResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts:22](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts#L22)

#### Properties

##### valid

```ts
valid: boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts:23](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts#L23)

##### error?

```ts
optional error: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts:24](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts#L24)

##### warnings?

```ts
optional warnings: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts:25](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts#L25)

***

### DepositFormValidityParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts:31](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts#L31)

Parameters for checking if a deposit form is valid.

#### Properties

##### amountSats

```ts
amountSats: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts:33](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts#L33)

Deposit amount in satoshis

##### minDeposit

```ts
minDeposit: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts:35](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts#L35)

Minimum deposit from protocol params

##### maxDeposit?

```ts
optional maxDeposit: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts:37](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts#L37)

Maximum deposit from protocol params (optional)

##### btcBalance

```ts
btcBalance: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts:39](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts#L39)

User's available BTC balance in satoshis

##### estimatedFeeSats?

```ts
optional estimatedFeeSats: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts:41](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts#L41)

Estimated transaction fee in satoshis

##### depositorClaimValue?

```ts
optional depositorClaimValue: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts:43](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts#L43)

Depositor claim value in satoshis (required output for challenge transactions)

***

### RemainingCapacityParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts:46](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts#L46)

#### Properties

##### amount

```ts
amount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts:48](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts#L48)

Requested deposit amount in satoshis

##### effectiveRemaining

```ts
effectiveRemaining: bigint | null;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts:53](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts#L53)

Effective remaining capacity in satoshis (min of protocol-total and
per-address remaining). `null` means no cap applies.

***

### MultiVaultDepositFlowInputs

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts:72](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts#L72)

Parameters for validating multi-vault deposit flow inputs.

Callers must resolve any async loading states before calling — the SDK
validates resolved data, not React hook state.

Form-flow checks (wallet connected, provider selected) are the caller's
responsibility and are NOT performed here.

#### Properties

##### vaultAmounts

```ts
vaultAmounts: bigint[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts:73](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts#L73)

##### confirmedUTXOs

```ts
confirmedUTXOs: UtxoLike[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts:74](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts#L74)

##### vaultProviderBtcPubkey

```ts
vaultProviderBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts:75](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts#L75)

##### vaultKeeperBtcPubkeys

```ts
vaultKeeperBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts:76](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts#L76)

##### universalChallengerBtcPubkeys

```ts
universalChallengerBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts:77](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts#L77)

##### minDeposit

```ts
minDeposit: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts:79](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts#L79)

Protocol minimum deposit per vault (satoshis)

##### maxDeposit?

```ts
optional maxDeposit: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts:81](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts#L81)

Protocol maximum deposit per vault (satoshis)

***

### VerifyRegisteredVaultVersionsParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredVaultVersions.ts:5](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredVaultVersions.ts#L5)

#### Properties

##### vaultRegistryReader

```ts
vaultRegistryReader: VaultRegistryReader;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredVaultVersions.ts:6](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredVaultVersions.ts#L6)

##### vaultIds

```ts
vaultIds: readonly `0x${string}`[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredVaultVersions.ts:7](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredVaultVersions.ts#L7)

##### expectedOffchainParamsVersion

```ts
expectedOffchainParamsVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredVaultVersions.ts:8](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredVaultVersions.ts#L8)

##### expectedAppVaultKeepersVersion

```ts
expectedAppVaultKeepersVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredVaultVersions.ts:9](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredVaultVersions.ts#L9)

##### expectedUniversalChallengersVersion

```ts
expectedUniversalChallengersVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredVaultVersions.ts:10](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredVaultVersions.ts#L10)

***

### WaitForPeginStatusParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/waitForPeginStatus.ts:19](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/waitForPeginStatus.ts#L19)

#### Properties

##### statusReader

```ts
statusReader: PeginStatusReader;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/waitForPeginStatus.ts:21](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/waitForPeginStatus.ts#L21)

VP client implementing the status reader interface

##### peginTxid

```ts
peginTxid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/waitForPeginStatus.ts:23](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/waitForPeginStatus.ts#L23)

BTC pegin transaction ID (unprefixed hex, 64 chars)

##### targetStatuses

```ts
targetStatuses: ReadonlySet<DaemonStatus>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/waitForPeginStatus.ts:25](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/waitForPeginStatus.ts#L25)

Set of acceptable statuses — polling stops when the VP reports one of these

##### timeoutMs

```ts
timeoutMs: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/waitForPeginStatus.ts:27](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/waitForPeginStatus.ts#L27)

Maximum time to wait in milliseconds

##### pollIntervalMs?

```ts
optional pollIntervalMs: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/waitForPeginStatus.ts:29](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/waitForPeginStatus.ts#L29)

Polling interval in milliseconds (default: 10s)

##### signal?

```ts
optional signal: AbortSignal;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/waitForPeginStatus.ts:31](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/waitForPeginStatus.ts#L31)

AbortSignal for cancellation

***

### VaultBatchEntry

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:110](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L110)

One vault's per-HTLC binding in a Pre-PegIn batch. Carries the fields
needed to reconstruct the WASM `WasmPrePeginTx` template byte-for-byte
against the funded transaction.

#### Properties

##### hashlock

```ts
hashlock: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:112](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L112)

SHA-256 hashlock commitment for this vault (bytes32, 0x-prefixed).

##### amount

```ts
amount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:114](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L114)

HTLC output value in satoshis for this vault.

##### htlcVout

```ts
htlcVout: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:116](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L116)

Index of this vault's HTLC output in the funded Pre-PegIn tx.

***

### VaultRefundData

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:132](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L132)

Authoritative vault fields needed to build a refund. Versioning fields,
the hashlock, and htlcVout must come from the on-chain contract (never the
indexer). The amount + `unsignedPrePeginTxHex` + `depositorBtcPubkey` can
come from the indexer since they are not security-critical for signing
(the PSBT builder re-derives the HTLC script from on-chain params).

`batch` is the full, vout-ordered HTLC vector for the Pre-PegIn (one
entry per sibling vault that shares this funded transaction). For a
single-vault deposit this is a length-1 array. For batched deposits
(e.g. the Aave split) the orchestrator passes every sibling through
so the WASM template matches the funded tx's shape.

#### Properties

##### hashlock

```ts
hashlock: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:133](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L133)

##### htlcVout

```ts
htlcVout: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:134](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L134)

##### offchainParamsVersion

```ts
offchainParamsVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:135](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L135)

##### appVaultKeepersVersion

```ts
appVaultKeepersVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:136](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L136)

##### universalChallengersVersion

```ts
universalChallengersVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:137](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L137)

##### vaultProvider

```ts
vaultProvider: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:138](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L138)

##### applicationEntryPoint

```ts
applicationEntryPoint: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:139](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L139)

##### amount

```ts
amount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:141](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L141)

Pre-PegIn HTLC output value in satoshis.

##### unsignedPrePeginTxHex

```ts
unsignedPrePeginTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:147](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L147)

Funded, pre-witness Pre-PegIn transaction hex. 0x prefix optional.
The name mirrors the contract/indexer schema; the bytes are the
funded form (refund construction needs real outpoints).

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:149](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L149)

Depositor's BTC public key (x-only or compressed hex; 0x prefix optional).

##### batch

```ts
batch: readonly VaultBatchEntry[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:156](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L156)

Full vout-ordered HTLC vector for the funded Pre-PegIn (one entry
per sibling vault, including the target vault). Must satisfy
`batch[i].htlcVout === i` for all i, and the target's `htlcVout` /
`hashlock` / `amount` must equal `batch[vault.htlcVout]`.

***

### RefundPrePeginContext

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:171](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L171)

Version-resolved protocol context that parameterises the HTLC's taproot
scripts. The *signer-set* fields (`vaultKeeperPubkeys`,
`universalChallengerPubkeys`) and the version-locked numeric protocol
params **must** be sourced from the on-chain contract at the version
pinned in [VaultRefundData](#vaultrefunddata) — this is the trust boundary.
`vaultProviderPubkey` today is sourced from the GraphQL indexer via
`fetchVaultProviderById`; the caller is responsible for any additional
cross-check it requires. Keeper and challenger pubkey arrays must be
pre-sorted the same way the Rust protocol sorts them (canonical for
script derivation).

#### Properties

##### vaultProviderPubkey

```ts
vaultProviderPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:172](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L172)

##### vaultKeeperPubkeys

```ts
vaultKeeperPubkeys: readonly string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:173](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L173)

##### universalChallengerPubkeys

```ts
universalChallengerPubkeys: readonly string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:174](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L174)

##### timelockRefund

```ts
timelockRefund: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:175](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L175)

##### feeRate

```ts
feeRate: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:176](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L176)

##### minPeginFeeRate

```ts
minPeginFeeRate: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:177](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L177)

##### numLocalChallengers

```ts
numLocalChallengers: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:178](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L178)

##### councilQuorum

```ts
councilQuorum: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:179](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L179)

##### councilSize

```ts
councilSize: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:180](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L180)

##### network

```ts
network: Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:181](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L181)

***

### BtcBroadcastResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:185](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L185)

Minimum shape required from a broadcast result.

#### Properties

##### txId

```ts
txId: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:186](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L186)

***

### RefundInput

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:198](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L198)

#### Type Parameters

##### R

`R` *extends* [`BtcBroadcastResult`](#btcbroadcastresult) = [`BtcBroadcastResult`](#btcbroadcastresult)

#### Properties

##### vaultId

```ts
vaultId: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:201](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L201)

##### readVault()

```ts
readVault: () => Promise<VaultRefundData>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:207](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L207)

Fetch authoritative on-chain + indexer vault data. The SDK passes no
arguments — the caller closes over `vaultId` (or any other context it
needs).

###### Returns

`Promise`\<[`VaultRefundData`](#vaultrefunddata)\>

##### readPrePeginContext()

```ts
readPrePeginContext: (vault) => Promise<RefundPrePeginContext>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:212](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L212)

Fetch the version-pinned refund context (sorted pubkeys, timelock, etc.)
derived from the vault's locked versions.

###### Parameters

###### vault

[`VaultRefundData`](#vaultrefunddata)

###### Returns

`Promise`\<[`RefundPrePeginContext`](#refundprepegincontext)\>

##### feeRate

```ts
feeRate: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:221](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L221)

Mempool-derived sat/vB fee rate to use for the refund tx (positive
number). Caller fetches this before invoking — it does not depend on
any value the SDK computes, and folding it into the call keeps the
orchestration honest.

##### signPsbt

```ts
signPsbt: RefundPsbtSigner;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:223](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L223)

BTC wallet signer; receives a PSBT hex + taproot script-path options.

##### broadcastTx

```ts
broadcastTx: BtcBroadcaster<R>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:225](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L225)

Broadcast callback — returns whatever shape the caller needs.

##### signal?

```ts
optional signal: AbortSignal;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:227](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L227)

Checked at every async boundary.

## Type Aliases

### EthContractWriter()

```ts
type EthContractWriter<R> = (call) => Promise<R>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts:79](../../packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts#L79)

Caller-provided contract writer. The generic `R` lets callers return any
transport-specific result shape (e.g. `{ transactionHash, receipt }`);
the SDK forwards that shape back through `activateVault`.

#### Type Parameters

##### R

`R` *extends* [`EthContractWriteResult`](#ethcontractwriteresult) = [`EthContractWriteResult`](#ethcontractwriteresult)

#### Parameters

##### call

[`EthContractWriteCall`](#ethcontractwritecall)

#### Returns

`Promise`\<`R`\>

***

### ExpirationReason

```ts
type ExpirationReason = "ack_timeout" | "proof_timeout" | "activation_timeout";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts:36](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts#L36)

Reason why a vault expired

***

### BtcBroadcaster()

```ts
type BtcBroadcaster<R> = (signedTxHex) => Promise<R>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:189](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L189)

#### Type Parameters

##### R

`R` *extends* [`BtcBroadcastResult`](#btcbroadcastresult) = [`BtcBroadcastResult`](#btcbroadcastresult)

#### Parameters

##### signedTxHex

`string`

#### Returns

`Promise`\<`R`\>

***

### RefundPsbtSigner()

```ts
type RefundPsbtSigner = (psbtHex, opts) => Promise<string>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:193](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L193)

#### Parameters

##### psbtHex

`string`

##### opts

[`SignPsbtOptions`](managers.md#signpsbtoptions)

#### Returns

`Promise`\<`string`\>

## Functions

### activateVault()

```ts
function activateVault<R>(input): Promise<R>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts:136](../../packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts#L136)

Reveal the HTLC secret on Ethereum and activate the vault.

Validates inputs, optionally pre-checks the secret against the expected
hashlock, and delegates the contract write to `writeContract`. Returns
whatever the writer returns so callers can keep richer transport-specific
metadata (e.g. viem receipts) end-to-end.

#### Type Parameters

##### R

`R` *extends* [`EthContractWriteResult`](#ethcontractwriteresult) = [`EthContractWriteResult`](#ethcontractwriteresult)

#### Parameters

##### input

[`ActivateVaultInput`](#activatevaultinput)\<`R`\>

#### Returns

`Promise`\<`R`\>

#### Throws

`Error` if `btcVaultRegistryAddress` is not a valid 20-byte address

#### Throws

`Error` if `vaultId` or `secret` is not a valid 32-byte hex

#### Throws

`Error` if `hashlock` is provided and is not a valid 32-byte hex,
        or if `sha256(secret) != hashlock`

#### Throws

`Error` if `activationMetadata` is not a 0x-prefixed hex byte
        string (must have an even number of hex chars). Pass `"0x"` for
        empty metadata.

#### Throws

whatever the injected `writeContract` throws

#### Throws

`AbortError` / caller-provided abort reason if `signal` aborts

***

### getPeginProtocolState()

```ts
function getPeginProtocolState(contractStatus, options): PeginProtocolState;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts:108](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts#L108)

Determine the current protocol state and available actions based on contract
status and vault provider state. Framework-agnostic: returns only
protocol-level data with no display labels, messages, or UI concerns.

Client-side tracking overrides (e.g. suppressing actions after the user
has already acted but on-chain state hasn't caught up) are the caller's
responsibility.

#### Parameters

##### contractStatus

[`ContractStatus`](#contractstatus)

On-chain contract status (source of truth)

##### options

[`GetPeginProtocolStateOptions`](#getpeginprotocolstateoptions) = `{}`

Vault provider state

#### Returns

[`PeginProtocolState`](#peginprotocolstate)

Protocol state with available actions

***

### canPerformAction()

```ts
function canPerformAction(state, action): boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts:193](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts#L193)

Check if a specific action is available in the current state

#### Parameters

##### state

[`PeginProtocolState`](#peginprotocolstate)

##### action

[`PeginAction`](#peginaction)

#### Returns

`boolean`

***

### runDepositorPresignFlow()

```ts
function runDepositorPresignFlow(params): Promise<void>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts:296](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts#L296)

Poll for payout transactions, sign them, sign the depositor graph,
and submit all signatures to the vault provider.

This is the main deposit protocol step between registration and activation.

#### Parameters

##### params

[`RunDepositorPresignFlowParams`](#rundepositorpresignflowparams)

#### Returns

`Promise`\<`void`\>

#### Throws

Error on timeout, abort, signing failure, or RPC error

***

### signDepositorGraph()

```ts
function signDepositorGraph(params): Promise<DepositorAsClaimerPresignatures>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts:548](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts#L548)

Sign all depositor graph transactions and assemble into presignatures.

Flow:
1. Build payout + per-challenger nopayout PSBTs locally
2. Batch sign via wallet.signPsbts() if available, else sequential signPsbt()
3. Extract Schnorr signatures from each signed PSBT
4. Assemble into DepositorAsClaimerPresignatures

#### Parameters

##### params

[`SignDepositorGraphParams`](#signdepositorgraphparams)

#### Returns

`Promise`\<[`DepositorAsClaimerPresignatures`](clients.md#depositorasclaimerpresignatures)\>

***

### submitWotsPublicKey()

```ts
function submitWotsPublicKey(params): Promise<void>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/submitWotsPublicKey.ts:52](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/submitWotsPublicKey.ts#L52)

Submit WOTS public keys to the vault provider.

#### Parameters

##### params

[`SubmitWotsPublicKeyParams`](#submitwotspublickeyparams)

#### Returns

`Promise`\<`void`\>

#### Throws

Error on timeout, abort, or RPC error

***

### validateOnChainParticipantKeys()

```ts
function validateOnChainParticipantKeys(params): Promise<ValidatedOnChainParticipantKeys>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts:29](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts#L29)

#### Parameters

##### params

[`ValidateOnChainParticipantKeysParams`](#validateonchainparticipantkeysparams)

#### Returns

`Promise`\<[`ValidatedOnChainParticipantKeys`](#validatedonchainparticipantkeys)\>

***

### isDepositAmountValid()

```ts
function isDepositAmountValid(params): boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts:102](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts#L102)

Check if deposit amount is within valid range and affordable.

Returns false when fees/claim value are not yet known (still loading),
and includes them in the balance check once available.

#### Parameters

##### params

[`DepositFormValidityParams`](#depositformvalidityparams)

#### Returns

`boolean`

***

### validateDepositAmount()

```ts
function validateDepositAmount(
   amount, 
   minDeposit, 
   maxDeposit?): ValidationResult;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts:129](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts#L129)

Validate deposit amount against minimum and maximum constraints.

#### Parameters

##### amount

`bigint`

##### minDeposit

`bigint`

##### maxDeposit?

`bigint`

#### Returns

[`ValidationResult`](#validationresult)

***

### validateRemainingCapacity()

```ts
function validateRemainingCapacity(params): ValidationResult;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts:161](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts#L161)

Validate that the requested deposit fits within the effective remaining cap.

#### Parameters

##### params

[`RemainingCapacityParams`](#remainingcapacityparams)

#### Returns

[`ValidationResult`](#validationresult)

***

### validateProviderSelection()

```ts
function validateProviderSelection(selectedProviders, availableProviders): ValidationResult;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts:189](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts#L189)

Validate that selected providers exist in the available set.

Business rules (e.g. single-provider limit) are the caller's responsibility.

#### Parameters

##### selectedProviders

`string`[]

##### availableProviders

`string`[]

#### Returns

[`ValidationResult`](#validationresult)

***

### validateVaultAmounts()

```ts
function validateVaultAmounts(
   amounts, 
   minDeposit?, 
   maxDeposit?): ValidationResult;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts:223](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts#L223)

Validate vault amounts array for multi-vault deposits.
Checks count, positivity, and per-vault min/max protocol limits.

Max vault count limits are the caller's responsibility.

#### Parameters

##### amounts

`bigint`[]

##### minDeposit?

`bigint`

##### maxDeposit?

`bigint`

#### Returns

[`ValidationResult`](#validationresult)

***

### validateVaultProviderPubkey()

```ts
function validateVaultProviderPubkey(pubkey): ValidationResult;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts:263](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts#L263)

Validate vault provider BTC public key format.

#### Parameters

##### pubkey

`string`

#### Returns

[`ValidationResult`](#validationresult)

***

### validateMultiVaultDepositInputs()

```ts
function validateMultiVaultDepositInputs(params): void;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts:317](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts#L317)

Validate protocol-level multi-vault deposit inputs.
Throws an error if any validation fails.

Form-flow checks (wallet connections, provider selection) must be
performed by the caller before invoking this function.

#### Parameters

##### params

[`MultiVaultDepositFlowInputs`](#multivaultdepositflowinputs)

#### Returns

`void`

***

### isRegisteredVaultVersionMismatchError()

```ts
function isRegisteredVaultVersionMismatchError(err): err is RegisteredVaultVersionMismatchError;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredVaultVersions.ts:24](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredVaultVersions.ts#L24)

#### Parameters

##### err

`unknown`

#### Returns

`err is RegisteredVaultVersionMismatchError`

***

### verifyRegisteredVaultVersions()

```ts
function verifyRegisteredVaultVersions(params): Promise<void>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredVaultVersions.ts:33](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredVaultVersions.ts#L33)

#### Parameters

##### params

[`VerifyRegisteredVaultVersionsParams`](#verifyregisteredvaultversionsparams)

#### Returns

`Promise`\<`void`\>

***

### waitForPeginStatus()

```ts
function waitForPeginStatus(params): Promise<DaemonStatus>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/waitForPeginStatus.ts:42](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/waitForPeginStatus.ts#L42)

Poll `getPeginStatus` until the VP reaches one of the target statuses.

#### Parameters

##### params

[`WaitForPeginStatusParams`](#waitforpeginstatusparams)

#### Returns

`Promise`\<[`DaemonStatus`](clients.md#daemonstatus)\>

The DaemonStatus that matched one of the targets, OR
  `DaemonStatus.ACTIVATED` if the VP raced past the requested target into the
  happy-path terminal (success-via-overshoot — the goal is satisfied).

#### Throws

Error on timeout, abort, non-transient RPC error, or any terminal status (`Expired` + `VP_TERMINAL_FAILURE_STATUSES`) not in `targetStatuses`.

***

### computeHashlock()

```ts
function computeHashlock(secret): `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/htlc/index.ts:77](../../packages/babylon-ts-sdk/src/tbv/core/services/htlc/index.ts#L77)

Compute the SHA-256 hashlock from a secret preimage.

Matches the on-chain validation: `sha256(abi.encodePacked(s))` where `s` is a `bytes32`.
`abi.encodePacked(bytes32)` is just the raw 32 bytes — no ABI padding.

#### Parameters

##### secret

`` `0x${string}` ``

0x-prefixed bytes32 secret (66 hex chars)

#### Returns

`` `0x${string}` ``

0x-prefixed bytes32 SHA-256 hash

#### Throws

if secret is not exactly 32 bytes

***

### validateSecretAgainstHashlock()

```ts
function validateSecretAgainstHashlock(secret, hashlock): boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/htlc/index.ts:95](../../packages/babylon-ts-sdk/src/tbv/core/services/htlc/index.ts#L95)

Validate that a secret's SHA-256 hash matches the expected hashlock.

Use this for client-side pre-validation before sending the activation
transaction to avoid wasting gas on a contract revert.

#### Parameters

##### secret

`` `0x${string}` ``

0x-prefixed bytes32 secret (66 hex chars)

##### hashlock

`` `0x${string}` ``

0x-prefixed bytes32 expected hashlock from the vault

#### Returns

`boolean`

true if SHA-256(secret) matches the hashlock

#### Throws

if secret or hashlock is not exactly 32 bytes

***

### isRecognizedPegoutStatus()

```ts
function isRecognizedPegoutStatus(status): boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts:27](../../packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts#L27)

Whether a claimer status string maps to a known pegout state.

#### Parameters

##### status

`string`

#### Returns

`boolean`

***

### isPegoutTerminalStatus()

```ts
function isPegoutTerminalStatus(claimerStatus): boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts:38](../../packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts#L38)

Whether a claimer status is a hard-terminal pegout status
(PayoutBroadcast or PayoutBlocked). Soft-terminal conditions (polling
thresholds) are a consumer-side concern.

#### Parameters

##### claimerStatus

`string` | `undefined`

#### Returns

`boolean`

***

### estimateRefundFeeSats()

```ts
function estimateRefundFeeSats(feeRateSatsVb): bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:77](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L77)

Network fee (sats) the SDK will charge for a refund tx at the given
sat/vB rate. Mirrors the internal computation in
[buildAndBroadcastRefund](#buildandbroadcastrefund) so callers (e.g. UI fee previews) don't
have to duplicate the constant.

#### Parameters

##### feeRateSatsVb

`number`

#### Returns

`bigint`

***

### buildAndBroadcastRefund()

```ts
function buildAndBroadcastRefund<R>(input): Promise<R>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:390](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L390)

Build, sign, and broadcast a refund transaction for an expired vault.

Trust boundary: `readVault` must source the hashlock, htlcVout, and
versioning fields from the on-chain contract — an indexer-only path
leaves the refund flow open to signer-set substitution. The SDK does
not enforce this; it is the caller's responsibility.

The broadcast transport is expected to surface Bitcoin's `non-BIP68-final`
policy rejection as an `Error` whose message contains that string; when
it does, the SDK wraps it in [BIP68NotMatureError](#bip68notmatureerror). All other
transport errors propagate unchanged.

#### Type Parameters

##### R

`R` *extends* [`BtcBroadcastResult`](#btcbroadcastresult) = [`BtcBroadcastResult`](#btcbroadcastresult)

#### Parameters

##### input

[`RefundInput`](#refundinput)\<`R`\>

#### Returns

`Promise`\<`R`\>

whatever the injected `broadcastTx` returns (generic pass-through)

#### Throws

`Error` if any validation fails

#### Throws

[BIP68NotMatureError](#bip68notmatureerror) if the broadcast is rejected because
        the refund CSV timelock has not yet matured

#### Throws

anything `readVault`, `readPrePeginContext`,
        `signPsbt`, or `broadcastTx` throws

## Enumerations

### ContractStatus

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts:16](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts#L16)

Vault status — combines on-chain contract status (0-4) with indexer-derived
statuses (5-7). The contract enum (BTCVaultRegistry.sol BTCVaultStatus) only
has: Pending(0), Verified(1), Active(2), Redeemed(3), Expired(4).
The indexer maps these and adds extra statuses for UI display.

IMPORTANT: With the new contract architecture:
- Core vault status (BTCVaultRegistry) does NOT change when used by applications
- Vaults remain at ACTIVE status even when used in DeFi positions
- Application usage status is tracked separately by each integration controller

#### Enumeration Members

##### PENDING

```ts
PENDING: 0;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts:18](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts#L18)

Status 0: Request submitted, waiting for ACKs

##### VERIFIED

```ts
VERIFIED: 1;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts:20](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts#L20)

Status 1: All ACKs collected, ready for secret activation

##### ACTIVE

```ts
ACTIVE: 2;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts:22](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts#L22)

Status 2: HTLC secret revealed, vault is active and usable (stays here even when used by apps)

##### REDEEMED

```ts
REDEEMED: 3;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts:24](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts#L24)

Status 3: Vault has been redeemed, BTC is claimable

##### LIQUIDATED

```ts
LIQUIDATED: 4;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts:26](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts#L26)

Status 4 (indexer-only): Vault was liquidated (collateral seized due to unpaid debt)

##### INVALID

```ts
INVALID: 5;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts:28](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts#L28)

Status 5 (indexer-only): Vault is invalid — BTC UTXOs were spent in a different transaction

##### DEPOSITOR\_WITHDRAWN

```ts
DEPOSITOR_WITHDRAWN: 6;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts:30](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts#L30)

Status 6 (indexer-only): Depositor has withdrawn their BTC (redemption complete)

##### EXPIRED

```ts
EXPIRED: 7;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts:32](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts#L32)

Status 7 (indexer-only): Vault expired due to AckTimeout or ActivationTimeout

***

### PeginAction

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts:48](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts#L48)

Available actions user can take

#### Enumeration Members

##### SUBMIT\_WOTS\_KEY

```ts
SUBMIT_WOTS_KEY: "SUBMIT_WOTS_KEY";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts:50](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts#L50)

Submit WOTS key (re-derives via wallet `deriveContextHash`)

##### SIGN\_PAYOUT\_TRANSACTIONS

```ts
SIGN_PAYOUT_TRANSACTIONS: "SIGN_PAYOUT_TRANSACTIONS";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts:52](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts#L52)

Sign payout transactions

##### SIGN\_AND\_BROADCAST\_TO\_BITCOIN

```ts
SIGN_AND_BROADCAST_TO_BITCOIN: "SIGN_AND_BROADCAST_TO_BITCOIN";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts:54](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts#L54)

Sign and broadcast peg-in transaction to Bitcoin

##### ACTIVATE\_VAULT

```ts
ACTIVATE_VAULT: "ACTIVATE_VAULT";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts:56](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts#L56)

Reveal HTLC secret on Ethereum to activate vault

##### REFUND\_HTLC

```ts
REFUND_HTLC: "REFUND_HTLC";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts:58](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts#L58)

Sign and broadcast HTLC refund transaction for an expired vault

***

### ClaimerPegoutStatusValue

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts:13](../../packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts#L13)

Claimer-side pegout statuses reported by the VP.

#### Enumeration Members

##### CLAIM\_EVENT\_RECEIVED

```ts
CLAIM_EVENT_RECEIVED: "ClaimEventReceived";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts:14](../../packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts#L14)

##### CLAIM\_BROADCAST

```ts
CLAIM_BROADCAST: "ClaimBroadcast";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts:15](../../packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts#L15)

##### ASSERT\_BROADCAST

```ts
ASSERT_BROADCAST: "AssertBroadcast";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts:16](../../packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts#L16)

##### PAYOUT\_BROADCAST

```ts
PAYOUT_BROADCAST: "PayoutBroadcast";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts:17](../../packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts#L17)

##### PAYOUT\_BLOCKED

```ts
PAYOUT_BLOCKED: "PayoutBlocked";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts:18](../../packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts#L18)

## Variables

### REFUND\_VSIZE

```ts
const REFUND_VSIZE: 160 = 160;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:44](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L44)

***

### REFUND\_MAX\_FEE\_RATE\_SATS\_VB

```ts
const REFUND_MAX_FEE_RATE_SATS_VB: 2000 = 2000;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:60](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L60)

***

### REFUND\_MAX\_FEE\_FRACTION\_NUMERATOR

```ts
const REFUND_MAX_FEE_FRACTION_NUMERATOR: 10n = 10n;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:68](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L68)

***

### REFUND\_MAX\_FEE\_FRACTION\_DENOMINATOR

```ts
const REFUND_MAX_FEE_FRACTION_DENOMINATOR: 100n = 100n;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:69](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L69)
