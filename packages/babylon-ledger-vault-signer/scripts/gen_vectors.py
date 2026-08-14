#!/usr/bin/env python3
"""Golden-vector generator for the babylon-toolkit Ledger signer (issue #2219, S1-S3).

Oracle: ledger-bitcoin==0.4.0 — the exact package pinned by the vault firmware's
tests/requirements.txt (app-babylon-vault/tests/requirements.txt). The firmware's own
device tests drive SIGN_PSBT through this client with a zero wallet_id
(tests/test_sign_psbt_validate.py::_NoWalletPolicy), so its byte output IS the wire
format the device accepts.

Everything here is computed offline — no device, no Speculos. We import the
package's own modules directly:

  ledger_bitcoin.psbt.PSBT / normalize_psbt / convert_to_v2   (v0 -> v2 normalization)
  ledger_bitcoin.client.parse_stream_to_map                    (map-level parse)
  ledger_bitcoin.merkle.MerkleTree / element_hash /
      get_merkleized_map_commitment                            (RFC-6962-style trees)
  ledger_bitcoin.common.write_varint                           (Bitcoin LE varints)
  ledger_bitcoin.command_builder.BitcoinCommandBuilder.sign_psbt (SIGN_PSBT cdata)

Outputs (all JSON, hex-encoded bytes):
  varint.json               boundary varint encodings
  merkle_mth.json           MTH roots + per-leaf proofs for n = 0..9 element trees
  signpsbt/<id>.json        per-PSBT: v2 normalization maps, per-map commitments,
                            the 4 roots, and the exact SIGN_PSBT cdata (195 B typical)
  index.json                provenance index of every signpsbt vector

Setup (one-liner; ledger-bitcoin==0.4.0 is the pinned oracle, see requirements.txt):
  python3 -m venv .venv && .venv/bin/pip install ledger-bitcoin==0.4.0

Usage:
  .venv/bin/python gen_vectors.py <fixtures_root> <out_dir>
  where <fixtures_root> = app-babylon-vault/tests/vectors at commit 8f99b8b (the
  firmware fixtures the committed signpsbt vectors were generated from), and
  <out_dir> maps onto src/vendor/ledger-bitcoin/__tests__/vectors/.

This is a provenance/regeneration tool — it is not wired into CI or any build.
"""

import base64
import json
import sys
from io import BytesIO
from pathlib import Path

from ledger_bitcoin.client import parse_stream_to_map
from ledger_bitcoin.command_builder import BitcoinCommandBuilder, CURRENT_PROTOCOL_VERSION
from ledger_bitcoin.common import write_varint
from ledger_bitcoin.merkle import MerkleTree, element_hash, get_merkleized_map_commitment
from ledger_bitcoin.psbt import PSBT
from ledger_bitcoin.wallet import WalletPolicy

# Same trick as the firmware's tests/test_sign_psbt_validate.py::_NoWalletPolicy —
# wallet_id = 32 zero bytes routes the firmware into the vault validator
# (init_global_state.c: has_no_wallet_policy). The descriptor content is irrelevant;
# only .id reaches the SIGN_PSBT payload.
class NoWalletPolicy(WalletPolicy):
    def __init__(self):
        super().__init__("", "tr(@0/**)", ["tpubD6NzVbkrYhZ4XgiXtGrdW5XDAPFCL9h7we1vwNCpn8tGbBcgfVYjXyhWo4E1xkh56hjod1RhGjxbaTLV3X4FyWuejifB9jusQ46QzG87VKp"])

    @property
    def id(self) -> bytes:
        return b"\x00" * 32


def load_psbt_hexes(path: Path):
    """Fixture format (tests/vectors/README.txt): .json = JSON array of PSBT hexes,
    .txt = a single hex. 70736274ff = PSBT; 02000000 = finalized raw tx (skip)."""
    text = path.read_text().strip()
    hexes = json.loads(text) if path.suffix == ".json" else [text]
    out = []
    for h in hexes:
        h = h.strip()
        if not h.lower().startswith("70736274ff"):
            print(f"  SKIP (not a PSBT, raw tx reference): {path.name}")
            return []
        out.append(h)
    return out


def map_to_pairs(m):
    """Serialized (insertion) order, as [keyHex, valueHex] pairs."""
    return [[k.hex(), v.hex()] for k, v in m.items()]


def commitment_parts(m):
    """get_merkleized_map_commitment, plus its three parts broken out."""
    items = sorted(m.items())
    keys_root = MerkleTree([element_hash(k) for k, _ in items]).root
    values_root = MerkleTree([element_hash(v) for _, v in items]).root
    commitment = get_merkleized_map_commitment(m)
    assert commitment == write_varint(len(m)) + keys_root + values_root
    return {
        "n_entries": len(m),
        "keys_root": keys_root.hex(),
        "values_root": values_root.hex(),
        "commitment_hex": commitment.hex(),
        "sorted_key_order": [k.hex() for k, _ in items],
    }


def psbt_vector(fixture_rel: str, batch_index: int, psbt_hex: str):
    raw = bytes.fromhex(psbt_hex)

    psbt = PSBT()
    psbt.deserialize(base64.b64encode(raw).decode())
    original_version = psbt.version
    if psbt.version != 2:
        psbt.convert_to_v2()  # exact path client.sign_psbt takes (client.py:271-281)

    v2_bytes = base64.b64decode(psbt.serialize())
    f = BytesIO(v2_bytes)
    assert f.read(5) == b"psbt\xff"

    global_map = parse_stream_to_map(f)
    input_maps = [parse_stream_to_map(f) for _ in range(len(psbt.inputs))]
    output_maps = [parse_stream_to_map(f) for _ in range(len(psbt.outputs))]
    assert f.read() == b"", "trailing bytes after last output map"

    # SIGN_PSBT cdata exactly as command_builder.sign_psbt builds it (0.4.0)
    builder = BitcoinCommandBuilder()
    apdu = builder.sign_psbt(global_map, input_maps, output_maps, NoWalletPolicy(), None)
    cdata = apdu["data"]

    input_commitments = [get_merkleized_map_commitment(m) for m in input_maps]
    output_commitments = [get_merkleized_map_commitment(m) for m in output_maps]
    inputs_maps_root = MerkleTree([element_hash(c) for c in input_commitments]).root
    outputs_maps_root = MerkleTree([element_hash(c) for c in output_commitments]).root

    g = commitment_parts(global_map)
    expected = (
        bytes.fromhex(g["commitment_hex"])
        + write_varint(len(input_maps)) + inputs_maps_root
        + write_varint(len(output_maps)) + outputs_maps_root
        + b"\x00" * 64
    )
    assert cdata == expected, "manual header reconstruction != command_builder output"

    return {
        "fixture": fixture_rel,
        "batch_index": batch_index,
        "original_psbt_version": original_version,
        "psbt_hex": psbt_hex,
        "psbt_v2_hex": v2_bytes.hex(),
        "n_inputs": len(input_maps),
        "n_outputs": len(output_maps),
        "global_map": map_to_pairs(global_map),
        "input_maps": [map_to_pairs(m) for m in input_maps],
        "output_maps": [map_to_pairs(m) for m in output_maps],
        "global_commitment": g,
        "input_commitments": [commitment_parts(m) for m in input_maps],
        "output_commitments": [commitment_parts(m) for m in output_maps],
        "inputs_maps_root": inputs_maps_root.hex(),
        "outputs_maps_root": outputs_maps_root.hex(),
        "sign_psbt_cdata_hex": cdata.hex(),
        "sign_psbt_cdata_len": len(cdata),
        "apdu": {
            "cla": apdu["cla"],   # 0xE1
            "ins": int(apdu["ins"]),  # 0x04 SIGN_PSBT
            "p1": apdu["p1"],     # 0
            # Self-validating: the recorded p2 must be the client's protocol version.
            "p2": _checked_p2(apdu["p2"]),
        },
    }


def _checked_p2(p2: int) -> int:
    assert p2 == CURRENT_PROTOCOL_VERSION, f"p2 {p2} != protocol {CURRENT_PROTOCOL_VERSION}"
    return p2


def gen_varint_vectors():
    boundaries = [
        0, 1, 0x10, 0xFC,                      # 1-byte form
        0xFD, 0xFE, 0xFF, 0x100, 0xFFFF,       # 0xFD + 2-byte LE
        0x10000, 0x12345678, 0xFFFFFFFF,       # 0xFE + 4-byte LE
        0x100000000, 0x0102030405060708, 0xFFFFFFFFFFFFFFFF,  # 0xFF + 8-byte LE
    ]
    return {
        "description": "ledger_bitcoin.common.write_varint — Bitcoin varints, little-endian payloads",
        "vectors": [{"value": n, "hex": write_varint(n).hex()} for n in boundaries],
    }


def gen_merkle_vectors():
    """MTH roots + proofs for n = 0..9 leaves. Leaf i's preimage is the single byte
    i, so leaf hash = SHA256(0x00 || byte(i)). n=3..9 exercises the
    k = largest-power-of-2-strictly-smaller-than-n split (perfect-power n=4,8 included)."""
    vectors = []
    for n in range(0, 10):
        preimages = [bytes([i]) for i in range(n)]
        leaf_hashes = [element_hash(p) for p in preimages]
        tree = MerkleTree(leaf_hashes)
        vectors.append({
            "n": n,
            "leaf_preimages": [p.hex() for p in preimages],
            "leaf_hashes": [h.hex() for h in leaf_hashes],
            "root": tree.root.hex(),
            "proofs": [[s.hex() for s in tree.prove_leaf(i)] for i in range(n)],
        })
    return {
        "description": (
            "ledger_bitcoin.merkle.MerkleTree — MTH({})=32x00; MTH({d0})=SHA256(0x00||d0); "
            "MTH(D[n])=SHA256(0x01||MTH(D[0:k])||MTH(D[k:n])), k = largest power of 2 "
            "strictly smaller than n. proofs[i] = sibling hashes bottom-up (prove_leaf)."
        ),
        "vectors": vectors,
    }


def main():
    if len(sys.argv) != 3:
        sys.exit("usage: gen_vectors.py <firmware-fixtures-root> <output-dir>")
    fixtures_root = Path(sys.argv[1])
    out_dir = Path(sys.argv[2])
    (out_dir / "signpsbt").mkdir(parents=True, exist_ok=True)

    fixture_files = [
        "deposit-flow/pre_pegin.txt",
        "deposit-flow/pegin.json",
        "deposit-flow/claimer_payout.json",
        "deposit-flow/depositor_graph.json",
        "deposit-flow/refund.txt",                    # raw tx — skipped, recorded in index
        "generated/deposit-flow/pre_pegin.txt",
        "generated/deposit-flow/pegin.json",
        "generated/deposit-flow/claimer_payout.json",
        "generated/deposit-flow/depositor_graph.json",
        "depositor-as-claimer/claim.txt",             # raw tx — skipped
        "depositor-as-claimer/assert.txt",            # raw tx — skipped
        "depositor-as-claimer/wrongly_challenged.txt",  # raw tx — skipped
    ]

    index = {"package": "ledger-bitcoin==0.4.0", "fixtures_root": str(fixtures_root),
             "psbt_vectors": [], "skipped_raw_tx_fixtures": []}

    for rel in fixture_files:
        path = fixtures_root / rel
        hexes = load_psbt_hexes(path)
        if not hexes:
            index["skipped_raw_tx_fixtures"].append(rel)
            continue
        for i, h in enumerate(hexes):
            vec = psbt_vector(rel, i, h)
            vec_id = rel.replace("/", "__").rsplit(".", 1)[0] + f"__{i}"
            out_file = out_dir / "signpsbt" / f"{vec_id}.json"
            out_file.write_text(json.dumps(vec, indent=1) + "\n")
            index["psbt_vectors"].append({
                "id": vec_id, "fixture": rel, "batch_index": i,
                "n_inputs": vec["n_inputs"], "n_outputs": vec["n_outputs"],
                "sign_psbt_cdata_len": vec["sign_psbt_cdata_len"],
                "sign_psbt_cdata_hex": vec["sign_psbt_cdata_hex"],
            })
            print(f"  OK {vec_id}: {vec['n_inputs']} in / {vec['n_outputs']} out, "
                  f"cdata {vec['sign_psbt_cdata_len']} B")

    (out_dir / "varint.json").write_text(json.dumps(gen_varint_vectors(), indent=1) + "\n")
    (out_dir / "merkle_mth.json").write_text(json.dumps(gen_merkle_vectors(), indent=1) + "\n")
    (out_dir / "index.json").write_text(json.dumps(index, indent=1) + "\n")
    print(f"\nWrote {len(index['psbt_vectors'])} PSBT vectors + varint.json + merkle_mth.json to {out_dir}")


if __name__ == "__main__":
    main()
