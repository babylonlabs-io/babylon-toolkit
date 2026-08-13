[@babylonlabs-io/ts-sdk](README.md) / services

# services

Stateless flow helpers that compose primitives + utils with injected I/O callbacks.
Callers own the wallet; services own the orchestration.

## Classes

### ParticipantKeyDriftError

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredParticipantKeys.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredParticipantKeys.ts)

Participant operation keys drifted between building the Bitcoin artifacts
and the vault freezing its epochs.

A *sibling* of `RegisteredVaultVersionMismatchError`, never a subclass, and
the distinction is load-bearing. On a version mismatch the orchestrator drops
the local pending-pegin record, because the on-chain `prePeginTxHash` is
still the authoritative copy of the transaction and a later resume can safely
broadcast it from the indexer.

Key drift breaks exactly that assumption. The registered hash commits to a
transaction whose scripts embed the *pre-rotation* keys, while the vault
froze the *post-rotation* epoch — so every counterparty resolves a different
funding output and the deposit can never activate. Dropping the record would
discard `buildParticipantOperationKeys`, the only thing that lets the resume
path re-detect the drift; the next attempt would fall back to the indexer's
copy, pass the hash check, and broadcast the very transaction this refused,
locking BTC until the refund timelock.

So: callers must keep the pending record when they catch this.

#### Extends

- `Error`

#### Constructors

##### Constructor

```ts
new ParticipantKeyDriftError(message): ParticipantKeyDriftError;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredParticipantKeys.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredParticipantKeys.ts)

###### Parameters

###### message

`string`

###### Returns

[`ParticipantKeyDriftError`](#participantkeydrifterror)

###### Overrides

```ts
Error.constructor
```

***

### RegisteredVaultVersionMismatchError

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredVaultVersions.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredVaultVersions.ts)

#### Extends

- `Error`

#### Constructors

##### Constructor

```ts
new RegisteredVaultVersionMismatchError(message): RegisteredVaultVersionMismatchError;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredVaultVersions.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredVaultVersions.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/errors.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/errors.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/errors.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/errors.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/errors.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/errors.ts)

##### cause

```ts
readonly cause: Error;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/errors.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/errors.ts)

###### Overrides

```ts
Error.cause
```

## Interfaces

### EthContractWriteCall

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts)

A single ETH contract-write call. The SDK assembles these; the caller
executes them via viem, wagmi, a wallet provider, or any other transport.

#### Properties

##### address

```ts
address: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts)

##### abi

```ts
abi: Abi;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts)

##### functionName

```ts
functionName: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts)

##### args

```ts
args: readonly unknown[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts)

***

### EthContractWriteResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts)

Minimum shape the SDK requires from any contract-write result. Callers may
return richer objects (e.g. including the receipt) — the SDK propagates
them unchanged via the generic parameter on [EthContractWriter](#ethcontractwriter).

#### Properties

##### transactionHash

```ts
transactionHash: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts)

***

### ActivateVaultInput

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts)

#### Type Parameters

##### R

`R` *extends* [`EthContractWriteResult`](#ethcontractwriteresult) = [`EthContractWriteResult`](#ethcontractwriteresult)

#### Properties

##### btcVaultRegistryAddress

```ts
btcVaultRegistryAddress: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts)

BTCVaultRegistry contract address (env-specific).

##### vaultId

```ts
vaultId: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts)

Vault ID (bytes32, 0x-prefixed).

##### secret

```ts
secret: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts)

HTLC secret preimage (bytes32). A missing `0x` prefix or an uppercase
`0X` prefix is normalised before validation.

##### hashlock?

```ts
optional hashlock: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts)

Optional hashlock for client-side pre-validation. When provided, the SDK
rejects before calling `writeContract` if `sha256(secret) != hashlock`.

##### activationMetadata

```ts
activationMetadata: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts)

Activation metadata passed through to the contract. Required to keep
the "empty metadata" convention explicit at the call site — pass `"0x"`
(empty bytes) when no metadata is needed. Must be a 0x-prefixed hex
string with an even number of hex chars.

##### writeContract

```ts
writeContract: EthContractWriter<R>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts)

Caller-provided write callback — see [EthContractWriter](#ethcontractwriter).

##### signal?

```ts
optional signal: AbortSignal;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts)

Optional abort signal. Checked before validation runs; since validation
is fully synchronous, cancellation between validation and the write is
not observable and callers should rely on the transport's own
cancellation support for that window.

***

### ActivateVaultAndRedeemInput

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts)

#### Type Parameters

##### R

`R` *extends* [`EthContractWriteResult`](#ethcontractwriteresult) = [`EthContractWriteResult`](#ethcontractwriteresult)

#### Properties

##### btcVaultRegistryAddress

```ts
btcVaultRegistryAddress: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts)

BTCVaultRegistry contract address (env-specific).

##### vaultId

```ts
vaultId: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts)

Vault ID (bytes32, 0x-prefixed).

##### secret

```ts
secret: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts)

HTLC secret preimage (bytes32). A missing `0x` prefix or an uppercase
`0X` prefix is normalised before validation.

##### hashlock?

```ts
optional hashlock: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts)

Optional hashlock for client-side pre-validation. When provided, the SDK
rejects before calling `writeContract` if `sha256(secret) != hashlock`.

##### writeContract

```ts
writeContract: EthContractWriter<R>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts)

Caller-provided write callback — see [EthContractWriter](#ethcontractwriter).

##### signal?

```ts
optional signal: AbortSignal;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts)

Optional abort signal. Checked before validation runs; since validation
is fully synchronous, cancellation between validation and the write is
not observable and callers should rely on the transport's own
cancellation support for that window.

***

### PeginStatusReader

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/interfaces.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/interfaces.ts)

Read-only VP operations needed by polling/status functions.

#### Methods

##### getPeginStatus()

```ts
getPeginStatus(params, signal?): Promise<GetPeginStatusResponse>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/interfaces.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/interfaces.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/interfaces.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/interfaces.ts)

Write VP operations for WOTS key submission.

#### Methods

##### submitDepositorWotsKey()

```ts
submitDepositorWotsKey(params, signal?): Promise<void>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/interfaces.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/interfaces.ts)

###### Parameters

###### params

[`SubmitDepositorWotsKeyParams`](clients.md#submitdepositorwotskeyparams)

###### signal?

`AbortSignal`

###### Returns

`Promise`\<`void`\>

***

### PresignClient

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/interfaces.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/interfaces.ts)

VP operations for the presign transaction flow.

#### Methods

##### requestDepositorPresignTransactions()

```ts
requestDepositorPresignTransactions(params, signal?): Promise<RequestDepositorPresignTransactionsResponse>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/interfaces.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/interfaces.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/interfaces.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/interfaces.ts)

###### Parameters

###### params

[`SubmitDepositorPresignaturesParams`](clients.md#submitdepositorpresignaturesparams)

###### signal?

`AbortSignal`

###### Returns

`Promise`\<`void`\>

***

### ClaimerArtifactsReader

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/interfaces.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/interfaces.ts)

VP operations for depositor-as-claimer artifacts (separate from payout signing).

#### Methods

##### requestDepositorClaimerArtifacts()

```ts
requestDepositorClaimerArtifacts(params, signal?): Promise<RequestDepositorClaimerArtifactsResponse>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/interfaces.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/interfaces.ts)

###### Parameters

###### params

[`RequestDepositorClaimerArtifactsParams`](clients.md#requestdepositorclaimerartifactsparams)

###### signal?

`AbortSignal`

###### Returns

`Promise`\<[`RequestDepositorClaimerArtifactsResponse`](clients.md#requestdepositorclaimerartifactsresponse)\>

***

### PeginProtocolState

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts)

Protocol-level peg-in state (framework-agnostic)

#### Properties

##### contractStatus

```ts
contractStatus: ContractStatus;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts)

Smart contract status (source of truth for on-chain state)

##### availableActions

```ts
availableActions: PeginAction[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts)

Available user actions (empty array when no action is available)

***

### GetPeginProtocolStateOptions

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts)

Options for getPeginProtocolState function.

All fields represent protocol-level state from the vault provider or
on-chain contracts. Client-side tracking (localStorage, polling state)
is NOT included — consumers handle that in their own layer.

#### Properties

##### transactionsReady?

```ts
optional transactionsReady: boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts)

Whether claim/payout transactions are ready from VP

##### needsWotsKey?

```ts
optional needsWotsKey: boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts)

Whether the vault provider is waiting for the depositor's WOTS public key

##### pendingIngestion?

```ts
optional pendingIngestion: boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts)

Whether the vault provider hasn't ingested this peg-in yet

##### canRefund?

```ts
optional canRefund: boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts)

Whether the depositor can refund the HTLC (Pre-PegIn tx available)

##### hasProviderTerminalFailure?

```ts
optional hasProviderTerminalFailure: boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts)

Whether the vault provider reported a terminal failure

##### htlcSpentByPeginTx?

```ts
optional htlcSpentByPeginTx: boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts)

VERIFIED only: the Pre-PegIn HTLC outpoint has been spent on Bitcoin BY
THE PEGIN TRANSACTION while the vault is still Verified on Ethereum. The
secret was revealed (e.g. in the calldata of a reverted activation) and
the peg-in swept without the vault activating, so the normal activation
no longer returns value to the depositor and the CSV refund can never
broadcast. The remaining recovery is the activate-and-redeem escape
hatch.

The caller MUST prove the spender by comparing the outspend's
`spendingTxid` against the vault's PegIn txid before setting this. A
bare "spent" observation is not sufficient: the spend may be the
depositor's own CSV refund, and offering the secret-revealing hatch
against a refund burns the secret for a vault whose funds already
returned.

***

### PayoutSigningContext

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts)

Context required for signing payout transactions.
Caller builds this from on-chain data (contract queries, GraphQL, config).

#### Properties

##### vaultCoreVersion

```ts
vaultCoreVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts)

Vault core (tx-graph) version the vault was registered under — the
vault's stamped on-chain `vaultCoreVersion` from `BTCVaultRegistry`.
Selects which graph's connector scripts every payout/nopayout PSBT is
rebuilt with.

##### peginTxHex

```ts
peginTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts)

Raw pegin BTC transaction hex (for PSBT construction)

##### vaultProviderBtcPubkey

```ts
vaultProviderBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts)

Vault provider's BTC public key (x-only hex, no prefix)

##### vaultKeeperBtcPubkeys

```ts
vaultKeeperBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts)

Sorted vault keeper BTC public keys (x-only hex, no prefix)

##### universalChallengerBtcPubkeys

```ts
universalChallengerBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts)

Sorted universal challenger BTC public keys (x-only hex, no prefix)

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts)

Depositor's BTC public key (x-only hex, no prefix)

##### timelockPegin

```ts
timelockPegin: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts)

Pegin timelock from the locked offchain params version

##### timelockAssert

```ts
timelockAssert: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts)

Assert CSV timelock from the locked offchain params version (blocks).
Source: ProtocolParams contract via
`ViemProtocolParamsReader.getOffchainParamsByVersion(...).timelockAssert`.
Required for the depositor-graph NoPayout local rebuild.

##### councilMembers

```ts
councilMembers: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts)

Security council member x-only public keys (hex, no prefix).
Source: ProtocolParams contract via
`getOffchainParamsByVersion(...).securityCouncilKeys`.
Required for the depositor-graph NoPayout local rebuild.

##### councilQuorum

```ts
councilQuorum: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts)

M-of-N council quorum threshold.
Source: ProtocolParams contract via
`getOffchainParamsByVersion(...).councilQuorum`.
Required for the depositor-graph NoPayout local rebuild.

##### network

```ts
network: Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts)

BTC network (Mainnet, Testnet, etc.)

##### registeredPayoutScriptPubKey

```ts
registeredPayoutScriptPubKey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts)

On-chain registered depositor payout scriptPubKey (hex)

##### commissionBps

```ts
commissionBps: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts)

VP commission (bps) from `BTCVaultRegistry`; caps the VP-claimer payout commission output.

##### protocolFeeRate

```ts
protocolFeeRate: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts)

Tx-graph fee rate (sat/vB) from the locked offchain params version —
`getOffchainParamsByVersion(...).feeRate`, the rate the VP built the
graph with. Bounds every payout's implicit fee (payout fee band).

##### vkClaimerPayoutScriptPubKeys

```ts
vkClaimerPayoutScriptPubKeys: Readonly<Record<string, string>>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts)

RFC-006 resolved keeper payout destinations at the vault's frozen
`appKeeperKeyEpoch`, keyed by lowercased x-only operation pubkey.

##### vpCommissionScriptPubKey

```ts
vpCommissionScriptPubKey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts)

RFC-006 resolved VP commission destination at the vault's frozen
`vpKeyEpoch`.

***

### RunDepositorPresignFlowParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts)

#### Properties

##### statusReader

```ts
statusReader: PeginStatusReader;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts)

VP client implementing the status reader interface

##### presignClient

```ts
presignClient: PresignClient;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts)

VP client implementing the presign transaction flow interface

##### btcWallet

```ts
btcWallet: BitcoinWallet;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts)

Bitcoin wallet for signing

##### peginTxid

```ts
peginTxid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts)

BTC pegin transaction ID (unprefixed hex, 64 chars)

##### depositorPk

```ts
depositorPk: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts)

Depositor's x-only BTC public key (unprefixed hex, 64 chars)

##### signingContext

```ts
signingContext: PayoutSigningContext;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts)

Signing context built from on-chain data

##### depositTerms?

```ts
optional depositTerms: DepositTerms;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts)

Required for approval-capable wallets; fresh flows thread
PreparePeginResult.depositTerms. Resume-path rebuild is not wired yet.

##### timeoutMs?

```ts
optional timeoutMs: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts)

Maximum polling timeout in milliseconds (default: 20 min)

##### signal?

```ts
optional signal: AbortSignal;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts)

AbortSignal for cancellation

##### onProgress()?

```ts
optional onProgress: (completed, total) => void;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts)

Authoritative inputs required to construct the depositor's Payout AND every
per-challenger NoPayout PSBT locally. Every field here must come from
trusted on-chain sources, not from the vault provider response. They feed
directly into the Taproot sighash.

#### Properties

##### vaultCoreVersion

```ts
vaultCoreVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts)

Vault core (tx-graph) version the vault was registered under — the
vault's stamped on-chain `vaultCoreVersion` from `BTCVaultRegistry`.
Selects which graph's connector scripts every PSBT is rebuilt with.

##### peginTxHex

```ts
peginTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts)

Raw pegin BTC transaction hex (provides the depositor's signed prevout)

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts)

Depositor's BTC public key (x-only, 64-char hex, no 0x prefix)

##### vaultProviderBtcPubkey

```ts
vaultProviderBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts)

Vault provider's BTC public key (x-only hex, no prefix)

##### vaultKeeperBtcPubkeys

```ts
vaultKeeperBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts)

Sorted vault keeper BTC public keys (x-only hex, no prefix)

##### universalChallengerBtcPubkeys

```ts
universalChallengerBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts)

Sorted universal challenger BTC public keys (x-only hex, no prefix)

##### timelockPegin

```ts
timelockPegin: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts)

Pegin CSV timelock from the locked offchain params version (blocks)

##### protocolFeeRate

```ts
protocolFeeRate: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts)

Tx-graph fee rate (sat/vB) from the locked offchain params version —
bounds the depositor-claimer payout's implicit fee (payout fee band).

##### timelockAssert

```ts
timelockAssert: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts)

Assert CSV timelock from the locked offchain params version (blocks).
Sourced from the on-chain ProtocolParams contract via
`ViemProtocolParamsReader.getOffchainParamsByVersion(...).timelockAssert`.

##### councilMembers

```ts
councilMembers: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts)

Security council member x-only public keys (hex, no prefix). Sourced from
the on-chain ProtocolParams contract via
`ViemProtocolParamsReader.getOffchainParamsByVersion(...).securityCouncilKeys`.

##### councilQuorum

```ts
councilQuorum: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts)

M-of-N council quorum threshold. Sourced from the on-chain ProtocolParams
contract via `ViemProtocolParamsReader.getOffchainParamsByVersion(...).councilQuorum`.

##### network

```ts
network: Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts)

BTC network (Mainnet, Testnet, etc.)

##### registeredPayoutScriptPubKey

```ts
registeredPayoutScriptPubKey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts)

On-chain registered depositor payout scriptPubKey (hex, with or without
0x prefix). Used to assert the VP-advertised payout transaction pays to
the depositor's registered address before the wallet produces a signature.

##### vkClaimerPayoutScriptPubKeys

```ts
vkClaimerPayoutScriptPubKeys: Readonly<Record<string, string>>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts)

RFC-006 operator payout destinations. Forwarded to `buildPayoutPsbt` for
shape completeness only: this graph is signed under the
`depositor-as-claimer` role, whose payout has two outputs and reads
neither the keeper map nor the VP commission destination.

##### vpCommissionScriptPubKey

```ts
vpCommissionScriptPubKey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts)

See [vkClaimerPayoutScriptPubKeys](#vkclaimerpayoutscriptpubkeys-1) — unused for this role.

***

### SignDepositorGraphParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts)

#### Properties

##### depositorGraph

```ts
depositorGraph: DepositorGraphTransactions;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts)

The depositor graph from VP response

##### btcWallet

```ts
btcWallet: BitcoinWallet;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts)

Bitcoin wallet for signing

##### signingContext

```ts
signingContext: DepositorGraphSigningContext;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts)

Authoritative inputs used to rebuild every PSBT locally

***

### SubmitWotsPublicKeyParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/submitWotsPublicKey.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/submitWotsPublicKey.ts)

#### Properties

##### statusReader

```ts
statusReader: PeginStatusReader;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/submitWotsPublicKey.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/submitWotsPublicKey.ts)

VP client implementing the status reader interface

##### wotsSubmitter

```ts
wotsSubmitter: WotsKeySubmitter;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/submitWotsPublicKey.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/submitWotsPublicKey.ts)

VP client implementing the WOTS key submission interface

##### peginTxid

```ts
peginTxid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/submitWotsPublicKey.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/submitWotsPublicKey.ts)

BTC pegin transaction ID (unprefixed hex, 64 chars)

##### depositorPk

```ts
depositorPk: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/submitWotsPublicKey.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/submitWotsPublicKey.ts)

Depositor's x-only BTC public key (unprefixed hex, 64 chars)

##### wotsPublicKeys

```ts
wotsPublicKeys: WotsBlockPublicKey[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/submitWotsPublicKey.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/submitWotsPublicKey.ts)

Pre-derived WOTS block public keys (one per assert block)

##### timeoutMs?

```ts
optional timeoutMs: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/submitWotsPublicKey.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/submitWotsPublicKey.ts)

Maximum time to wait for VP to be ready (default: 5 min)

##### signal?

```ts
optional signal: AbortSignal;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/submitWotsPublicKey.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/submitWotsPublicKey.ts)

AbortSignal for cancellation

***

### ValidateOnChainParticipantKeysParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts)

#### Properties

##### vaultRegistryReader

```ts
vaultRegistryReader: VaultRegistryReader;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts)

##### vaultKeeperReader

```ts
vaultKeeperReader: VaultKeeperReader;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts)

##### universalChallengerReader

```ts
universalChallengerReader: UniversalChallengerReader;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts)

##### vaultProviderEthAddress

```ts
vaultProviderEthAddress: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts)

##### applicationEntryPoint

```ts
applicationEntryPoint: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts)

##### expectedVaultProviderBtcPubkey

```ts
expectedVaultProviderBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts)

##### expectedVaultKeeperBtcPubkeys

```ts
expectedVaultKeeperBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts)

##### expectedUniversalChallengerBtcPubkeys

```ts
expectedUniversalChallengerBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts)

##### operationKeyReader

```ts
operationKeyReader: OperationKeyReader;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts)

RFC-006. Participant keys are resolved to their *current operation* keys,
and those are what the returned key fields carry.

##### onIndexerServingOperationKeys()?

```ts
optional onIndexerServingOperationKeys: (message) => void;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts)

Optional observer for the case where the indexer hint matched the
operation keys rather than the registration keys — i.e. the indexer is
ahead of us, not wrong. Called at most once.

###### Parameters

###### message

`string`

###### Returns

`void`

##### onIndexerHintsInconsistent()?

```ts
optional onIndexerHintsInconsistent: (message) => void;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts)

Optional observer for the case where the indexer is serving a half-applied
view — one role explainable only by the registration keys, another only by
the operation keys. That blocks every deposit for the provider until the
indexer converges, and "Refresh and try again" cannot help, so the block
needs to be visible rather than showing up only as user reports. Called
immediately before the throw.

###### Parameters

###### message

`string`

###### Returns

`void`

***

### ValidatedOnChainParticipantKeys

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts)

#### Properties

##### vaultProviderBtcPubkeyXOnly

```ts
vaultProviderBtcPubkeyXOnly: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts)

The VP key to build with: its current operation key.

##### vaultKeeperBtcPubkeysSorted

```ts
vaultKeeperBtcPubkeysSorted: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts)

##### universalChallengerBtcPubkeysSorted

```ts
universalChallengerBtcPubkeysSorted: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts)

##### expectedAppVaultKeepersVersion

```ts
expectedAppVaultKeepersVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts)

##### expectedUniversalChallengersVersion

```ts
expectedUniversalChallengersVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts)

##### registrationKeys

```ts
registrationKeys: object;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts)

The registration / roster keys, sorted. These are what indexer hints are
compared against first, and they stay available for diagnostics after
resolution.

###### vaultProvider

```ts
vaultProvider: string;
```

###### vaultKeepers

```ts
vaultKeepers: string[];
```

###### universalChallengers

```ts
universalChallengers: string[];
```

##### participantKeys

```ts
participantKeys: ParticipantKeySet;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts)

The full resolution, including the admin↔key pairing. Feeds the
post-registration read-after-mine verification.

***

### ValidationResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts)

#### Properties

##### valid

```ts
valid: boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts)

##### error?

```ts
optional error: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts)

##### warnings?

```ts
optional warnings: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts)

***

### DepositFormValidityParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts)

Parameters for checking if a deposit form is valid.

#### Properties

##### amountSats

```ts
amountSats: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts)

Deposit amount in satoshis

##### minDeposit

```ts
minDeposit: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts)

Minimum deposit from protocol params

##### maxDeposit?

```ts
optional maxDeposit: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts)

Maximum deposit from protocol params (optional)

##### btcBalance

```ts
btcBalance: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts)

User's available BTC balance in satoshis

##### estimatedFeeSats?

```ts
optional estimatedFeeSats: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts)

Estimated transaction fee in satoshis

##### depositorClaimValue?

```ts
optional depositorClaimValue: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts)

Depositor claim value in satoshis (required output for challenge transactions)

***

### RemainingCapacityParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts)

#### Properties

##### amount

```ts
amount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts)

Requested deposit amount in satoshis

##### effectiveRemaining

```ts
effectiveRemaining: bigint | null;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts)

Effective remaining capacity in satoshis (min of protocol-total and
per-address remaining). `null` means no cap applies.

***

### MultiVaultDepositFlowInputs

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts)

##### confirmedUTXOs

```ts
confirmedUTXOs: UtxoLike[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts)

##### vaultProviderBtcPubkey

```ts
vaultProviderBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts)

##### vaultKeeperBtcPubkeys

```ts
vaultKeeperBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts)

##### universalChallengerBtcPubkeys

```ts
universalChallengerBtcPubkeys: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts)

##### minDeposit

```ts
minDeposit: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts)

Protocol minimum deposit per vault (satoshis)

##### maxDeposit?

```ts
optional maxDeposit: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts)

Protocol maximum deposit per vault (satoshis)

***

### VerifyRegisteredParticipantKeysParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredParticipantKeys.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredParticipantKeys.ts)

#### Properties

##### vaultRegistryReader

```ts
vaultRegistryReader: VaultRegistryReader;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredParticipantKeys.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredParticipantKeys.ts)

##### operationKeyReader

```ts
operationKeyReader: OperationKeyReader;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredParticipantKeys.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredParticipantKeys.ts)

##### vaultIds

```ts
vaultIds: readonly `0x${string}`[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredParticipantKeys.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredParticipantKeys.ts)

##### expected

```ts
expected: ParticipantKeySet;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredParticipantKeys.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredParticipantKeys.ts)

The exact key set the BTC artifacts were built with. Its `query` supplies
the rosters to re-resolve against — deliberately reused rather than
accepted as a separate argument, so the two can never disagree and a
roster that moved since the build cannot be misreported as a key drift.

***

### VerifyRegisteredVaultVersionsParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredVaultVersions.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredVaultVersions.ts)

#### Properties

##### vaultRegistryReader

```ts
vaultRegistryReader: VaultRegistryReader;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredVaultVersions.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredVaultVersions.ts)

##### vaultIds

```ts
vaultIds: readonly `0x${string}`[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredVaultVersions.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredVaultVersions.ts)

##### expectedOffchainParamsVersion

```ts
expectedOffchainParamsVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredVaultVersions.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredVaultVersions.ts)

##### expectedAppVaultKeepersVersion

```ts
expectedAppVaultKeepersVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredVaultVersions.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredVaultVersions.ts)

##### expectedUniversalChallengersVersion

```ts
expectedUniversalChallengersVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredVaultVersions.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredVaultVersions.ts)

##### expectedVaultCoreVersion

```ts
expectedVaultCoreVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredVaultVersions.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredVaultVersions.ts)

Vault core (tx-graph) version the BTC artifacts were BUILT with. The
contract stamps `activeVaultCoreVersion` at registration-tx execution
time, so a governance flip between build and registration stamps a
different graph than the one the depositor signed — broadcasting would
lock BTC into a graph no resume path can rebuild.

***

### WaitForPeginStatusParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/waitForPeginStatus.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/waitForPeginStatus.ts)

#### Properties

##### statusReader

```ts
statusReader: PeginStatusReader;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/waitForPeginStatus.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/waitForPeginStatus.ts)

VP client implementing the status reader interface

##### peginTxid

```ts
peginTxid: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/waitForPeginStatus.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/waitForPeginStatus.ts)

BTC pegin transaction ID (unprefixed hex, 64 chars)

##### targetStatuses

```ts
targetStatuses: ReadonlySet<DaemonStatus>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/waitForPeginStatus.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/waitForPeginStatus.ts)

Set of acceptable statuses — polling stops when the VP reports one of these

##### timeoutMs

```ts
timeoutMs: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/waitForPeginStatus.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/waitForPeginStatus.ts)

Maximum time to wait in milliseconds

##### pollIntervalMs?

```ts
optional pollIntervalMs: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/waitForPeginStatus.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/waitForPeginStatus.ts)

Polling interval in milliseconds (default: 10s)

##### signal?

```ts
optional signal: AbortSignal;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/waitForPeginStatus.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/waitForPeginStatus.ts)

AbortSignal for cancellation

***

### HintMatch

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/participants/indexerKeyHint.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/participants/indexerKeyHint.ts)

Which of the two legitimate on-chain candidates a role's hint matched.

Both true means the role never rotated, so the hint constrains nothing.
Both false means the hint is not explainable by any state the chain is in.

#### Properties

##### registration

```ts
registration: boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/participants/indexerKeyHint.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/participants/indexerKeyHint.ts)

##### operation

```ts
operation: boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/participants/indexerKeyHint.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/participants/indexerKeyHint.ts)

***

### AssertVaultProviderHintAcceptedParams

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/participants/indexerKeyHint.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/participants/indexerKeyHint.ts)

#### Properties

##### vaultProviderEthAddress

```ts
vaultProviderEthAddress: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/participants/indexerKeyHint.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/participants/indexerKeyHint.ts)

Vault provider's admin address, named in the error.

##### hintBtcPubkey?

```ts
optional hintBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/participants/indexerKeyHint.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/participants/indexerKeyHint.ts)

The untrusted hint. Absent means there is nothing to cross-check.

##### registrationBtcPubkey

```ts
registrationBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/participants/indexerKeyHint.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/participants/indexerKeyHint.ts)

The vault provider's registration key, already read from chain.

##### readCurrentOperationBtcPubkey()

```ts
readCurrentOperationBtcPubkey: () => Promise<string>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/participants/indexerKeyHint.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/participants/indexerKeyHint.ts)

Reads the vault provider's *current* operation key.

Invoked only when the hint fails against the registration key, so a
provider that never rotated — and an indexer that has not caught up — cost
no extra RPC. Callers must not pre-read this.

###### Returns

`Promise`\<`string`\>

##### context?

```ts
optional context: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/participants/indexerKeyHint.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/participants/indexerKeyHint.ts)

Sentence appended to the error naming what was aborted, e.g.
`"Aborting refund."`. The shared half of the message says which keys
failed to match; this says which operation the user just lost.

***

### ResolvedParticipant

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/participants/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/participants/types.ts)

One operator's resolved identity: who it is, and which key it signs with.

#### Properties

##### adminAddress

```ts
adminAddress: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/participants/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/participants/types.ts)

The operator's admin ETH address — its stable identity and the lookup key
for its operation-key history. This is the roster entry's `ethAddress`.

##### genesisBtcPubkey

```ts
genesisBtcPubkey: OnChainBtcPubkey;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/participants/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/participants/types.ts)

The operator's genesis BTC key: its roster entry / registration key.
x-only, lowercase, no `0x`. Retained because indexer hints are still
expressed in these, and because a keeper's genesis is the fallback the
`...OrGenesis` getters resolve to.

##### operationBtcPubkey

```ts
operationBtcPubkey: OnChainBtcPubkey;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/participants/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/participants/types.ts)

The operation key this resolution produced — the key that actually goes
into the Bitcoin scripts. Equals `genesisBtcPubkey` until the operator
rotates.

##### rotated

```ts
rotated: boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/participants/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/participants/types.ts)

Whether the operation key differs from the genesis key.

***

### ParticipantKeySet

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/participants/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/participants/types.ts)

Every participant's resolved operation key for one vault (or one about to be
created).

The pairs are the source of truth; the sorted arrays are derived from them.
Never invert that. Rotation changes a key, and therefore changes where it
lands in the lexicographic sort, so an index-join from a sorted array back
to a roster entry is wrong the moment anyone rotates.

#### Properties

##### vaultProvider

```ts
vaultProvider: ResolvedParticipant;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/participants/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/participants/types.ts)

##### vaultKeepers

```ts
vaultKeepers: ResolvedParticipant[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/participants/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/participants/types.ts)

##### universalChallengers

```ts
universalChallengers: ResolvedParticipant[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/participants/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/participants/types.ts)

##### vaultKeeperOperationKeysSorted

```ts
vaultKeeperOperationKeysSorted: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/participants/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/participants/types.ts)

Sorted keeper operation keys — what script construction consumes.

##### universalChallengerOperationKeysSorted

```ts
universalChallengerOperationKeysSorted: string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/participants/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/participants/types.ts)

Sorted challenger operation keys — what script construction consumes.

##### resolvedAt

```ts
resolvedAt: KeyResolutionMode;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/participants/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/participants/types.ts)

Provenance of this resolution.

##### query

```ts
query: OperationKeyQuery;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/participants/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/participants/types.ts)

The rosters and addresses this set was resolved against.

Carried so a later re-resolution — notably the post-registration
read-after-mine check — reuses the *same* roster rather than re-deriving
one that may since have moved, which would report a roster drift as a key
drift.

***

### VaultBatchEntry

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts)

One vault's per-HTLC binding in a Pre-PegIn batch. Carries the fields
needed to reconstruct the WASM `WasmPrePeginTx` template byte-for-byte
against the funded transaction.

#### Properties

##### hashlock

```ts
hashlock: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts)

SHA-256 hashlock commitment for this vault (bytes32, 0x-prefixed).

##### amount

```ts
amount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts)

Vault deposit (peg-in) amount in satoshis — the on-chain contract's
`amount` field. This is the peg-in amount WASM expects in `pegInAmounts`,
NOT the funded HTLC output value (which is `amount + depositorClaimValue +
minPeginFee`). WASM re-adds that reserve internally when it sizes the HTLC
output, so this value is passed straight through.

##### htlcVout

```ts
htlcVout: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts)

Index of this vault's HTLC output in the funded Pre-PegIn tx.

***

### VaultRefundData

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts)

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

##### vaultCoreVersion

```ts
vaultCoreVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts)

Vault core (tx-graph) version stamped on-chain at registration
(`BTCVaultProtocolInfo.vaultCoreVersion`). The refund template must be
reconstructed under the same graph version the Pre-PegIn was built with.

##### hashlock

```ts
hashlock: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts)

##### htlcVout

```ts
htlcVout: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts)

##### offchainParamsVersion

```ts
offchainParamsVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts)

##### appVaultKeepersVersion

```ts
appVaultKeepersVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts)

##### universalChallengersVersion

```ts
universalChallengersVersion: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts)

##### vaultProvider

```ts
vaultProvider: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts)

##### applicationEntryPoint

```ts
applicationEntryPoint: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts)

##### amount

```ts
amount: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts)

Vault deposit (peg-in) amount in satoshis — the on-chain `amount` field.

##### unsignedPrePeginTxHex

```ts
unsignedPrePeginTxHex: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts)

Funded, pre-witness Pre-PegIn transaction hex. 0x prefix optional.
The name mirrors the contract/indexer schema; the bytes are the
funded form (refund construction needs real outpoints).

##### depositorBtcPubkey

```ts
depositorBtcPubkey: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts)

Depositor's BTC public key (x-only or compressed hex; 0x prefix optional).

##### batch

```ts
batch: readonly VaultBatchEntry[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts)

Full vout-ordered HTLC vector for the funded Pre-PegIn (one entry
per sibling vault, including the target vault). Must satisfy
`batch[i].htlcVout === i` for all i, and the target's `htlcVout` /
`hashlock` / `amount` must equal `batch[vault.htlcVout]`.

***

### RefundPrePeginContext

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts)

##### vaultKeeperPubkeys

```ts
vaultKeeperPubkeys: readonly string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts)

##### universalChallengerPubkeys

```ts
universalChallengerPubkeys: readonly string[];
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts)

##### timelockRefund

```ts
timelockRefund: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts)

##### feeRate

```ts
feeRate: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts)

##### minPeginFeeRate

```ts
minPeginFeeRate: bigint;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts)

##### numLocalChallengers

```ts
numLocalChallengers: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts)

##### councilQuorum

```ts
councilQuorum: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts)

##### councilSize

```ts
councilSize: number;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts)

##### network

```ts
network: Network;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts)

***

### BtcBroadcastResult

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts)

Minimum shape required from a broadcast result.

#### Properties

##### txId

```ts
txId: string;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts)

***

### RefundInput

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts)

#### Type Parameters

##### R

`R` *extends* [`BtcBroadcastResult`](#btcbroadcastresult) = [`BtcBroadcastResult`](#btcbroadcastresult)

#### Properties

##### vaultId

```ts
vaultId: `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts)

##### readVault()

```ts
readVault: () => Promise<VaultRefundData>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts)

Fetch authoritative on-chain + indexer vault data. The SDK passes no
arguments — the caller closes over `vaultId` (or any other context it
needs).

###### Returns

`Promise`\<[`VaultRefundData`](#vaultrefunddata)\>

##### readPrePeginContext()

```ts
readPrePeginContext: (vault) => Promise<RefundPrePeginContext>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts)

Mempool-derived sat/vB fee rate to use for the refund tx (positive
number). Caller fetches this before invoking — it does not depend on
any value the SDK computes, and folding it into the call keeps the
orchestration honest.

##### signPsbt

```ts
signPsbt: RefundPsbtSigner;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts)

BTC wallet signer; receives a PSBT hex + taproot script-path options.

##### broadcastTx

```ts
broadcastTx: BtcBroadcaster<R>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts)

Broadcast callback — returns whatever shape the caller needs.

##### signal?

```ts
optional signal: AbortSignal;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts)

Checked at every async boundary.

## Type Aliases

### EthContractWriter()

```ts
type EthContractWriter<R> = (call) => Promise<R>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts)

Reason why a vault expired

***

### KeyResolutionMode

```ts
type KeyResolutionMode = 
  | {
  mode: "current";
}
  | {
  mode: "epochs";
  epochs: KeyEpochs;
};
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/participants/types.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/participants/types.ts)

How a [ParticipantKeySet](#participantkeyset) was resolved. Carried for diagnostics.

***

### BtcBroadcaster()

```ts
type BtcBroadcaster<R> = (signedTxHex) => Promise<R>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts)

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

### activateVaultAndRedeem()

```ts
function activateVaultAndRedeem<R>(input): Promise<R>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/activation/activateVault.ts)

Depositor escape hatch: reveal the HTLC secret and immediately redeem the
vault for the depositor, without any application activation. The contract
(`activateVaultWithSecretAndRedeem`) runs the same activation preconditions
(Verified status, activation deadline, `sha256(s) == hashlock`) and then
marks the vault Redeemed so the vault provider pays the BTC out to the
depositor's committed payout address. Used when the normal activation is
unavailable (e.g. the application adapter is paused or its activation
reverts) but the secret must still be revealed to recover the swept peg-in.

Takes no activation metadata — the application entry point is never called.

#### Type Parameters

##### R

`R` *extends* [`EthContractWriteResult`](#ethcontractwriteresult) = [`EthContractWriteResult`](#ethcontractwriteresult)

#### Parameters

##### input

[`ActivateVaultAndRedeemInput`](#activatevaultandredeeminput)\<`R`\>

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

whatever the injected `writeContract` throws

#### Throws

`AbortError` / caller-provided abort reason if `signal` aborts

***

### getPeginProtocolState()

```ts
function getPeginProtocolState(contractStatus, options): PeginProtocolState;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts)

Check if a specific action is available in the current state

#### Parameters

##### state

[`PeginProtocolState`](#peginprotocolstate)

##### action

[`PeginAction`](#peginaction)

#### Returns

`boolean`

***

### isActivationDeadlinePassedOnChain()

```ts
function isActivationDeadlinePassedOnChain(params): boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts)

Whether a vault's on-chain activation window has closed. Mirrors the
BTCVaultRegistry check that reverts `ActivationDeadlineExpired`:
`block.number > createdAt + pegInActivationTimeout` — strict `>`, so a
boundary-equal block is NOT expired. All values are Ethereum block numbers.

#### Parameters

##### params

###### currentBlock

`bigint`

###### createdAtBlock

`bigint`

###### pegInActivationTimeout

`bigint`

#### Returns

`boolean`

***

### runDepositorPresignFlow()

```ts
function runDepositorPresignFlow(params): Promise<void>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/runDepositorPresignFlow.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/submitWotsPublicKey.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/submitWotsPublicKey.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validateOnChainParticipantKeys.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/validation.ts)

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

### isParticipantKeyDriftError()

```ts
function isParticipantKeyDriftError(err): err is ParticipantKeyDriftError;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredParticipantKeys.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredParticipantKeys.ts)

#### Parameters

##### err

`unknown`

#### Returns

`err is ParticipantKeyDriftError`

***

### verifyRegisteredParticipantKeys()

```ts
function verifyRegisteredParticipantKeys(params): Promise<void>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredParticipantKeys.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredParticipantKeys.ts)

#### Parameters

##### params

[`VerifyRegisteredParticipantKeysParams`](#verifyregisteredparticipantkeysparams)

#### Returns

`Promise`\<`void`\>

***

### isRegisteredVaultVersionMismatchError()

```ts
function isRegisteredVaultVersionMismatchError(err): err is RegisteredVaultVersionMismatchError;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredVaultVersions.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredVaultVersions.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredVaultVersions.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/verifyRegisteredVaultVersions.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/waitForPeginStatus.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/waitForPeginStatus.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/htlc/index.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/htlc/index.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/htlc/index.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/htlc/index.ts)

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

### isHintAccepted()

```ts
function isHintAccepted(match): boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/participants/indexerKeyHint.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/participants/indexerKeyHint.ts)

The accept-either policy itself.

Kept as a named function rather than inlined at each call site so that
changing the policy is a one-line change in one file, and so a reader can
find every path governed by it.

#### Parameters

##### match

[`HintMatch`](#hintmatch)

#### Returns

`boolean`

***

### matchKeyHint()

```ts
function matchKeyHint(
   hint, 
   registrationKey, 
   operationKey): HintMatch;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/participants/indexerKeyHint.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/participants/indexerKeyHint.ts)

Match a single hinted key against both candidates.

#### Parameters

##### hint

`string`

##### registrationKey

`string`

##### operationKey

`string`

#### Returns

[`HintMatch`](#hintmatch)

***

### matchKeySetHint()

```ts
function matchKeySetHint(
   hints, 
   registrationKeys, 
   operationKeys): HintMatch;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/participants/indexerKeyHint.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/participants/indexerKeyHint.ts)

Match a hinted key *set* against both candidate sets.

Compared as whole sets, never as per-element membership of the union: a
roster holding one registration key and one operation key is an indexer that
is halfway through applying a rotation, and union membership would wave that
through. Order is normalized, so this is set equality and not list equality.

#### Parameters

##### hints

readonly `string`[]

##### registrationKeys

readonly `string`[]

##### operationKeys

readonly `string`[]

#### Returns

[`HintMatch`](#hintmatch)

***

### assertVaultProviderHintAccepted()

```ts
function assertVaultProviderHintAccepted(params): Promise<void>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/participants/indexerKeyHint.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/participants/indexerKeyHint.ts)

Assert an indexer-hinted vault provider key is one the chain can explain.

Resolves silently when there is no hint, or when the hint matches either
candidate. Throws otherwise — the caller's key material is unaffected either
way, since resolution is chain-only.

#### Parameters

##### params

[`AssertVaultProviderHintAcceptedParams`](#assertvaultproviderhintacceptedparams)

#### Returns

`Promise`\<`void`\>

***

### resolveCurrentParticipantKeys()

```ts
function resolveCurrentParticipantKeys(params): Promise<ParticipantKeySet>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/participants/resolveParticipantKeys.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/participants/resolveParticipantKeys.ts)

Resolve every participant's *current* operation key.

Use for a peg-in being built now. Issues no epoch read, so it never touches
the extended `getBtcVaultProtocolInfo` ABI.

#### Parameters

##### params

###### operationKeyReader

[`OperationKeyReader`](clients.md#operationkeyreader)

###### query

[`OperationKeyQuery`](clients.md#operationkeyquery)

#### Returns

`Promise`\<[`ParticipantKeySet`](#participantkeyset)\>

***

### resolveParticipantKeysAtEpochs()

```ts
function resolveParticipantKeysAtEpochs(params): Promise<ParticipantKeySet>;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/participants/resolveParticipantKeys.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/participants/resolveParticipantKeys.ts)

Resolve every participant's operation key bonded at a vault's frozen epochs.

Use for every existing-vault path: resume, payout signing, refund. The
rosters in `query` must be read at the vault's frozen *membership* versions,
because those roster keys are the genesis the keeper/challenger getters fall
back to.

#### Parameters

##### params

###### operationKeyReader

[`OperationKeyReader`](clients.md#operationkeyreader)

###### query

[`OperationKeyQuery`](clients.md#operationkeyquery)

###### epochs

[`KeyEpochs`](clients.md#keyepochs)

#### Returns

`Promise`\<[`ParticipantKeySet`](#participantkeyset)\>

***

### isRecognizedPegoutStatus()

```ts
function isRecognizedPegoutStatus(status): boolean;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts)

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

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts)

Status 0: Request submitted, waiting for ACKs

##### VERIFIED

```ts
VERIFIED: 1;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts)

Status 1: All ACKs collected, ready for secret activation

##### ACTIVE

```ts
ACTIVE: 2;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts)

Status 2: HTLC secret revealed, vault is active and usable (stays here even when used by apps)

##### REDEEMED

```ts
REDEEMED: 3;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts)

Status 3: Vault has been redeemed, BTC is claimable

##### LIQUIDATED

```ts
LIQUIDATED: 4;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts)

Status 4 (indexer-only): Vault was liquidated (collateral seized due to unpaid debt)

##### INVALID

```ts
INVALID: 5;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts)

Status 5 (indexer-only): Vault is invalid — BTC UTXOs were spent in a different transaction

##### DEPOSITOR\_WITHDRAWN

```ts
DEPOSITOR_WITHDRAWN: 6;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts)

Status 6 (indexer-only): Depositor has withdrawn their BTC (redemption complete)

##### EXPIRED

```ts
EXPIRED: 7;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts)

Status 7 (indexer-only): Vault expired due to AckTimeout or ActivationTimeout

***

### PeginAction

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts)

Available actions user can take

#### Enumeration Members

##### SUBMIT\_WOTS\_KEY

```ts
SUBMIT_WOTS_KEY: "SUBMIT_WOTS_KEY";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts)

Submit WOTS key (re-derives via wallet `deriveContextHash`)

##### SIGN\_PAYOUT\_TRANSACTIONS

```ts
SIGN_PAYOUT_TRANSACTIONS: "SIGN_PAYOUT_TRANSACTIONS";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts)

Sign payout transactions

##### SIGN\_AND\_BROADCAST\_TO\_BITCOIN

```ts
SIGN_AND_BROADCAST_TO_BITCOIN: "SIGN_AND_BROADCAST_TO_BITCOIN";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts)

Sign and broadcast peg-in transaction to Bitcoin

##### ACTIVATE\_VAULT

```ts
ACTIVATE_VAULT: "ACTIVATE_VAULT";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts)

Reveal HTLC secret on Ethereum to activate vault

##### ACTIVATE\_AND\_REDEEM

```ts
ACTIVATE_AND_REDEEM: "ACTIVATE_AND_REDEEM";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts)

Escape hatch: reveal the HTLC secret and immediately redeem the vault for
the depositor (`activateVaultWithSecretAndRedeem`), skipping application
activation. Recovery path when the peg-in was swept on Bitcoin but the
vault could not be activated (application paused / activation revert).

##### REFUND\_HTLC

```ts
REFUND_HTLC: "REFUND_HTLC";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/deposit/peginState.ts)

Sign and broadcast HTLC refund transaction for an expired vault

***

### ClaimerPegoutStatusValue

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts)

Claimer-side pegout statuses reported by the VP.

#### Enumeration Members

##### CLAIM\_EVENT\_RECEIVED

```ts
CLAIM_EVENT_RECEIVED: "ClaimEventReceived";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts)

##### CLAIM\_BROADCAST

```ts
CLAIM_BROADCAST: "ClaimBroadcast";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts)

##### ASSERT\_BROADCAST

```ts
ASSERT_BROADCAST: "AssertBroadcast";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts)

##### PAYOUT\_BROADCAST

```ts
PAYOUT_BROADCAST: "PayoutBroadcast";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts)

##### PAYOUT\_BLOCKED

```ts
PAYOUT_BLOCKED: "PayoutBlocked";
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/pegout/state.ts)

## Variables

### REFUND\_VSIZE

```ts
const REFUND_VSIZE: 160 = 160;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts)

***

### REFUND\_MAX\_FEE\_RATE\_SATS\_VB

```ts
const REFUND_MAX_FEE_RATE_SATS_VB: 2000 = 2000;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts)

***

### REFUND\_MAX\_FEE\_FRACTION\_NUMERATOR

```ts
const REFUND_MAX_FEE_FRACTION_NUMERATOR: 10n = 10n;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts)

***

### REFUND\_MAX\_FEE\_FRACTION\_DENOMINATOR

```ts
const REFUND_MAX_FEE_FRACTION_DENOMINATOR: 100n = 100n;
```

Defined in: [packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts)
