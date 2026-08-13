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
  matching upstream and the Python oracle. Harmless while we only emit varints via
  `createVarint`, but a hazard once PSBT bytes are parsed and reserialized;
  revisit when `psbtv2` lands.

## Modifications (applied to every file)

- Explicit `import { Buffer } from "buffer"` — no implicit Node global, since this
  package ships to the browser and the connector's vite polyfill cannot resolve a
  bare `Buffer` from the standalone dist.
- Strict-null / strict-index fixes for this repo's strict `tsconfig`.
- Prettier/quote formatting to the package style.

Everything else — protocol logic, byte layout, function surface — is verbatim.

Vendored so far: `varint.ts`, `merkle.ts`, `merkleMap.ts`. The PSBT layer
(`buffertools.ts`, `psbtv2.ts`, `merkelizedPsbt.ts`) and the client-command
interpreter (`clientCommands.ts`, `policy.ts`) follow in later increments. Until
then these three modules are referenced only by their golden-vector tests, not by
any production entrypoint (nothing reachable from `src/index.ts` imports them), so
the bundler tree-shakes them out of the JS bundle and the vendor dir is excluded
from declaration emission (see `vite.config.ts`) — the published `dist/` ships none
of the vendored code (no JS, no `.d.ts`), and the `bitcoinjs-lib` / `buffer` deps
they pull in stay out of the bundle, until the PSBT layer lands.

### Planned (not yet vendored)

- `psbtv2.ts`: the object-level `fromBitcoinJS` will be dropped (it throws on
  taproot inputs — exactly our case; the map-level `normalizeToV2` is the path we
  use).

## Golden-vector gate

`__tests__/*.golden.test.ts` check the vendored modules against vectors generated
by **Ledger's own Python client** (`ledger-bitcoin==0.4.0`, the version the vault
firmware's device tests drive SIGN_PSBT through). `varint` and `merkle` have
direct golden vectors (`varint.json`, `merkle_mth.json`); `merkleMap`'s commitment
(keys root, values root, the `varint(n) ‖ keysRoot ‖ valuesRoot` layout, and the
outer Merkle-of-maps roots) is checked today against per-map commitment vectors the
Python client emits over the firmware's PSBT fixtures (`__tests__/vectors/signpsbt/*.json`).
Any behavioural drift from upstream fails these. The Python client is the primary
oracle; the deprecated npm package is a secondary check.

## Re-diff procedure (on an upstream update)

1. `git -C <clone of LedgerHQ/app-bitcoin> fetch && git diff \
0a9e9e141f3340d29e7c6181177d4e5e9483a9f7..<new> -- bitcoin_client_js/src/lib/`
   — review the per-file deltas.
2. Apply the deltas onto these copies, re-run the style pass, and update each
   header's `Version` / `Modifications` / upstream sha256.
3. Re-run the golden-vector gate. If the update crosses into `bitcoinjs-lib` v7
   (0.3.1+), do NOT take it without migrating the repo's v6 pin first.
