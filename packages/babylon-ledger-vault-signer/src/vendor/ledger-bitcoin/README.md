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
- **Known upstream behaviour (kept):**
  - `policy.ts` `serialize()` writes the descriptor-template length in UTF-16
    code units but hashes its UTF-8 bytes; the Python oracle (`wallet.py:70`)
    counts UTF-8 for both, and encodes name/keys as UTF-8 where the JS uses
    `"ascii"` — so they diverge on any non-ASCII input. Identical for the
    ASCII-only templates every flow uses; never construct a `WalletPolicy`
    with non-ASCII strings. If that ever changes, encode once as UTF-8 to
    match the oracle.

## Modifications (applied to every file)

- Explicit `import { Buffer } from "buffer"` — no implicit Node global, since this
  package ships to the browser and the connector's vite polyfill cannot resolve a
  bare `Buffer` from the standalone dist.
- Strict-null / strict-index fixes for this repo's strict `tsconfig`.
- Prettier/quote formatting to the package style.

The repo's general code-style guidance (naming magic numbers, extracting
constants) yields to upstream fidelity inside this directory: a cosmetic rename
turns a line that currently diffs clean into a hand-merge obligation on the next
re-diff, for no behavioural gain. Name a literal here only when its
justification lives off-file — the protocol caps in `clientCommands.ts` are
named so each can carry a firmware citation, which a bare number could not.

Everything else — protocol logic, byte layout, function surface — is verbatim,
with the exceptions recorded per file header; the substantive ones:

- `varint.ts`: **behaviour change** — `parseVarint` rejects non-minimal
  (overlong) CompactSize encodings with a `RangeError`; upstream and the Python
  oracle accept them (`fd0100` decodes to `1`). It joins the `psbtv2.ts` parse
  gates (repeated keypair, trailing bytes — see that file's header) in
  rejecting bytes upstream accepts. WHY: overlong lengths create a _parser
  differential_ against `bitcoinjs-lib`'s bip174. bip174 advances its cursor by
  the CANONICAL width
  (`bip174@2.1.1 src/lib/parser/fromBuffer.js:10-11` —
  `offset += varuint.encodingLength(keyLen)`) while `parseVarint` returns the
  TRUE wire width, so the same bytes deserialize into two different keypair
  sets. Take the crafted 13-byte keypair `01 fc fd0800 deadbeefcafe0000`: both
  parsers read a 1-byte key of type `0xfc` and a value of length 8 — what
  differs is where that value starts and where the map ends. bip174 advances
  one byte past `fd0800` (`encodingLength(8) === 1`), takes `0800deadbeefcafe`
  as the value, then reads the `00` at offset 11 as the map terminator;
  `PsbtV2` advances the true 3, takes `deadbeefcafe0000`, consumes all 13 bytes
  and is still inside the map. From there the two models sit at different
  offsets, so every later keypair and map boundary can differ.
  `prepareSignPsbt`'s merge target is a bitcoinjs `Psbt`, so a ceremony driven
  by the `PsbtV2` model would run to completion and then merge into a target
  parsed into a different keypair set, failing at `finalizeInput`. Fail-closed
  for funds today (device commitment, on-device display and the
  expected-signature table all derive from the SAME `PsbtV2`) and not
  production-reachable — no production caller feeds attacker bytes — but it
  makes "bip174 already validated these bytes" a bypassable mitigation, so the
  differential is closed at the parser instead. Canonical encodings are
  unaffected: `createVarint` only ever emits minimal forms, so every
  serialize→parse path and every oracle-generated vector is untouched, and the
  `psbtv2` parse-accept/emit-canonical round-trip now rejects rather than
  normalizes. The device-fed parse sites are unaffected too — the firmware
  writes both varints we parse through the SDK's `varint_write`, which sizes
  via `varint_size` and so always picks the minimal width
  (`LedgerHQ/ledger-secure-sdk` `lib_standard_app/varint.c` — `varint_size`
  `:25-40`, `varint_write` `:79-104`; blob `fb199f91`, byte-identical on
  `master@6862436` and on `API_LEVEL_25`/`26`/`27`). Both call sites live in the
  base app pinned as `app-babylon-vault@develop`'s `bitcoin_app_base` submodule
  (`LedgerHQ/app-bitcoin@baseapp`, commit `e400d8d8`): the
  GET_MERKLE_LEAF_PROOF `tree_size`/`leaf_index` at
  `src/handler/lib/get_merkle_leaf_hash.c:33-37` (parsed at
  `clientCommands.ts:177-178`) and the YIELD input index at
  `src/handler/sign_psbt/sign_input.c:62` (parsed by `parseVarint(payload, 0)`
  in `expectedSignatures.ts`'s `createYieldCollector`). A device that emitted
  an overlong form would now fail closed. Same rule Bitcoin Core enforces in
  `ReadCompactSize`
  (`bitcoin/bitcoin src/serialize.h:333-358`, blob `a1395c47` —
  `"non-canonical ReadCompactSize()"`). Re-apply on any upstream re-diff.
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
- `psbtv2.ts`: local addition — two `psbtIn` enum members the upstream enum
  lacks (`TAP_LEAF_SCRIPT = 0x15`, `TAP_INTERNAL_KEY = 0x17` — BIP-371, byte
  values verified against base app `psbt.h:37-42`) plus a public
  `getInputEntriesOfType(inputIndex, keyType)` reader returning Buffer copies
  of every `{ keyData, value }` entry of one key type. `PsbtV2`'s maps are
  `protected` with no generic public getter; the SIGN_PSBT expected-signature
  table reads per-input taproot entries through this accessor so the table is
  built from the exact map model the device Merkle-verifies.
- `buffertools.ts`: **behaviour change** — `unsafeTo64bitLE` rejects any input
  that is not a non-negative safe integer; upstream only capped values above
  `MAX_SAFE_INTEGER`, so negatives two's-complement wrapped and `NaN` encoded
  as zero — silent corruption for an amount field.
- `merkelizedPsbt.ts`: **behaviour change** — symmetric map-count guards in the
  constructor: the input/output map counts must equal the declared
  `PSBT_GLOBAL_INPUT_COUNT` / `PSBT_GLOBAL_OUTPUT_COUNT` in BOTH directions.
  Upstream `TypeError`s on missing maps and silently ignores surplus ones, and
  `psbt.copy` already copied those surplus maps, so `serialize()` would emit
  maps the commitment never covers. Valid PSBTs are unchanged.
- `merkle.ts`: **behaviour change** — `getLeafHash` / `getProof` throw a typed
  `Error("Index out of bounds")` on an invalid index instead of upstream's raw
  `TypeError` (`getLeafHash` was unguarded; `getProof` guarded only
  `index >= length`, not negatives); valid indices unchanged.

Vendored so far: `varint.ts`, `merkle.ts`, `merkleMap.ts`, `buffertools.ts`,
`psbtv2.ts`, `merkelizedPsbt.ts`, `clientCommands.ts`, `policy.ts` — the
full #2219 vendoring closure.

## Audit boundary — the vendored JS ships

From #2219 B1-d, `src/index.ts` → `signPsbt.ts` reaches this directory, so the
vendored JavaScript is bundled into the published `dist/`. Verified against
`dist/index.js.map`'s `sources` after a build: `varint`, `buffertools`,
`psbtv2`, `merkle`, `merkleMap`, `merkelizedPsbt`, `clientCommands` are inlined
(1,690 of the 1,789 vendored lines — everything except `policy.ts`'s 99);
`policy.ts` is reachable only through a type position
(`addKnownWalletPolicy`'s parameter) and stays tree-shaken out until
#2221/#2222 use it. `bitcoinjs-lib` and `buffer` remain vite externals.

- **Attribution** lives in `THIRD-PARTY-NOTICES.md`, shipped via package.json
  `files`. `esbuild.legalComments: "none"` strips the per-file Apache-2.0
  §4(b) provenance headers from the bundle — that trade-off is recorded in
  `vite.config.ts`.
- **No vendored declaration ships.** The first-party modules type every
  vendored surface structurally (`ExpectedSignaturePsbt`,
  `SignPsbtCommitments`, `SignPsbtInterpreter`), so no `dist/*.d.ts` references
  `src/vendor`, and `vite.config.ts`'s `beforeWriteFile` drops vendor
  declarations before write. **Review check on every public-API change: never
  re-export a vendored type** (`PsbtV2`, `PartialSignature`,
  `ClientCommandInterpreter`, …) — return a first-party shape instead.
- The audit surface is therefore ~1.8 kLOC of Apache-2.0 source pinned at
  `0a9e9e14`. Provenance headers plus the golden-vector gates below are what
  makes that surface auditable — not its absence from the bundle.

## Known upstream behaviour (kept): a deserialized v0 PSBT serializes as v2

`deserialize()` always normalizes, so `serialize()` re-emits v2 bytes — v2
globals, no `PSBT_GLOBAL_UNSIGNED_TX` — which `bitcoinjs-lib` 6.1.7 rejects
("Only one UNSIGNED_TX allowed"). Production signs from the normalized v2
model and `prepareSignPsbt`'s merge-target parse gate rejects incompatible
input pre-I/O, so this only bites a test that round-trips a v0 fixture through
the model. Kept upstream-faithful.

## Golden-vector gate

`__tests__/*.golden.test.ts` check the vendored modules against vectors generated
by **Ledger's own Python client** (`ledger-bitcoin==0.4.0`, the version the vault
firmware's device tests drive SIGN_PSBT through). `varint` and `merkle` have
direct golden vectors (`varint.json`, `merkle_mth.json`); `merkleMap`'s commitment
(keys root, values root, the `varint(n) ‖ keysRoot ‖ valuesRoot` layout) is
checked today against per-map commitment vectors the
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

## Regenerating the vectors (fixture review)

A vector diff is reviewed by re-derivation, not line-walking: regenerate from
the pinned oracle and require byte-identity with the committed files.

1. Setup, in `packages/babylon-ledger-vault-signer/scripts/`:
   `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`
2. Fixtures: `https://github.com/LedgerHQ/app-babylon-vault` checked out at
   commit `8f99b8b0a0754e0f798a2db6c73a84fc16ce3411`, directory `tests/vectors`.
3. `REGEN=$(mktemp -d)` — a guaranteed-empty directory. Never reuse one: the
   generators do not clear their output, so a stale file from an earlier run
   would stand in for one the current run failed to produce.
4. `.venv/bin/python gen_vectors.py <app-babylon-vault>/tests/vectors "$REGEN"`
5. `.venv/bin/python gen_command_traces.py "$REGEN" "$REGEN/command-traces"`
6. `diff -r "$REGEN" src/vendor/ledger-bitcoin/__tests__/vectors` (from the
   package root). The only acceptable output is `Only in <REGEN>: index.json`
   — gen_vectors.py's provenance index embeds the step-4 fixtures path and is
   deliberately not committed. Anything else — changed, missing, OR extra
   files — is a review finding.

Output is byte-deterministic: `json.dumps(indent=1)` over insertion-ordered
maps, no timestamps, and the synthetic YIELD bytes are sha256-derived from
fixed tags. A PR that regenerates vectors from a newer fixtures commit must
update the pin here (and in the script headers) in the same change; reviewers
regenerate from the pin the PR declares, and state the byte-identity result
in their review.
