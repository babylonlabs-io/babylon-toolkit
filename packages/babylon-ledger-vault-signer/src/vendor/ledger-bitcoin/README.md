# Vendored `ledger-bitcoin` internals

Byte-level building blocks for the vault SIGN_PSBT host protocol (#2219),
vendored from Ledger's Bitcoin JS client rather than depended on. The client is
npm-deprecated, and its maintained successor (`@ledgerhq/ledger-bitcoin@0.3.1+`)
requires `bitcoinjs-lib` v7 against this repo's `6.1.7` pin — so we vendor the
v6-compatible source and gate it with golden vectors.

## Provenance

- **Upstream:** [`LedgerHQ/app-bitcoin`](https://github.com/LedgerHQ/app-bitcoin)
  (formerly `app-bitcoin-new`), `bitcoin_client_js/src/lib/`.
- **Pinned commit:** `0a9e9e141f3340d29e7c6181177d4e5e9483a9f7` — the npm
  `gitHead` of `ledger-bitcoin@0.3.0`, byte-for-byte the published package.
- **License:** Apache-2.0. `LICENSE` here is the verbatim upstream copy. Upstream
  carries no copyright line, NOTICE file, or per-file headers — so none is
  reproduced; attribution is by project name and URL (Apache-2.0 §4(a)/(c)).
- Each file's header records its upstream path, version, upstream sha256, and the
  exact modifications made (§4(b)).
- **Known upstream behaviour (kept):** `parseVarint` accepts non-canonical
  (overlong) encodings — e.g. `fd0100` decodes to `1` — with no minimality check,
  matching upstream and the Python oracle. Resolved with `psbtv2`: it parses
  length varints through `sanitizeBigintToNumber(readVarInt())` and re-serializes
  every map through `createVarint` (`serializeMap`), so overlong lengths in a
  hostile PSBT are re-emitted canonically — parse-accept, emit-canonical.

## Modifications (applied to every file)

- Explicit `import { Buffer } from "buffer"` — no implicit Node global, since this
  package ships to the browser and the connector's vite polyfill cannot resolve a
  bare `Buffer` from the standalone dist.
- Strict-null / strict-index fixes for this repo's strict `tsconfig`.
- Prettier/quote formatting to the package style.

Everything else — protocol logic, byte layout, function surface — is verbatim,
with the exceptions recorded per file header; the substantive ones:

- `psbtv2.ts`: `fromBitcoinJS` is dropped — it throws on taproot inputs,
  exactly our case; the map-level `normalizeToV2` is the path we use.
- `psbtv2.ts`: the `serializeMap` key comparator is unified from
  `localeCompare` to the byte-lexicographic code-unit order that `MerkleMap`
  and the device enforce (base app `check_merkle_tree_sorted.c`) — serialize
  order, merkleization order, and the vectors' `sorted_key_order` are one
  order.
- `clientCommands.ts`: local addition — an optional `onYield(payload)`
  validator on `YieldCommand` / the interpreter constructor, the vault
  SIGN_PSBT seam (the per-yield assertion of #2219 hooks in there); it runs
  before the payload is recorded, so a throw leaves the FAILING yield
  unrecorded — earlier validated yields remain in `getYielded()` (multi-input
  flows yield once per input). Discard the interpreter on abort; a retry must
  seed a fresh one. The validator receives a copy, and the payload push itself
  stays raw (`subarray(1)`, no shape assumption).

Vendored so far: `varint.ts`, `merkle.ts`, `merkleMap.ts`, `buffertools.ts`,
`psbtv2.ts`, `merkelizedPsbt.ts`, `clientCommands.ts`, `policy.ts` — the
full #2219 vendoring closure. These modules are referenced only by their
golden-vector and unit tests, not by any production entrypoint (nothing
reachable from `src/index.ts` imports them), so the bundler tree-shakes them
out of the JS bundle and the vendor dir is excluded from declaration emission
(see `vite.config.ts`) — the published `dist/` ships none of the vendored code
(no JS, no `.d.ts`), and the `bitcoinjs-lib` / `buffer` deps they pull in stay
out of the bundle, until the SIGN_PSBT task (#2219 B1-d) wires them in.

### Planned local additions (not yet applied)

- `psbtv2.ts` local addition `getInputEntriesOfType` (generic reader for the
  expected-signature table) lands with its consumer, not before — zero dead
  code.

## Golden-vector gate

`__tests__/*.golden.test.ts` check the vendored modules against vectors generated
by **Ledger's own Python client** (`ledger-bitcoin==0.4.0`, the version the vault
firmware's device tests drive SIGN_PSBT through). `varint` and `merkle` have
direct golden vectors (`varint.json`, `merkle_mth.json`); `merkleMap`'s commitment
(keys root, values root, the `varint(n) ‖ keysRoot ‖ valuesRoot` layout, and the
outer Merkle-of-maps roots) is checked today against per-map commitment vectors the
Python client emits over the firmware's PSBT fixtures (`__tests__/vectors/signpsbt/*.json`).
`psbtv2`'s gate parses every fixture's `psbt_hex`, normalizes to v2, and checks
each map's keys/values, the serialized key order (== `sorted_key_order`), and
full byte-identity with `psbt_v2_hex` — the oracle serializes maps in insertion
order, so the identity is asserted by reassembling the normalized model in the
oracle's recorded order. `merkelizedPsbt`'s gate re-derives, from each
fixture's raw `psbt_hex` through the class, every per-map commitment, the
outer inputs/outputs maps-roots, and the reassembled SIGN_PSBT client data
(`sign_psbt_cdata_hex`) over all 22 fixtures — superseding the
hand-concatenated maps-root/cdata assertions that previously lived in the
`merkleMap` golden. `clientCommands` has unit tests pinning the three chunking
constants (first preimage chunk `255 − len(varint) − 1`; 6 proof hashes per
GET_MERKLE_LEAF_PROOF response; `⌊253 / el_len⌋` per GET_MORE_ELEMENTS round),
the found=0 no-throw contract of GET_MERKLE_LEAF_INDEX, the two preimage traps
(list elements stored 0x00-prefixed, wallet-policy material raw), and the
`onYield` seam — request/response bytes checked against the committed Merkle
vectors. `policy` is gated by a `DefaultWalletPolicy("tr(@0/**)", …)`
serialize/getId golden emitted by the same Python oracle (repro command in the
test header). Any behavioural drift from upstream fails these. The Python
client is the primary oracle; the deprecated npm package is a secondary check.

Vector provenance (`__tests__/vectors/signpsbt/`):

- Generated by `scripts/gen_vectors.py` (venv + `ledger-bitcoin==0.4.0` pin in
  `scripts/requirements.txt`) over the firmware fixtures
  `app-babylon-vault/tests/vectors` at commit `8f99b8b`.
- The 195-byte `sign_psbt_cdata_hex` ends in 64 zero bytes because the generator
  mirrors the firmware tests' `_NoWalletPolicy` (`wallet_id` = 32×0x00 — the
  routing switch into the vault validators; only `.id` reaches the payload).
- `merkle_mth.json` covers n = 0..9 leaves, exercising the
  k = largest-power-of-two-strictly-less-than-n split (perfect powers included);
  MTH({}) = 32×0x00.
- The outer inputs/outputs maps-roots hash each serialized per-map commitment as
  a `0x00`-prefixed leaf (`element_hash`) — a distinct byte treatment from the
  inner keys/values trees.
- The v0 pegin fixtures carry zero-entry per-output maps pre-normalization; the
  `psbtv2` gate parses through them and pins that `normalizeToV2` synthesizes
  AMOUNT/SCRIPT into empty maps. (`deposit-flow__pegin__0` is a stale pre-v22
  1-in/2-out capture — valid for byte-level goldens, device-invalid today.)

## Re-diff procedure (on an upstream update)

1. `git -C <clone of LedgerHQ/app-bitcoin> fetch && git diff \
0a9e9e141f3340d29e7c6181177d4e5e9483a9f7..<new> -- bitcoin_client_js/src/lib/`
   — review the per-file deltas.
2. Apply the deltas onto these copies, re-run the style pass, and update each
   header's `Version` / `Modifications` / upstream sha256.
3. Re-run the golden-vector gate. If the update crosses into `bitcoinjs-lib` v7
   (0.3.1+), do NOT take it without migrating the repo's v6 pin first.

### Command-trace goldens (`__tests__/vectors/command-traces/`)

Request/response traces for the client-command interpreter (plan S4). Oracle:
`ledger-bitcoin==0.4.0` `ClientCommandInterpreter` (`client_command.py`), pinned in
`scripts/requirements.txt`; every `response_hex` is the literal `execute()` output.
Generated by `scripts/gen_command_traces.py` over four `signpsbt/` vectors (one per
flow), seeded exactly as `client.py sign_psbt` seeds the interpreter (`client.py:293-320`,
`_NoWalletPolicy`). Traces are order-dependent (shared element queue).
`synthetic__deep_tree.json` and all YIELD payload bytes are synthetic (marked in-file);
YIELD responses and all other bytes are oracle output. Independently verified with a
plain-hashlib recursive-MTH replay before committing. Replayed by
`clientCommands.golden.test.ts`.
