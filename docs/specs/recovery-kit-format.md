# Recovery Kit Format

**Format**: `babylon-btc-vault-recovery-kit`, `format_version` 1
**Status**: Draft

> **Source of truth.** The writer is
> [`tarWriter.ts`](../../services/vault/src/services/artifacts/tarWriter.ts) and
> [`claimFile.ts`](../../services/vault/src/services/artifacts/claimFile.ts); their tests pin the
> header layout and the `claim.json` schema. If this document and the tests disagree, the tests
> win.

## Purpose

The vault app saves a depositor's recovery artifacts as one file, so the depositor (or an operator
acting for them) can claim the vault without its vault provider. The file holds the provider's
per-challenger session files, unchanged, and a `claim.json` that names the vault and records each
session's hash.

## Layout

```
babylon-vault-<first 8 hex of the pegin txid>.tar   uncompressed POSIX ustar, ≈707 MB for 8 challengers
├── sessions/<challenger x-only pk>.cbor × N         exactly the bytes the vault provider served, keys sorted ascending
└── claim.json                                       last entry
(two zero blocks; nothing after them)
```

## Writer rules

- Names are `sessions/<64 lowercase hex>.cbor` (78 bytes) and `claim.json`. No top-level
  directory, no directory entries, `prefix` and `linkname` all NUL, no pax headers.
- The writer sorts the session keys itself (ascending, bytewise) rather than trusting the
  provider's order. `claim.json`'s `sessions` object uses the same order.
- Header fields: mode `0000644`, uid/gid/devmajor/devminor `0000000`, mtime `0` (deterministic
  output; extracted files show 1970-01-01), uname/gname all NUL, magic `ustar\0`, version `00`,
  typeflag `0`.
- Numeric encoding is exact: size and mtime as 11 octal digits and NUL; the 8-byte fields as 7
  octal digits and NUL; the checksum as 6 octal digits, NUL and a space. Unsigned only.
- The writer refuses an entry whose size is not a non-negative safe integer below 2^33 or whose
  name exceeds 100 bytes.
- Data is NUL-padded to a 512-byte multiple; the archive ends with exactly two zero blocks.

## `claim.json`

JSON, UTF-8, snake_case keys. The key order below is what the writer emits; readers must not
depend on it.

```json
{
  "format": "babylon-btc-vault-recovery-kit",
  "format_version": 1,
  "pegin_txid": "<64 lowercase hex, display byte order, no 0x>",
  "vault_id": "0x<64 lowercase hex>",
  "depositor_pk": "<x-only, 64 lowercase hex>",
  "vault_provider": "0x<40 lowercase hex>",
  "signed_graph_fingerprint": "<64 lowercase hex>",
  "tx_graph_json": "<the provider manifest's tx_graph_json string value>",
  "verifying_key_hex": "<the provider manifest's verifying_key_hex value>",
  "sessions": {
    "<challenger x-only pk, 64 lowercase hex>": { "byte_length": 88064670, "sha256": "<64 lowercase hex>" }
  }
}
```

Field rules:

- `pegin_txid` and `depositor_pk` are the values the graph was bound to before download: the
  graph's claim and payout transactions spend the pegin, and its `depositor_pubkey` matches.
- `vault_id` is derived from `pegin_txid` and the depositor's Ethereum address, compared with the
  vault id the app requested the kit for, and refused on mismatch. The derived value is written.
- `vault_provider` is the provider the indexer reported for the vault when the kit was saved. It
  is advisory for readers.
- `signed_graph_fingerprint` is the fingerprint the saving device recorded when the depositor
  presigned, matched against the graph before download. A saving device that holds no readable
  record (none was kept, or its storage could not be read) writes the fingerprint it computed from
  the graph as the provider served it, which is not a record of what the depositor signed. The file
  does not say which of the two it holds. For a reader it is a self-declared value either way, not
  proof of what the depositor signed: recompute the fingerprint from the graph if you need one.
- `tx_graph_json` keeps the manifest's string value (JSON encoded inside a JSON string).
- `verifying_key_hex` is the provider's copy. It is not evidence of anything; compare it with a
  trusted key before use.
- The `sessions` keys equal the graph's `local ∪ universal` challenger set. `byte_length` is an
  integer from 32 768 to 268 435 456. `sha256` is the provider's ETag value and equals the hash
  the saving device computed over the bytes it wrote. There is no `path` field: an entry's name is
  `sessions/<key>.cbor` by rule.

## Reading

1. Refuse a file shorter than 512 bytes. Bound every read by the file size: refuse a header or
   entry that would extend past the end.
2. Parse each header: magic `ustar\0` and version `00` exactly; typeflag `0` only; a valid
   checksum; numeric fields in strict ASCII octal; `prefix` and `linkname` all NUL. A name must be
   exactly `claim.json` or match `^sessions/[0-9a-f]{64}\.cbor$`. Session entries are at most
   256 MiB and `claim.json` at most 64 MiB.
3. Walk: data starts 512 bytes after its header, and the next header follows the data padded to
   512. Stop at 1 025 entries. Refuse duplicate names. `claim.json` must be the last entry.
4. After `claim.json`'s padded data there must be exactly two zero blocks, and the file must end
   there.
5. Parse `claim.json` against the schema above, with `format` and `format_version` exact. The
   `sessions` keys must equal the session entry names, each `byte_length` must equal its entry's
   size, and there must be N + 1 entries.
6. Re-derive `vault_id` from `pegin_txid` and an Ethereum address chosen independently of the
   file, and run the same graph binding checks the download runs. Do not trust `vault_id`,
   `vault_provider` or `signed_graph_fingerprint` from the file.
7. Read a session's bytes only when a caller asks for that entry, hash them, and compare with
   `sessions[pk].sha256`.

## Verification commands

```bash
tar -tf babylon-vault-<id>.tar
tar -xOf babylon-vault-<id>.tar sessions/<pk>.cbor | shasum -a 256   # compare with claim.json
tar -xOf babylon-vault-<id>.tar claim.json | python3 -m json.tool
python3 -c "import tarfile; print(tarfile.open('babylon-vault-<id>.tar').getnames())"
```

## Operator join for `vaultd vp delegated-claim`

A session's `decryptor_artifacts_hex` is its entry's bytes as hex:

```bash
tar -xOf babylon-vault-<id>.tar sessions/<pk>.cbor | xxd -p | tr -d '\n'
```

## Versioning

Any change to the layout, the header encoding or the `claim.json` schema increases
`format_version`. A reader refuses a `format_version` it does not know.

## What this format does not prove

- That the sessions can decrypt anything: the file proves the bytes are the ones the provider
  served, not that they are usable
  ([#2903](https://github.com/babylonlabs-io/babylon-toolkit/issues/2903)).
- That `verifying_key_hex` is the protocol's key; check it against a trusted source at claim time
  ([#2650](https://github.com/babylonlabs-io/babylon-toolkit/issues/2650)).
