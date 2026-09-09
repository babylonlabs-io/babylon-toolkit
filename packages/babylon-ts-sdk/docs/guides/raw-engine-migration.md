# Migrate raw Bitcoin engine access

The raw API is deprecated. Its exports and method signatures remain available.
`WasmPrePeginHtlcConnector` now checks every output against its constructor
inputs. It is a wrapper, so it no longer has the generated class identity.
The other raw classes can still bypass SDK value checks.
[Track #2361](https://github.com/babylonlabs-io/babylon-toolkit/issues/2361).
#2361 and its parent #2231 stay open until the compatibility blocker below is
resolved.

## Raw HTLC connector change

The HTLC connector checks the hashlock and refund scripts, both control blocks,
the output script, each requested address, and the graph version. Its private
engine object is not exposed. `free()` and `[Symbol.dispose]()` remain available.

Valid outputs match the pinned engine for graph versions 1, 2, and 3. Raw network
names remain `bitcoin`, `testnet`, `testnet4`, `signet`, and `regtest`. Input checks
reject malformed keys and hashlocks, empty or duplicate key groups, and refund
timelocks outside 1 through 65535. Do not depend on unchecked input acceptance or
identity with the generated class. This is a breaking engine release.

The engine now declares the same pinned Bitcoin and curve dependencies used by
the SDK. The engine root loads the shared derivation on demand. Ethereum-only
SDK use still requires no engine or Bitcoin dependency.

This slice does not guard `WasmPrePeginTx`, `WasmPeginTx`, or
`WasmPeginPayoutConnector`. The original amount vector and trusted restoration
inputs remain separate work. Do not close #2361 or #2231.

## Use guarded transaction builders

Import these builders from `@babylonlabs-io/ts-sdk/tbv/core/primitives`:

- `buildPrePeginPsbt(params)` replaces raw Pre-PegIn construction. It checks
  amounts, output layout, and HTLC scripts against the request. Its `psbtHex`
  field contains the unfunded transaction hex, despite the field name.
- `buildPeginTxFromFundedPrePegin(params)` replaces funded reconstruction and
  `buildPeginTx`. It checks the parent outpoint, transaction layout, and vault
  value. Its result contains `txHex`, `txid`, `vaultValue`, and
  `vaultScriptPubKey`.
- `buildRefundPsbt(params)` replaces `buildRefundTx`. It returns a refund PSBT
  after it checks the funded output, refund input, destination, and exact fee.
- `buildPeginInputPsbt(params)` builds the HTLC hashlock signing input.
  `buildRefundPsbt` builds the refund signing input.
- `buildPayoutPsbt(params)` checks payout transaction values and signing data.
  It does not independently derive every byte returned by the payout connector.

These calls are asynchronous. Supply the original request and trusted contract
parameters. Use `vaultCoreVersion` for the SDK request where the engine request
used `txGraphVersion`. Keep `pegInAmounts` as `bigint[]` so the builder can check
each value before conversion to `BigUint64Array`. Follow the existing
[Bitcoin setup](../../README.md#ecc-library-initialization-bitcoin-flows-only)
and [primitives guide](../quickstart/primitives.md).

The engine root and the SDK's `tbv/core/wasm` entry are lower-level APIs.
Their amount bounds do not prove that transaction bytes match a user's request.
Switching from the raw loader to `loadTbvWasm()` does not add that proof.

## Retained operation audit

Both browser and Node.js `/raw` entries export the same four classes and
`initWasm`. The SDK also exports `loadRawTbvWasm()` from `tbv/core/wasm`.

| Raw operation                                                                                                                               | Migration or remaining requirement                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WasmPrePeginTx` constructor; `fromFundedTransaction`; `buildPeginTx`; `buildRefundTx`                                                      | Use the transaction builders above.                                                                                                                                                                      |
| `getDepositorClaimValue`; `getHtlcValue`; `getPeginAmountAt`; `getNumHtlcs`; `getHtlcAddress`; `getHtlcScriptPubKey`                        | Use the Pre-PegIn result and its array lengths. Its addresses remain engine metadata; derive addresses from the checked HTLC scripts when needed. Independently check any retained raw value before use. |
| `WasmPeginTx.getVaultValue`; `getVaultScriptPubKey`; transaction `getTxid` and `toHex`                                                      | Use the checked PegIn result. For a Pre-PegIn ID, derive it from the checked transaction bytes.                                                                                                          |
| `WasmPeginTx.fromJson`; `toJson`                                                                                                            | No guarded round-trip replacement. See the compatibility blocker below.                                                                                                                                  |
| `WasmPrePeginHtlcConnector` constructor; `getAddress`; `getScriptPubKey`; hashlock and refund script/control-block getters                  | The raw connector now checks these fields against its inputs. Use the signing builders above for transactions. `getPrePeginHtlcConnectorInfo` at the engine root still has no independent signing-data check.                                                 |
| `WasmPeginPayoutConnector` constructor; `getAddress`; `getScriptPubKey`; `getPayoutScript`; `getPayoutControlBlock`; `getTaprootScriptHash` | Use `buildPayoutPsbt` for signing. The engine's `createPayoutConnector` manages object lifetime, but is not a signing check.                                                                             |
| All `getTxGraphVersion` methods                                                                                                             | Keep the trusted request version. Do not treat a returned version as proof of valid transaction values.                                                                                                  |
| All `free` and `[Symbol.dispose]` methods                                                                                                   | Builders manage engine objects. Raw callers must still release their objects.                                                                                                                            |
| `/raw.initWasm`; `loadRawTbvWasm`                                                                                                           | Builders load the engine on demand. Engine-only callers can use root `initWasm`, but initialization does not validate results.                                                                           |

## Internal caller

The only production raw caller is
[`buildRefundPsbt`](../../src/tbv/core/primitives/psbt/refund.ts).
Vault has no direct raw caller. Refund construction has no engine facade
replacement. Keep this caller and its equivalent checks:

- Check deposit amounts before conversion to unsigned 64-bit values.
- Derive the HTLC script and signing data independently.
- Compare the funded output with the expected HTLC script and template value.
- Check refund version, locktime, input count, parent ID, output index, and sequence.
- Require one output to the depositor with value equal to the funded value minus
  the requested fee.

The refund tests use real engine transactions. They change returned transaction
fields and confirm that the builder rejects invalid results.

## Compatibility blocker and release

`WasmPeginTx.fromJson(version, json)` has no separate trusted request, parent
transaction, depositor key, or fee parameters. Checking fields against the same
JSON proves consistency only. It cannot establish the independent expected
values required before signing. Adding required inputs or rejecting this use
would change the published contract.

The `WasmPrePeginTx` constructor receives amounts after conversion to `BigUint64Array`.
Values can wrap during that conversion. A check inside the constructor cannot
recover the original `bigint` values. Raw methods are synchronous; the existing
SDK builders are asynchronous. A replacement must account for both constraints.

The approved deprecation does not resolve these limits. The separate release
decision must define how callers supply trusted inputs and how existing
`fromJson` calls remain supported. Do not close #2361 or #2231 on this change.
The guarded product-path work in #2386 remains separate.

The earlier deprecation change kept class identities and signatures. This HTLC
guard changes class identity and rejects unchecked inputs. Use a breaking-change
release marker for the engine. The SDK must use the engine release that contains
the shared derivation. The remaining raw API changes need their own release
records. API removal and its date remain outside this change.
