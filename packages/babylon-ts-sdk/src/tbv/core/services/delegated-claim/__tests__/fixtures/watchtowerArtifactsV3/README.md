# Graph-v3 watchtower artifacts fixture

`fixture.json` holds the inputs `realWasmWatchtowerArtifacts.test.ts` needs to
call the real WASM
(`buildWatchtowerArtifacts` / `verifyWatchtowerArtifacts`, graph version 3)
and prove that an **unjoined** artifacts file (`babe_sessions: {}`) and a
**joined** one both build and verify, and that a partial session map is
refused.

Everything here was produced by btc-vault's own code at the pinned revision;
the generator only replays btc-vault's test recipe at Core version 3 and
serializes the result.

## Pins

| What | Value |
| --- | --- |
| btc-vault | `b534ff9e846d93367fbaabe0f54517db200326fd` (the v3 engine bundled by vault-wasm `301fb3da`, per `packages/babylon-tbv-rust-wasm/scripts/build-wasm.js`) |
| Toolchain | `1.93.1` (btc-vault's `rust-toolchain.toml` at that rev) |
| Features | `btc-vault` with `test-utils` (default features kept) |

## Layout

```
fixture.json              the generated fixture (699 926 bytes)
generator/Cargo.toml      stand-alone generator crate, dependencies pinned exactly
generator/Cargo.lock      btc-vault's own lock at the pinned rev, pruned to what the
                          generator builds (537 entries, every name, version, source
                          and checksum identical) plus the generator crate
generator/src/main.rs     the generator
```

The generator builds against a `git archive` export of btc-vault at the pinned
revision (`generator/btc-vault-src/`, a path dependency so the `babe-daemons`
workspace member and the `workspace = true` manifest fields resolve) and
btc-vault's own `Cargo.lock` at that revision, so every transitive crate matches
what btc-vault builds with. The exported tree is not committed; regeneration
recreates it (see below).

## What the generator does (`src/main.rs`)

1. **Graph.** Replays `test_depositor_claimer_graph_for_depositor`
   (`crates/vault/src/test_utils.rs`) with
   `config.vault_core_version = 3` and `config.settlement_chain_id = 11155111`
   (the value btc-vault's own marker test stamps, `tx_graph/graph.rs:2292`).
   `PegInParams.core_version = 3` is what makes the PegIn v3-shaped: an
   nVersion-3 (TRUC) transaction with three outputs, the third being the
   240-sat P2A anchor (`transactions/pegin.rs` `build_outputs` /
   `expected_tx_version`). The HTLC value is raised by those 240 sats so the
   baked PegIn fee stays 1 000 sats. The generator re-applies the vault-wasm
   facade's structural gate (`src/dispatch/mod.rs`
   `check_pegin_value_tx_graph_version` @ `fd9872c4`: `pegin_tx.tx.version == 3`
   and 3 outputs) to the serialized graph before going further.
2. **Presign.** `presign_test_depositor_claimer_graph` (VP seed 2, VKs 3–4,
   UC 5, depositor NoPayout presigs), exactly as `DelegatedClaimFixture::new`.
3. **Claimer-side signatures.** Same as `DelegatedClaimFixture::new`: signed
   Claim (`finalize_claim_tx`), Assert claimer sig, Payout claimer sig,
   depositor Payout sig (`sign_depositor_payout_sig`), full
   `WronglyChallenged` map — all `sign_schnorr_no_aux_rand`.
4. **btc-vault's builder and verifier, three times:**
   - `babe_sessions_json = "{}"` → `build_watchtower_artifacts` **Ok**,
     `verify_watchtower_artifacts` **Ok**; the file records
     `babe_sessions: {}`, `vault_core_version: 3`, the expected `vault_id`.
   - one session per challenger (`decryptor_artifacts_hex: "a1a2"`) →
     build **Ok**, verify **Ok**; the file's `babe_sessions` equals the map.
   - the same map minus the first (sorted) challenger →
     `Err(ArtifactsError::BabeSessionMissing { challenger_pk })` with
     `challenger_pk` equal to the dropped key. Any other outcome panics.
5. **Vault id.** `keccak256(abi.encode(bytes32 peginTxHash, address depositor))`
   with the txid in display order — the encoding the SDK's
   `derivePeginVaultId(peginTxidFromClaimTx(claim), depositor)` uses
   (`packages/babylon-ts-sdk/src/tbv/core/clients/eth/pegin-transaction.ts`).
   Self-tested at startup against btc-vault's `cast` golden vector
   (`crates/eth-client/src/vault_id.rs:128-147`), and cross-checked after
   generation with the toolkit's own `viem`
   (`keccak256(encodeAbiParameters([bytes32,address], …))` → same id).
6. Writes `fixture.json`.

### Seeds and values

| Party / value | Source |
| --- | --- |
| Depositor (= claimer) | `dummy_keypair_seeded(1)` / `dummy_pubkey_seeded(1)` |
| Vault provider | seed 2 |
| Vault keepers | seeds 3, 4 |
| Universal challenger | seed 5 |
| Security council | seeds 10, 11; quorum 2 |
| Claimer WOTS keys | `test_depositor_claimer_wots_keypairs()` (seed byte 1) |
| Per-challenger GC WOTS keys | ChaCha20Rng seeded with `[0x6c; 32]`, drawn in challenger order VK3, VK4, UC5 (btc-vault's recipe draws from `thread_rng`; see Reproducibility) |
| GC output label hashes | `sha256([i; 32])`, i in 0..6 |
| Hashlock | `sha256::Hash::from_byte_array([0xaa; 32])` |
| Network / timelocks | regtest; t1 = 108, t2 = 684 (`test_config`), refund 144 |
| PegIn / claim / anchor / fee | 100 000 000 / 1 000 000 / 240 / 1 000 sats (HTLC 101 001 240) |
| Depositor ETH address | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` (Hardhat #1, the address the SDK's `vaultIdBinding` tests already use) |
| Verifying key | `GENERATOR_VERIFYING_KEY_HEX`, copied from btc-vault `delegated_claim.rs:1273` (test-private): structurally valid, verifies no proof |
| Block number / circuit version | 42 / 7 (`DELEGATED_CLAIM_FIXTURE_*` from `test_utils.rs`) |

## `fixture.json` shape

Top-level keys: `babeSessionsJoined`, `inputs`, `meta`, `usableForVault`,
`vault` (serde_json sorts keys).

- `inputs` — exactly the 13 fields of the toolkit's
  `WatchtowerArtifactsInputs` (`packages/babylon-tbv-rust-wasm/src/types.ts`),
  same camelCase names: `txGraphVersion` (3), `graphJson` (string, 687 396
  bytes — pass verbatim), `signedClaimTxHex`, `assertClaimerSigHex`,
  `payoutClaimerSigHex`, `wronglyChallengedSigs` (object: hex pk → 6 sig hexes,
  3 challengers), `depositorPayoutSigHex`, `verifyingKeyHex`,
  `claimableEventBlockNumber` (**JSON number 42** — the TS type is `bigint`, so
  wrap it: `BigInt(fixture.inputs.claimableEventBlockNumber)`),
  `proverCircuitVersion` (7), `vaultIdHex` (`0x…`), `babeSessionsJson` (`"{}"`,
  the unjoined case), `expectedVaultCoreVersion` (3).
- `babeSessionsJoined` — `{ "<pk>": { "decryptor_artifacts_hex": "a1a2" } }`
  for all three challengers; `JSON.stringify` it into `babeSessionsJson` for
  the joined case. Delete one key for the partial case.
- `usableForVault` — the non-file parameters of the SDK's
  `assertArtifactsUsableForVault`, under its own names: `expectedVaultId`,
  `depositorEthAddress`, `trustedVerifyingKeyHex`,
  `expectedProverCircuitVersion`, `expectedClaimableEventBlockNumber`
  (again a JSON number; wrap in `BigInt`).
- `vault` — `peginTxid`, `claimTxid`, `depositorBtcXOnlyPubkey`,
  `vaultProviderPubkey`, `challengerPubkeys` (ascending).
- `meta` — btc-vault rev, seeds and values above.

Size: 699 926 bytes. `graphJson` is 98 % of it; inside the graph,
`challenger_subgraphs` (427 KB) and `assert_tx` (233 KB) dominate — WOTS public
keys and per-challenger transactions, inherent to a three-challenger graph.
Dropping to one VK + one UC would cut roughly a third, at the cost of no longer
matching btc-vault's own test graph.

## Regenerating

Run it in a scratch copy, so the exported tree and the build output stay out of
the repository:

```sh
rm -rf /tmp/watchtower-fixture
cp -R generator /tmp/watchtower-fixture
mkdir -p /tmp/watchtower-fixture/btc-vault-src
git -C ~/babylon/btc-vault archive b534ff9e846d93367fbaabe0f54517db200326fd | tar -x -C /tmp/watchtower-fixture/btc-vault-src
cargo +1.93.1 run --locked --manifest-path /tmp/watchtower-fixture/Cargo.toml
cp /tmp/watchtower-fixture/fixture.json fixture.json
```

Expected stdout (two consecutive runs printed exactly this):

```
unjoined: build Ok, verify Ok (697967 bytes)
joined:   build Ok, verify Ok (698272 bytes)
partial:  refused with BabeSessionMissing { 4de1345aa847bf96342fb0fc601878a966948ae218a54d32510b7678afe3e5dc }
pegin txid:   03bb1750c327a5578dce9b1c9fe3ce857390b27750490b85c596d2a85d6390ea
vault id:     0xf35acd0ee87df5725c5a820af27e245141f71901461d6e22a69da23d417aea00
challengers:  3
graph JSON:   687396 bytes
fixture.json: 699926 bytes -> /tmp/watchtower-fixture/fixture.json
```

## Reproducibility

Regeneration is **semantically** reproducible but **not byte**-reproducible.
Measured over two consecutive runs:

- raw `fixture.json` bytes: **differ** (sha256 `f3a005ea…` vs `f1f91b6d…`);
- canonical form (keys sorted recursively, `graphJson` parsed): **identical**;
- `signedClaimTxHex`, all four signature fields, `wronglyChallengedSigs`,
  `vaultIdHex`, pegin and claim txids: **identical**.

What varies: only the key order of `HashMap`-backed fields inside `graphJson`
(`challenger_subgraphs`, `challenger_gc_data`, the per-challenger presignature
maps, …) — `serde_json` writes them in `std::HashMap` iteration order, which is
randomized per process. Nothing else does: every Schnorr signature uses
`sign_schnorr_no_aux_rand`, challengers are ordered by `all_sorted()` inside
`TxGraph::new`, and the GC WOTS keys come from a fixed ChaCha20 seed (this is
the one deliberate deviation from btc-vault's test recipe, which draws them
from `thread_rng` and would otherwise change the Assert/ChallengeAssert
transactions — and every signature — on each run).

## Limits

- `"a1a2"` is btc-vault's `DELEGATED_CLAIM_FIXTURE_SESSION_HEX`: valid hex
  that verifies, but not a decodable BaBe session, so a joined file built from
  it would still be refused by `vaultd vp wt start-claim`.
- The verifying key is structurally valid only; `pinPegoutProof` and anything
  needing a real proof cannot be exercised with it.
