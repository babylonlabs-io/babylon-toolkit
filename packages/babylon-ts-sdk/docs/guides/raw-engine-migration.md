# Migrate raw Bitcoin engine access

The raw API is deprecated. All four classes now check outputs against independent
TypeScript derivations. This is a breaking engine API: class identities change,
Pre-PegIn amounts must be original `bigint[]` values, and PegIn restoration needs
trusted inputs. [Track #2361](https://github.com/babylonlabs-io/babylon-toolkit/issues/2361).
#2361 and its parent #2231 stay open for review and release.

## Raw connector changes

The HTLC connector checks both scripts, both control blocks, the output script,
each requested address, and the graph version. The payout connector checks its
script, leaf hash, control block, output script, each address, and graph version.
The payout factories use the same guard. Each engine object stays private.

Valid outputs match the pinned engine for graph versions 1, 2, and 3. Raw network
names remain `bitcoin`, `testnet`, `testnet4`, `signet`, and `regtest`. Input checks
reject malformed keys and hashlocks, empty or duplicate key groups, and
timelocks outside 1 through 65535. Do not depend on unchecked input acceptance or
identity with the generated class. `free()` and `[Symbol.dispose]()` stay available.

`WasmPeginTx.fromJson` now requires `prepegin_htlc_prevout` in the saved object.
A saved transaction that omits the field, or stores it as null, is rejected:
without it the spent HTLC value and scriptPubKey are not bound to the original
request. Rebuild such a transaction from its request and funded parent.

## Raw transaction changes

Pass the original `bigint[]` amount vector to the `WasmPrePeginTx` constructor.
Do not construct a `BigUint64Array` first. That conversion can wrap values before
the guard receives them. The guard checks each original amount and independently
computes claim values, fee reserves, HTLC scripts, and the full unfunded bytes.
The fee rules match the pinned Rust versions, including their size estimates.

`fromFundedTransaction` checks every required output against the original
request. This includes the optional auth commitment and the depositor's CPFP
output. It preserves the funded bytes and permits wallet change after those
outputs. `buildRefundTx` checks the complete transaction against the selected
parent output, refund timelock, depositor destination, and exact requested fee.
`buildPeginTx` checks the child against the original request and funded parent.

Call `WasmPeginTx.fromJson(version, json, trusted)` with `PeginRestoreParams`:

- `prePeginParams`: the original request, including amounts and contract parameters.
- `fundedPrePeginTxHex`: the funded parent transaction from a trusted source.
- `htlcVout`: the selected HTLC output index.
- `timelockPegin`: the requested payout timelock.

Do not derive these inputs from the saved JSON. The guard checks the child bytes,
connector metadata, values, and signatures against these inputs. It supports the
pinned engine's saved unsigned, partially signed, and fully signed forms. Each
signature must verify for its key, position, sighash type, and trusted prevout.
Legacy saved objects with a missing or null prevout can be read; the pinned engine
still rejects later signing through that missing prevout. Unknown fields and
unsupported encodings fail closed. `toJson` and all getters check their results.
Transaction amounts retain u64 precision during byte and JSON parsing.

## Use guarded transaction builders

Import these builders from `@babylonlabs-io/ts-sdk/tbv/core/primitives`:

- `buildPrePeginPsbt(params)` replaces raw Pre-PegIn construction. Its `psbtHex`
  field contains the unfunded transaction hex, despite the field name.
- `buildPeginTxFromFundedPrePegin(params)` replaces funded reconstruction and
  `buildPeginTx`. Its result contains `txHex`, `txid`, `vaultValue`, and
  `vaultScriptPubKey`.
- `buildRefundPsbt(params)` replaces `buildRefundTx` and adds signing data.
- `buildPeginInputPsbt(params)` builds the HTLC hashlock signing input.
- `buildPayoutPsbt(params)` checks payout values and signing data.

These calls are asynchronous. Supply the original request and trusted contract
parameters. Use `vaultCoreVersion` for the SDK request where the engine request
uses `txGraphVersion`. Keep `pegInAmounts` as `bigint[]`. Follow the existing
[Bitcoin setup](../../README.md#ecc-library-initialization-bitcoin-flows-only)
and [primitives guide](../quickstart/primitives.md).

The engine root loads the transaction guards on demand. The raw entry remains
eager. Ethereum-only SDK use still needs no engine or Bitcoin dependency.
Other engine root operations, including `getPrePeginHtlcConnectorInfo`, retain
their existing checks. These raw transaction changes do not extend to every
engine facade operation.

## Internal caller

The only production raw caller is
[`buildRefundPsbt`](../../src/tbv/core/primitives/psbt/refund.ts).
It now passes original amounts to the guard. It retains its checks on the HTLC
signing data, funded output, refund layout, destination, and fee. Vault has no
direct raw caller. The tests use real engine transactions and reject changed
transaction fields.

## Compatibility blocker and release

The original amount and restoration input limits now have a breaking API change.
Existing two-argument `fromJson` calls and `BigUint64Array` constructor calls must
migrate. The caller must retain trusted inputs outside the saved engine JSON.

Use a breaking-change release marker for the engine. The SDK must use the engine
release that contains these guards and shared derivations. Review, release
records, and caller migration remain required before #2361 or #2231 can close.
The guarded product-path work in #2386 stays separate. API removal and its date
remain outside this change.
