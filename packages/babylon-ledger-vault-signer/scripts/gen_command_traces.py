#!/usr/bin/env python3
"""Command-level golden traces for the SIGN_PSBT client-command interpreter (#2219, S4).

Oracle: ledger-bitcoin==0.4.0 (client_command.py) — the exact package the vault
firmware's device tests drive SIGN_PSBT through. Every response_hex below is the
literal return value of ClientCommandInterpreter.execute() on the recorded
request bytes; nothing is hand-computed.

For each selected signpsbt vector (one per flow), the interpreter is seeded
exactly as client.py sign_psbt seeds it (client.py:293-320):

    add_known_list([k.encode() for k in wallet.keys_info])   # _NoWalletPolicy
    add_known_preimage(wallet.serialize())
    add_known_preimage(wallet.descriptor_template.encode())
    add_known_mapping(global_map)
    add_known_mapping(each input map); add_known_mapping(each output map)
    add_known_list(input_commitments); add_known_list(output_commitments)

then every client command is exercised with realistic device-request bytes
(layouts per todo/ledger/2219-wire-spec.md §4, citing the base-app encoders):

    GET_MERKLE_LEAF_PROOF 0x41: root(32) | varint(tree_size) | varint(leaf_index)
    GET_MERKLE_LEAF_INDEX 0x42: root(32) | leaf_hash(32)
    GET_PREIMAGE          0x40: 0x00 | hash(32)
    GET_MORE_ELEMENTS     0xA0: (no payload)
    YIELD                 0x10: payload (shape per wire-spec §5; synthetic bytes)

Traces in each file are ORDERED: the interpreter's element queue carries state
from a spilling GET_PREIMAGE / GET_MERKLE_LEAF_PROOF into the following
GET_MORE_ELEMENTS, so a replay test must execute them sequentially against one
interpreter instance.

Usage:
  <venv>/bin/python gen_command_traces.py [<vectors_dir> [<out_dir>]]
  defaults: vectors_dir = this script's directory, out_dir = <vectors_dir>/command-traces
"""

import json
import sys
from pathlib import Path

from ledger_bitcoin.client_command import ClientCommandCode, ClientCommandInterpreter
from ledger_bitcoin.common import sha256, write_varint
from ledger_bitcoin.merkle import MerkleTree, element_hash
from ledger_bitcoin.wallet import WalletPolicy

from importlib.metadata import version as installed_version

# Provenance guard: goldens are only valid against the pinned oracle (requirements.txt).
ORACLE_VERSION = "0.4.0"
_installed = installed_version("ledger-bitcoin")
if _installed != ORACLE_VERSION:  # not assert: stripped under python -O
    raise RuntimeError(
        f"oracle must be ledger-bitcoin=={ORACLE_VERSION}, got {_installed}"
    )

MAX_CONTINUE_DATA = 255  # Lc of the F8 01 00 00 CONTINUE APDU is one byte

# One vector per flow. pegin uses the generated 1-in/3-out variant: the captured
# deposit-flow__pegin__0 is a stale pre-v22 1-in/2-out capture (vendor README).
# claimer_payout uses the captured 2-in/3-out batch entry because its 347-byte
# value naturally spills GET_PREIMAGE into GET_MORE_ELEMENTS.
SELECTED = [
    ("pre_pegin", "deposit-flow__pre_pegin__0"),
    ("pegin", "generated__deposit-flow__pegin__0"),
    ("claimer_payout", "deposit-flow__claimer_payout__2"),
    ("depositor_graph", "generated__deposit-flow__depositor_graph__1"),
]


# Same as scripts/gen_vectors.py — wallet_id = 32 zero bytes routes the firmware
# into the vault validator; the policy material is registered (mirroring
# client.py) but never queried in no-policy mode, so no trace touches it.
class NoWalletPolicy(WalletPolicy):
    def __init__(self):
        super().__init__(
            "",
            "tr(@0/**)",
            ["tpubD6NzVbkrYhZ4XgiXtGrdW5XDAPFCL9h7we1vwNCpn8tGbBcgfVYjXyhWo4E1xkh56hjod1RhGjxbaTLV3X4FyWuejifB9jusQ46QzG87VKp"],
        )

    @property
    def id(self) -> bytes:
        return b"\x00" * 32


def load_maps(vec: dict):
    def to_map(pairs):
        m = {bytes.fromhex(k): bytes.fromhex(v) for k, v in pairs}
        assert len(m) == len(pairs), "duplicate key in vector map"
        return m

    g = to_map(vec["global_map"])
    ins = [to_map(p) for p in vec["input_maps"]]
    outs = [to_map(p) for p in vec["output_maps"]]
    return g, ins, outs


def seed_interpreter(g, ins, outs):
    """Mirror client.py sign_psbt seeding (client.py:293-320), _NoWalletPolicy case."""
    wallet = NoWalletPolicy()
    interp = ClientCommandInterpreter()
    interp.add_known_list([k.encode() for k in wallet.keys_info])
    interp.add_known_preimage(wallet.serialize())
    interp.add_known_preimage(wallet.descriptor_template.encode())
    interp.add_known_mapping(g)
    for m in ins:
        interp.add_known_mapping(m)
    for m in outs:
        interp.add_known_mapping(m)
    input_commitments = [commitment(m) for m in ins]
    output_commitments = [commitment(m) for m in outs]
    interp.add_known_list(input_commitments)
    interp.add_known_list(output_commitments)
    return interp, input_commitments, output_commitments


def commitment(m):
    items = sorted(m.items())
    keys_root = MerkleTree([element_hash(k) for k, _ in items]).root
    values_root = MerkleTree([element_hash(v) for _, v in items]).root
    return write_varint(len(m)) + keys_root + values_root


class TraceRun:
    """Executes requests against one interpreter, recording literal in/out bytes."""

    def __init__(self, interp: ClientCommandInterpreter):
        self.interp = interp
        self.queue = interp.commands[ClientCommandCode.GET_MORE_ELEMENTS].queue
        self.traces = []

    def run(self, command_name: str, request: bytes, notes: str) -> bytes:
        response = self.interp.execute(request)
        assert len(response) <= MAX_CONTINUE_DATA, "response exceeds CONTINUE Lc cap"
        self.traces.append(
            {
                "command_name": command_name,
                "request_hex": request.hex(),
                "response_hex": response.hex(),
                "notes": notes,
            }
        )
        return response

    def drain_queue(self, context: str):
        """GET_MORE_ELEMENTS until the shared element queue is empty."""
        rounds = 0
        while len(self.queue) > 0:
            n_before = len(self.queue)
            el_len = len(self.queue[0])
            resp = self.run(
                "GET_MORE_ELEMENTS",
                bytes([ClientCommandCode.GET_MORE_ELEMENTS]),
                f"continuation round {rounds} for {context}: {n_before} queued "
                f"{el_len}-byte element(s) pending; response = n(1) | el_len(1) | elements",
            )
            assert resp[1] == el_len
            rounds += 1
        return rounds


def build_tree_registry(vec, g, ins, outs, input_commitments, output_commitments):
    """Logical name -> (root, ordered leaf elements). Cross-checked vs the vector JSON."""
    reg = []

    def add(name, elements, expect_root_hex=None):
        leaves = [element_hash(el) for el in elements]
        root = MerkleTree(leaves).root
        if expect_root_hex is not None:
            assert root.hex() == expect_root_hex, f"{name}: root mismatch vs signpsbt vector"
        reg.append((name, root, elements))

    gc = vec["global_commitment"]
    add("global_keys", [k for k, _ in sorted(g.items())], gc["keys_root"])
    add("global_values", [v for _, v in sorted(g.items())], gc["values_root"])
    for i, m in enumerate(ins):
        c = vec["input_commitments"][i]
        add(f"input{i}_keys", [k for k, _ in sorted(m.items())], c["keys_root"])
        add(f"input{i}_values", [v for _, v in sorted(m.items())], c["values_root"])
    for i, m in enumerate(outs):
        c = vec["output_commitments"][i]
        add(f"output{i}_keys", [k for k, _ in sorted(m.items())], c["keys_root"])
        add(f"output{i}_values", [v for _, v in sorted(m.items())], c["values_root"])
    add("input_commitments", input_commitments)
    add("output_commitments", output_commitments)
    assert MerkleTree([element_hash(c) for c in input_commitments]).root.hex() == vec["inputs_maps_root"]
    assert MerkleTree([element_hash(c) for c in output_commitments]).root.hex() == vec["outputs_maps_root"]
    return reg


def unique_trees(reg):
    """Dedupe by root (identical key sets across output maps share one tree)."""
    seen = {}
    order = []
    for name, root, elements in reg:
        if root in seen:
            seen[root]["aliases"].append(name)
            continue
        entry = {"name": name, "aliases": [], "root": root, "elements": elements}
        seen[root] = entry
        order.append(entry)
    return order


def leaf_proof_request(root: bytes, tree_size: int, leaf_index: int) -> bytes:
    # layout: base get_merkle_leaf_hash.c:26-39 (wire-spec §4)
    return bytes([ClientCommandCode.GET_MERKLE_LEAF_PROOF]) + root + write_varint(tree_size) + write_varint(leaf_index)


def leaf_index_request(root: bytes, leaf_hash: bytes) -> bytes:
    # layout: base get_merkle_leaf_index.c:15-22 (wire-spec §4)
    return bytes([ClientCommandCode.GET_MERKLE_LEAF_INDEX]) + root + leaf_hash


def preimage_request(image_hash: bytes) -> bytes:
    # layout: base get_preimage.c:16-21 — first byte is a hash-type, always 0
    return bytes([ClientCommandCode.GET_PREIMAGE, 0x00]) + image_hash


def trace_leaf_proofs(runner: TraceRun, tree):
    n = len(tree["elements"])
    label = tree["name"] + (f" (also {', '.join(tree['aliases'])})" if tree["aliases"] else "")
    for idx in sorted({0, (n - 1) // 2, n - 1}):
        resp = runner.run(
            "GET_MERKLE_LEAF_PROOF",
            leaf_proof_request(tree["root"], n, idx),
            f"{label}: leaf {idx} of {n}; response = leaf_hash(32) | proof_len(1) | "
            f"n_in_msg(1) | hashes"
            + (" (empty proof for a single-leaf tree)" if n == 1 else ""),
        )
        assert resp[:32] == element_hash(tree["elements"][idx])
        assert len(runner.queue) == 0, "unexpected proof spill in PSBT-sized tree"


def trace_leaf_index(runner: TraceRun, tree, absent_element: bytes):
    n = len(tree["elements"])
    label = tree["name"]
    for idx in (0, n - 1) if n > 1 else (0,):
        el = tree["elements"][idx]
        resp = runner.run(
            "GET_MERKLE_LEAF_INDEX",
            leaf_index_request(tree["root"], element_hash(el)),
            f"{label}: present leaf_hash = sha256(0x00 | element) of element {idx} "
            f"({el.hex()}); response = found(1) | varint(index)",
        )
        assert resp == b"\x01" + write_varint(idx)
    absent_leaf = element_hash(absent_element)
    assert absent_leaf not in [element_hash(e) for e in tree["elements"]]
    resp = runner.run(
        "GET_MERKLE_LEAF_INDEX",
        leaf_index_request(tree["root"], absent_leaf),
        f"{label}: ABSENT leaf (hash of 0x00 | {absent_element.hex()}, not in tree); "
        f"response = found=0 | varint(0)",
    )
    assert resp == b"\x00\x00"


def absent_map_key(m):
    """Smallest single-byte PSBT keytype not present in the map — a realistic miss."""
    for b in range(0x100):
        if bytes([b]) not in m:
            return bytes([b])
    raise AssertionError("map contains every single-byte key")


def trace_preimages(runner: TraceRun, g, ins, outs, input_commitments, output_commitments):
    # (a) shortest global key, (b) its value — both stored 0x00-prefixed by add_known_mapping
    key = sorted(g.keys(), key=lambda k: (len(k), k))[0]
    for el, what in ((key, f"global key {key.hex()}"), (g[key], f"value of global key {key.hex()}")):
        preimage = b"\x00" + el
        resp = runner.run(
            "GET_PREIMAGE",
            preimage_request(sha256(preimage)),
            f"{what}: request hash = sha256(0x00 | element) (the Merkle leaf hash); "
            f"response = varint(len) | chunk_len(1) | chunk — preimage includes the 0x00 prefix",
        )
        assert resp.endswith(preimage)

    # (c) longest value in the PSBT — spills into GET_MORE_ELEMENTS when > 253 B
    best = None
    for name, m in [("global", g)] + [(f"input{i}", m) for i, m in enumerate(ins)] + [
        (f"output{i}", m) for i, m in enumerate(outs)
    ]:
        for k, v in m.items():
            if best is None or len(v) > len(best[2]):
                best = (name, k, v)
    map_name, k, v = best
    preimage = b"\x00" + v
    varint_len = len(write_varint(len(preimage)))
    first_chunk = min(MAX_CONTINUE_DATA - varint_len - 1, len(preimage))
    spills = first_chunk < len(preimage)
    resp = runner.run(
        "GET_PREIMAGE",
        preimage_request(sha256(preimage)),
        f"longest PSBT value: {map_name} map, key {k.hex()}, {len(v)} B; preimage "
        f"{len(preimage)} B -> first chunk {first_chunk} B"
        + (
            f", {len(preimage) - first_chunk} B queued as 1-byte elements for GET_MORE_ELEMENTS"
            if spills
            else " (fits in one response, no continuation)"
        ),
    )
    assert resp[varint_len] == first_chunk
    if spills:
        assert len(runner.queue) == len(preimage) - first_chunk
        runner.drain_queue(f"GET_PREIMAGE of {map_name} value (key {k.hex()})")

    # (d)/(e) merkleized-map commitment elements of the inputs/outputs vectors
    for el, what in (
        (input_commitments[0], "input_commitments[0]"),
        (output_commitments[-1], f"output_commitments[{len(output_commitments) - 1}]"),
    ):
        preimage = b"\x00" + el
        resp = runner.run(
            "GET_PREIMAGE",
            preimage_request(sha256(preimage)),
            f"{what} = varint(n) | keys_root | values_root ({len(el)} B); the device pulls "
            f"this before walking a per-map tree (get_merkleized_map.c); 0x00-prefixed like "
            f"every add_known_list element",
        )
        assert resp.endswith(preimage)


def trace_yield(runner: TraceRun, vec_id: str, flow: str):
    # Shape per wire-spec §5 (sign_input.c:47-87): varint(input_index) | len=0x40 |
    # x-only pubkey(32) | tapleaf_hash(32) | 64-byte schnorr sig. Bytes are
    # deterministic placeholders — only a device produces real ones; the oracle
    # behavior under test is the empty response + yielded capture.
    tag = f"2219-s4-yield::{vec_id}".encode()
    payload = (
        write_varint(0)
        + bytes([0x40])
        + sha256(tag + b"/xonly-pubkey")
        + sha256(tag + b"/tapleaf-hash")
        + sha256(tag + b"/sig-r")
        + sha256(tag + b"/sig-s")
    )
    request = bytes([ClientCommandCode.YIELD]) + payload
    n_before = len(runner.interp.yielded)
    resp = runner.run(
        "YIELD",
        request,
        f"{flow} signature yield, SYNTHETIC payload (shape per wire-spec §5: varint(0) | "
        f"0x40 | pubkey(32) | tapleaf(32) | sig(64); bytes are sha256-derived placeholders, "
        f"not a real device signature); oracle response is empty and interpreter stores "
        f"request[1:] in .yielded",
    )
    assert resp == b""
    assert runner.interp.yielded[n_before:] == [payload]


def vector_trace_file(flow: str, vec_id: str, vec: dict):
    g, ins, outs = load_maps(vec)
    interp, input_commitments, output_commitments = seed_interpreter(g, ins, outs)
    reg = build_tree_registry(vec, g, ins, outs, input_commitments, output_commitments)
    trees = unique_trees(reg)
    for entry in trees:
        assert entry["root"] in interp.known_trees, f"{entry['name']} not seeded"

    runner = TraceRun(interp)
    for tree in trees:
        trace_leaf_proofs(runner, tree)
    # index lookups on the trees the device actually queries by hash: keys trees
    # (get_merkleized_map_value pattern: H(0x00|key) against the map's keys root)
    named = {name: root for name, root, _elements in reg}
    for tree_name, source_map in [("global_keys", g), ("input0_keys", ins[0]), ("output0_keys", outs[0])]:
        root = named[tree_name]
        canonical = next(t for t in trees if t["root"] == root)
        trace_leaf_index(runner, {**canonical, "name": tree_name}, absent_map_key(source_map))
    trace_preimages(runner, g, ins, outs, input_commitments, output_commitments)
    trace_yield(runner, vec_id, flow)
    assert len(runner.queue) == 0, "trace file must not end with a non-empty queue"

    return {
        "schema": "s4-command-trace/v1",
        "flow": flow,
        "vector_id": vec_id,
        "source_vector": f"signpsbt/{vec_id}.json",
        "oracle": f"ledger-bitcoin=={ORACLE_VERSION} ClientCommandInterpreter (client_command.py); "
        "every response_hex is the literal execute() return value",
        "seeding": [
            "add_known_list(_NoWalletPolicy keys_info)  # mirrors client.py:294; never queried in no-policy mode",
            "add_known_preimage(_NoWalletPolicy serialize())  # client.py:295; never queried",
            "add_known_preimage(_NoWalletPolicy descriptor_template)  # client.py:298; never queried",
            "add_known_mapping(global_map)  # client.py:301",
            "add_known_mapping(each input map)  # client.py:306-307",
            "add_known_mapping(each output map)  # client.py:312-313",
            "add_known_list(input map commitments)  # client.py:319",
            "add_known_list(output map commitments)  # client.py:320",
            "maps and commitments come byte-for-byte from source_vector",
        ],
        "replay": "execute traces IN ORDER against one interpreter: the element queue "
        "carries state from a spilling command into the following GET_MORE_ELEMENTS",
        "trees": [
            {
                "name": t["name"],
                "aliases": t["aliases"],
                "root": t["root"].hex(),
                "n_leaves": len(t["elements"]),
            }
            for t in trees
        ],
        "traces": runner.traces,
    }


SYNTHETIC_N = 129  # left subtree 128 + right leaf -> leaf 0 proof depth 8 > 6-hash cap


def synthetic_deep_tree_file():
    """No PSBT tree is deep enough to spill GET_MERKLE_LEAF_PROOF (needs >= 65
    leaves for a 7-hash proof); synthesize a 129-leaf list and mark it."""
    elements = [i.to_bytes(4, "big") for i in range(SYNTHETIC_N)]
    interp = ClientCommandInterpreter()
    interp.add_known_list(elements)
    tree = MerkleTree([element_hash(el) for el in elements])
    root = tree.root
    assert root in interp.known_trees

    runner = TraceRun(interp)
    resp = runner.run(
        "GET_MERKLE_LEAF_PROOF",
        leaf_proof_request(root, SYNTHETIC_N, 0),
        f"SYNTHETIC {SYNTHETIC_N}-leaf tree, leaf 0: proof depth 8 -> 6 hashes in-message "
        "(floor((255-32-1-1)/32)), 2 spill to the queue as 32-byte elements",
    )
    assert resp[32] == 8 and resp[33] == 6 and len(runner.queue) == 2
    rounds = runner.drain_queue("deep-tree leaf-0 proof")
    assert rounds == 1
    resp = runner.run(
        "GET_MERKLE_LEAF_PROOF",
        leaf_proof_request(root, SYNTHETIC_N, SYNTHETIC_N - 1),
        f"SYNTHETIC tree, last leaf ({SYNTHETIC_N - 1}): right child of the root in the "
        f"left-complete shape -> 1-hash proof, no continuation",
    )
    assert resp[32] == 1 and len(runner.queue) == 0
    runner.run(
        "GET_MERKLE_LEAF_INDEX",
        leaf_index_request(root, element_hash(elements[64])),
        "SYNTHETIC tree: present leaf 64; response = 01 | varint(64)",
    )
    absent = (SYNTHETIC_N).to_bytes(4, "big")
    runner.run(
        "GET_MERKLE_LEAF_INDEX",
        leaf_index_request(root, element_hash(absent)),
        f"SYNTHETIC tree: ABSENT element {absent.hex()}; response = 00 | varint(0)",
    )
    runner.run(
        "GET_PREIMAGE",
        preimage_request(element_hash(elements[5])),
        "SYNTHETIC tree: preimage of element 5 — response carries the 0x00-prefixed "
        "5-byte preimage (add_known_list convention)",
    )
    assert len(runner.queue) == 0

    return {
        "schema": "s4-command-trace/v1",
        "flow": "synthetic",
        "synthetic": True,
        "vector_id": "synthetic__deep_tree",
        "source_vector": None,
        "oracle": f"ledger-bitcoin=={ORACLE_VERSION} ClientCommandInterpreter (client_command.py); "
        "every response_hex is the literal execute() return value",
        "seeding": [
            f"add_known_list(elements), elements[i] = uint32 BE of i, i = 0..{SYNTHETIC_N - 1}"
        ],
        "elements_rule": f"element i = i.to_bytes(4, 'big'), {SYNTHETIC_N} elements",
        "elements_hex": [el.hex() for el in elements],
        "root": root.hex(),
        "replay": "execute traces IN ORDER against one interpreter (queue state)",
        "traces": runner.traces,
    }


def main():
    script_dir = Path(__file__).resolve().parent
    vectors_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else script_dir
    out_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else vectors_dir / "command-traces"
    out_dir.mkdir(parents=True, exist_ok=True)

    index = {
        "schema": "s4-command-trace-index/v1",
        "oracle": f"ledger-bitcoin=={ORACLE_VERSION}",
        "generator": "gen_command_traces.py",
        "source_vectors_dir": "signpsbt/",
        "files": [],
    }
    for flow, vec_id in SELECTED:
        vec = json.loads((vectors_dir / "signpsbt" / f"{vec_id}.json").read_text())
        doc = vector_trace_file(flow, vec_id, vec)
        out = out_dir / f"{vec_id}.json"
        out.write_text(json.dumps(doc, indent=1) + "\n")
        counts = {}
        for t in doc["traces"]:
            counts[t["command_name"]] = counts.get(t["command_name"], 0) + 1
        index["files"].append(
            {"file": out.name, "flow": flow, "n_traces": len(doc["traces"]), "per_command": counts}
        )
        print(f"  OK {vec_id}: {len(doc['traces'])} traces {counts}")

    doc = synthetic_deep_tree_file()
    out = out_dir / "synthetic__deep_tree.json"
    out.write_text(json.dumps(doc, indent=1) + "\n")
    counts = {}
    for t in doc["traces"]:
        counts[t["command_name"]] = counts.get(t["command_name"], 0) + 1
    index["files"].append(
        {"file": out.name, "flow": "synthetic", "n_traces": len(doc["traces"]), "per_command": counts}
    )
    print(f"  OK synthetic__deep_tree: {len(doc['traces'])} traces {counts}")

    (out_dir / "index.json").write_text(json.dumps(index, indent=1) + "\n")
    print(f"Wrote {len(index['files'])} trace files + index.json to {out_dir}")


if __name__ == "__main__":
    main()
