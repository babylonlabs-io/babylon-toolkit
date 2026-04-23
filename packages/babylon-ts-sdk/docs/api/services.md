[@babylonlabs-io/ts-sdk](README.md) / services

# services

Stateless flow helpers that compose primitives + utils with injected I/O callbacks.
Callers own the wallet; services own the orchestration.

## Classes

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signAndSubmitPayouts.ts:38](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/signAndSubmitPayouts.ts#L38)

Context required for signing payout transactions.
Caller builds this from on-chain data (contract queries, GraphQL, config).

#### Properties

##### peginTxHex

```ts
peginTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signAndSubmitPayouts.ts:40](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/signAndSubmitPayouts.ts#L40)

Raw pegin BTC transaction hex (for PSBT construction)

##### vaultProviderBtcPubkey

```ts
vaultProviderBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signAndSubmitPayouts.ts:42](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/signAndSubmitPayouts.ts#L42)

Vault provider's BTC public key (x-only hex, no prefix)

##### vaultKeeperBtcPubkeys

```ts
vaultKeeperBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signAndSubmitPayouts.ts:44](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/signAndSubmitPayouts.ts#L44)

Sorted vault keeper BTC public keys (x-only hex, no prefix)

##### universalChallengerBtcPubkeys

```ts
universalChallengerBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signAndSubmitPayouts.ts:46](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/signAndSubmitPayouts.ts#L46)

Sorted universal challenger BTC public keys (x-only hex, no prefix)

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signAndSubmitPayouts.ts:48](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/signAndSubmitPayouts.ts#L48)

Depositor's BTC public key (x-only hex, no prefix)

##### timelockPegin

```ts
timelockPegin: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signAndSubmitPayouts.ts:50](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/signAndSubmitPayouts.ts#L50)

Pegin timelock from the locked offchain params version

##### network

```ts
network: Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signAndSubmitPayouts.ts:52](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/signAndSubmitPayouts.ts#L52)

BTC network (Mainnet, Testnet, etc.)

##### registeredPayoutScriptPubKey

```ts
registeredPayoutScriptPubKey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signAndSubmitPayouts.ts:54](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/signAndSubmitPayouts.ts#L54)

On-chain registered depositor payout scriptPubKey (hex)

***

### PollAndSignPayoutsParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signAndSubmitPayouts.ts:57](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/signAndSubmitPayouts.ts#L57)

#### Properties

##### statusReader

```ts
statusReader: PeginStatusReader;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signAndSubmitPayouts.ts:59](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/signAndSubmitPayouts.ts#L59)

VP client implementing the status reader interface

##### presignClient

```ts
presignClient: PresignClient;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signAndSubmitPayouts.ts:61](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/signAndSubmitPayouts.ts#L61)

VP client implementing the presign transaction flow interface

##### btcWallet

```ts
btcWallet: BitcoinWallet;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signAndSubmitPayouts.ts:63](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/signAndSubmitPayouts.ts#L63)

Bitcoin wallet for signing

##### peginTxid

```ts
peginTxid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signAndSubmitPayouts.ts:65](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/signAndSubmitPayouts.ts#L65)

BTC pegin transaction ID (unprefixed hex, 64 chars)

##### depositorPk

```ts
depositorPk: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signAndSubmitPayouts.ts:67](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/signAndSubmitPayouts.ts#L67)

Depositor's x-only BTC public key (unprefixed hex, 64 chars)

##### signingContext

```ts
signingContext: PayoutSigningContext;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signAndSubmitPayouts.ts:69](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/signAndSubmitPayouts.ts#L69)

Signing context built from on-chain data

##### timeoutMs?

```ts
optional timeoutMs: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signAndSubmitPayouts.ts:71](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/signAndSubmitPayouts.ts#L71)

Maximum polling timeout in milliseconds (default: 20 min)

##### signal?

```ts
optional signal: AbortSignal;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signAndSubmitPayouts.ts:73](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/signAndSubmitPayouts.ts#L73)

AbortSignal for cancellation

##### onProgress()?

```ts
optional onProgress: (completed, total) => void;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signAndSubmitPayouts.ts:75](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/signAndSubmitPayouts.ts#L75)

Optional progress callback (completed claimers, total claimers)

###### Parameters

###### completed

`number`

###### total

`number`

###### Returns

`void`

***

### SignDepositorGraphParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts:218](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts#L218)

#### Properties

##### depositorGraph

```ts
depositorGraph: DepositorGraphTransactions;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts:220](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts#L220)

The depositor graph from VP response (contains pre-built PSBTs)

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts:222](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts#L222)

Depositor's BTC public key (x-only, 64-char hex, no 0x prefix)

##### btcWallet

```ts
btcWallet: BitcoinWallet;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts:224](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts#L224)

Bitcoin wallet for signing

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

##### htlcSecretHexesLength

```ts
htlcSecretHexesLength: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts:83](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts#L83)

Number of HTLC secret hexes — must match vaultAmounts.length

##### depositorSecretHashesLength

```ts
depositorSecretHashesLength: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts:85](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts#L85)

Number of depositor secret hashes — must match vaultAmounts.length

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

### VaultRefundData

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:68](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L68)

Authoritative vault fields needed to build a refund. Versioning fields,
the hashlock, and htlcVout must come from the on-chain contract (never the
indexer). The amount + `unsignedPrePeginTxHex` + `depositorBtcPubkey` can
come from the indexer since they are not security-critical for signing
(the PSBT builder re-derives the HTLC script from on-chain params).

#### Properties

##### hashlock

```ts
hashlock: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:69](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L69)

##### htlcVout

```ts
htlcVout: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:70](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L70)

##### offchainParamsVersion

```ts
offchainParamsVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:71](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L71)

##### appVaultKeepersVersion

```ts
appVaultKeepersVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:72](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L72)

##### universalChallengersVersion

```ts
universalChallengersVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:73](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L73)

##### vaultProvider

```ts
vaultProvider: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:74](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L74)

##### applicationEntryPoint

```ts
applicationEntryPoint: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:75](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L75)

##### amount

```ts
amount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:77](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L77)

Pre-PegIn HTLC output value in satoshis.

##### unsignedPrePeginTxHex

```ts
unsignedPrePeginTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:83](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L83)

Funded, pre-witness Pre-PegIn transaction hex. 0x prefix optional.
The name mirrors the contract/indexer schema; the bytes are the
funded form (refund construction needs real outpoints).

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:85](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L85)

Depositor's BTC public key (x-only or compressed hex; 0x prefix optional).

***

### RefundPrePeginContext

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:100](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L100)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:101](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L101)

##### vaultKeeperPubkeys

```ts
vaultKeeperPubkeys: readonly string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:102](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L102)

##### universalChallengerPubkeys

```ts
universalChallengerPubkeys: readonly string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:103](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L103)

##### timelockRefund

```ts
timelockRefund: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:104](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L104)

##### feeRate

```ts
feeRate: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:105](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L105)

##### numLocalChallengers

```ts
numLocalChallengers: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:106](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L106)

##### councilQuorum

```ts
councilQuorum: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:107](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L107)

##### councilSize

```ts
councilSize: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:108](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L108)

##### network

```ts
network: Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:109](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L109)

***

### BtcBroadcastResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:113](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L113)

Minimum shape required from a broadcast result.

#### Properties

##### txId

```ts
txId: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:114](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L114)

***

### RefundInput

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:126](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L126)

#### Type Parameters

##### R

`R` *extends* [`BtcBroadcastResult`](#btcbroadcastresult) = [`BtcBroadcastResult`](#btcbroadcastresult)

#### Properties

##### vaultId

```ts
vaultId: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:129](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L129)

##### readVault()

```ts
readVault: () => Promise<VaultRefundData>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:135](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L135)

Fetch authoritative on-chain + indexer vault data. The SDK passes no
arguments — the caller closes over `vaultId` (or any other context it
needs).

###### Returns

`Promise`\<[`VaultRefundData`](#vaultrefunddata)\>

##### readPrePeginContext()

```ts
readPrePeginContext: (vault) => Promise<RefundPrePeginContext>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:140](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L140)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:149](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L149)

Mempool-derived sat/vB fee rate to use for the refund tx (positive
number). Caller fetches this before invoking — it does not depend on
any value the SDK computes, and folding it into the call keeps the
orchestration honest.

##### signPsbt

```ts
signPsbt: RefundPsbtSigner;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:151](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L151)

BTC wallet signer; receives a PSBT hex + taproot script-path options.

##### broadcastTx

```ts
broadcastTx: BtcBroadcaster<R>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:153](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L153)

Broadcast callback — returns whatever shape the caller needs.

##### signal?

```ts
optional signal: AbortSignal;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:155](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L155)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:117](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L117)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:121](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L121)

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

### pollAndSignPayouts()

```ts
function pollAndSignPayouts(params): Promise<void>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signAndSubmitPayouts.ts:249](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/signAndSubmitPayouts.ts#L249)

Poll for payout transactions, sign them, sign the depositor graph,
and submit all signatures to the vault provider.

This is the main deposit protocol step between registration and activation.

#### Parameters

##### params

[`PollAndSignPayoutsParams`](#pollandsignpayoutsparams)

#### Returns

`Promise`\<`void`\>

#### Throws

Error on timeout, abort, signing failure, or RPC error

***

### signDepositorGraph()

```ts
function signDepositorGraph(params): Promise<DepositorAsClaimerPresignatures>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts:236](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts#L236)

Sign all depositor graph transactions and assemble into presignatures.

Flow:
1. Collect pre-built PSBTs from VP response (base64 -> hex)
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

### isDepositAmountValid()

```ts
function isDepositAmountValid(params): boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts:106](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts#L106)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts:133](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts#L133)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts:165](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts#L165)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts:193](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts#L193)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts:227](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts#L227)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts:267](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts#L267)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts:321](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts#L321)

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

### waitForPeginStatus()

```ts
function waitForPeginStatus(params): Promise<DaemonStatus>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/waitForPeginStatus.ts:40](../../packages/babylon-ts-sdk/src/tbv/core/services/deposit/waitForPeginStatus.ts#L40)

Poll `getPeginStatus` until the VP reaches one of the target statuses.

#### Parameters

##### params

[`WaitForPeginStatusParams`](#waitforpeginstatusparams)

#### Returns

`Promise`\<[`DaemonStatus`](clients.md#daemonstatus)\>

The DaemonStatus string that matched one of the targets

#### Throws

Error on timeout, abort, or non-transient RPC error

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts:30](../../packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts#L30)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts:41](../../packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts#L41)

Whether a claimer status is a hard-terminal pegout status
(PayoutBroadcast or Failed). Soft-terminal conditions (polling
thresholds) are a consumer-side concern.

#### Parameters

##### claimerStatus

`string` | `undefined`

#### Returns

`boolean`

***

### buildAndBroadcastRefund()

```ts
function buildAndBroadcastRefund<R>(input): Promise<R>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts:277](../../packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts#L277)

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

Submit WOTS key (re-enter mnemonic)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts:14](../../packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts#L14)

Claimer-side pegout statuses reported by the VP.

#### Enumeration Members

##### CLAIM\_EVENT\_RECEIVED

```ts
CLAIM_EVENT_RECEIVED: "ClaimEventReceived";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts:15](../../packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts#L15)

##### CLAIM\_BROADCAST

```ts
CLAIM_BROADCAST: "ClaimBroadcast";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts:16](../../packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts#L16)

##### ASSERT\_BROADCAST

```ts
ASSERT_BROADCAST: "AssertBroadcast";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts:17](../../packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts#L17)

##### CHALLENGE\_ASSERT\_OBSERVED

```ts
CHALLENGE_ASSERT_OBSERVED: "ChallengeAssertObserved";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts:18](../../packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts#L18)

##### WRONGLY\_CHALLENGED\_BROADCAST

```ts
WRONGLY_CHALLENGED_BROADCAST: "WronglyChallengedBroadcast";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts:19](../../packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts#L19)

##### PAYOUT\_BROADCAST

```ts
PAYOUT_BROADCAST: "PayoutBroadcast";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts:20](../../packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts#L20)

##### FAILED

```ts
FAILED: "Failed";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts:21](../../packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts#L21)
