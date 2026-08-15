/**
 * Vendored from the Ledger Bitcoin JS client (Apache-2.0).
 *
 * Upstream:        https://github.com/LedgerHQ/app-bitcoin (formerly app-bitcoin-new)
 * File:            bitcoin_client_js/src/lib/clientCommands.ts
 * Version:         ledger-bitcoin@0.3.0 (npm gitHead 0a9e9e141f3340d29e7c6181177d4e5e9483a9f7)
 * Upstream sha256: 294b00cafafaa0875425d8e915a1b4ea1438d958a36217bddcd2142241f8c1ba
 * Vendored:        2026-08-14
 * License:         Apache-2.0 — see ./LICENSE (verbatim upstream copy)
 * Modifications:   explicit `import { Buffer } from "buffer"` (no implicit Node
 *                  global — this package ships to the browser); named the three
 *                  chunking constants (`MAX_CLIENT_RESPONSE_BYTES`,
 *                  `GET_MORE_ELEMENTS_HEADER_BYTES`, `SHA256_LEN`) that were
 *                  inline 255/253/32 literals; LOCAL ADDITION: optional
 *                  `onYield(payload)` validator on `YieldCommand` and the
 *                  interpreter constructor — the vault SIGN_PSBT seam; it runs
 *                  BEFORE the payload is recorded, so a throw aborts the
 *                  ceremony without the yield ever looking collected (upstream
 *                  collects blindly; the payload push itself stays raw);
 *                  snake_case locals renamed to camelCase (incl. the upstream
 *                  `leef_hash` typo); index-safe hash reads via `subarray`
 *                  copies instead of unguarded byte loops
 *                  (behaviour-preserving); one `as ClientCommandCode` narrowing
 *                  in `execute` (length-checked); `==` → `===`, `Error` →
 *                  `new Error`; formatting.
 */

import { crypto } from "bitcoinjs-lib";
import { Buffer } from "buffer";

import { BufferReader } from "./buffertools";
import { hashLeaf, Merkle } from "./merkle";
import { MerkleMap } from "./merkleMap";
import { WalletPolicy } from "./policy";
import { createVarint, sanitizeBigintToNumber } from "./varint";

/**
 * Every client-command response rides one CONTINUE APDU whose Lc is a single
 * byte — 255 bytes max (base app dispatcher; device-side parsers
 * `get_preimage.c` / `get_merkle_leaf_hash.c` chunk against the same cap).
 */
const MAX_CLIENT_RESPONSE_BYTES = 255;

/**
 * A GET_MORE_ELEMENTS response spends 2 bytes on its own header,
 * `n_elements(1) ‖ el_len(1)` (parsed at base app `get_preimage.c:85-101` /
 * `get_merkle_leaf_hash.c:104-119`), leaving 253 for the elements.
 */
const GET_MORE_ELEMENTS_HEADER_BYTES = 2;

const SHA256_LEN = 32;

enum ClientCommandCode {
  YIELD = 0x10,
  GET_PREIMAGE = 0x40,
  GET_MERKLE_LEAF_PROOF = 0x41,
  GET_MERKLE_LEAF_INDEX = 0x42,
  GET_MORE_ELEMENTS = 0xa0,
}

abstract class ClientCommand {
  abstract code: ClientCommandCode;
  abstract execute(request: Buffer): Buffer;
}

export class YieldCommand extends ClientCommand {
  private results: Buffer[];

  readonly code = ClientCommandCode.YIELD;

  constructor(
    results: Buffer[],
    private readonly progressCallback?: () => void,
    private readonly onYield?: (payload: Buffer) => void,
  ) {
    super();
    this.results = results;
  }

  execute(request: Buffer): Buffer {
    const payload = Buffer.from(request.subarray(1));
    if (this.onYield) {
      // Local addition (vault seam): a throw here propagates out of
      // interpreter.execute() before the payload is recorded. The validator
      // gets its own copy so a mutating callback cannot corrupt the record.
      this.onYield(Buffer.from(payload));
    }
    this.results.push(payload);
    if (this.progressCallback) {
      this.progressCallback();
    }
    return Buffer.from("");
  }
}

export class GetPreimageCommand extends ClientCommand {
  private readonly knownPreimages: ReadonlyMap<string, Buffer>;
  private queue: Buffer[];

  readonly code = ClientCommandCode.GET_PREIMAGE;

  constructor(knownPreimages: ReadonlyMap<string, Buffer>, queue: Buffer[]) {
    super();
    this.knownPreimages = knownPreimages;
    this.queue = queue;
  }

  execute(request: Buffer): Buffer {
    const req = Buffer.from(request.subarray(1));

    // we expect no more data to read
    if (req.length !== 1 + SHA256_LEN) {
      throw new Error("Invalid request, unexpected trailing data");
    }

    if (req[0] !== 0) {
      throw new Error("Unsupported request, the first byte should be 0");
    }

    // read the hash
    const hash = Buffer.from(req.subarray(1, 1 + SHA256_LEN));
    const reqHashHex = hash.toString("hex");

    const knownPreimage = this.knownPreimages.get(reqHashHex);
    if (knownPreimage !== undefined) {
      const preimageLenVarint = createVarint(knownPreimage.length);

      // We can send at most 255 - len(preimage_len_out) - 1 bytes in a single message;
      // the rest will be stored in the queue for GET_MORE_ELEMENTS
      const maxPayloadSize = MAX_CLIENT_RESPONSE_BYTES - preimageLenVarint.length - 1;

      const payloadSize = Math.min(maxPayloadSize, knownPreimage.length);

      if (payloadSize < knownPreimage.length) {
        for (let i = payloadSize; i < knownPreimage.length; i++) {
          this.queue.push(Buffer.from(knownPreimage.subarray(i, i + 1)));
        }
      }

      return Buffer.concat([
        preimageLenVarint,
        Buffer.from([payloadSize]),
        Buffer.from(knownPreimage.subarray(0, payloadSize)),
      ]);
    }

    throw new Error(`Requested unknown preimage for: ${reqHashHex}`);
  }
}

export class GetMerkleLeafProofCommand extends ClientCommand {
  private readonly knownTrees: ReadonlyMap<string, Merkle>;
  private queue: Buffer[];

  readonly code = ClientCommandCode.GET_MERKLE_LEAF_PROOF;

  constructor(knownTrees: ReadonlyMap<string, Merkle>, queue: Buffer[]) {
    super();
    this.knownTrees = knownTrees;
    this.queue = queue;
  }

  execute(request: Buffer): Buffer {
    const req = Buffer.from(request.subarray(1));

    if (req.length < SHA256_LEN + 1 + 1) {
      throw new Error("Invalid request, expected at least 34 bytes");
    }

    const reqBuf = new BufferReader(req);
    const hash = reqBuf.readSlice(SHA256_LEN);
    const hashHex = hash.toString("hex");

    let treeSize: number;
    let leafIndex: number;
    try {
      treeSize = sanitizeBigintToNumber(reqBuf.readVarInt());
      leafIndex = sanitizeBigintToNumber(reqBuf.readVarInt());
    } catch {
      throw new Error("Invalid request, couldn't parse tree_size or leaf_index");
    }

    const mt = this.knownTrees.get(hashHex);
    if (!mt) {
      throw new Error(`Requested Merkle leaf proof for unknown tree: ${hashHex}`);
    }

    if (leafIndex >= treeSize || mt.size() !== treeSize) {
      throw new Error("Invalid index or tree size.");
    }

    if (this.queue.length !== 0) {
      throw new Error("This command should not execute when the queue is not empty.");
    }

    const proof = mt.getProof(leafIndex);

    const nResponseElements = Math.min(
      Math.floor((MAX_CLIENT_RESPONSE_BYTES - SHA256_LEN - 1 - 1) / SHA256_LEN),
      proof.length,
    );
    const nLeftoverElements = proof.length - nResponseElements;

    // Add to the queue any proof elements that do not fit the response
    if (nLeftoverElements > 0) {
      this.queue.push(...proof.slice(-nLeftoverElements));
    }

    return Buffer.concat([
      mt.getLeafHash(leafIndex),
      Buffer.from([proof.length]),
      Buffer.from([nResponseElements]),
      ...proof.slice(0, nResponseElements),
    ]);
  }
}

export class GetMerkleLeafIndexCommand extends ClientCommand {
  private readonly knownTrees: ReadonlyMap<string, Merkle>;

  readonly code = ClientCommandCode.GET_MERKLE_LEAF_INDEX;

  constructor(knownTrees: ReadonlyMap<string, Merkle>) {
    super();
    this.knownTrees = knownTrees;
  }

  execute(request: Buffer): Buffer {
    const req = Buffer.from(request.subarray(1));

    if (req.length !== SHA256_LEN + SHA256_LEN) {
      throw new Error("Invalid request, unexpected trailing data");
    }

    // read the root hash
    const rootHash = Buffer.from(req.subarray(0, SHA256_LEN));
    const rootHashHex = rootHash.toString("hex");

    // read the leaf hash
    const leafHash = Buffer.from(req.subarray(SHA256_LEN, SHA256_LEN + SHA256_LEN));
    const leafHashHex = leafHash.toString("hex");

    const mt = this.knownTrees.get(rootHashHex);
    if (!mt) {
      throw new Error(`Requested Merkle leaf index for unknown root: ${rootHashHex}`);
    }

    let leafIndex = 0;
    let found = 0;
    for (let i = 0; i < mt.size(); i++) {
      if (mt.getLeafHash(i).toString("hex") === leafHashHex) {
        found = 1;
        leafIndex = i;
        break;
      }
    }
    return Buffer.concat([Buffer.from([found]), createVarint(leafIndex)]);
  }
}

export class GetMoreElementsCommand extends ClientCommand {
  queue: Buffer[];

  readonly code = ClientCommandCode.GET_MORE_ELEMENTS;

  constructor(queue: Buffer[]) {
    super();
    this.queue = queue;
  }

  execute(request: Buffer): Buffer {
    if (request.length !== 1) {
      throw new Error("Invalid request, unexpected trailing data");
    }

    const firstElement = this.queue[0];
    if (firstElement === undefined) {
      throw new Error("No elements to get");
    }

    // all elements should have the same length
    const elementLen = firstElement.length;
    if (this.queue.some((el) => el.length !== elementLen)) {
      throw new Error("The queue contains elements with different byte length, which is not expected");
    }

    const maxElements = Math.floor((MAX_CLIENT_RESPONSE_BYTES - GET_MORE_ELEMENTS_HEADER_BYTES) / elementLen);
    const nReturnedElements = Math.min(maxElements, this.queue.length);

    const returnedElements = this.queue.splice(0, nReturnedElements);

    return Buffer.concat([Buffer.from([nReturnedElements]), Buffer.from([elementLen]), ...returnedElements]);
  }
}

/**
 * This class will dispatch a client command coming from the hardware device to
 * the appropriate client command implementation. Those client commands
 * typically requests data from a merkle tree or merkelized maps.
 *
 * A ClientCommandInterpreter is prepared by adding the merkle trees and
 * merkelized maps it should be able to serve to the hardware device. This class
 * doesn't know anything about the semantics of the data it holds, it just
 * serves merkle data. It doesn't even know in what context it is being
 * executed, ie SignPsbt, getWalletAddress, etc.
 *
 * If the command yelds results to the client, as signPsbt does, the yielded
 * data will be accessible after the command completed by calling getYielded(),
 * which will return the yields in the same order as they came in.
 */
export class ClientCommandInterpreter {
  private readonly roots: Map<string, Merkle> = new Map();
  private readonly preimages: Map<string, Buffer> = new Map();

  private yielded: Buffer[] = [];

  private queue: Buffer[] = [];

  private readonly commands: Map<ClientCommandCode, ClientCommand> = new Map();

  constructor(progressCallback?: () => void, onYield?: (payload: Buffer) => void) {
    const commands = [
      new YieldCommand(this.yielded, progressCallback, onYield),
      new GetPreimageCommand(this.preimages, this.queue),
      new GetMerkleLeafIndexCommand(this.roots),
      new GetMerkleLeafProofCommand(this.roots, this.queue),
      new GetMoreElementsCommand(this.queue),
    ];

    for (const cmd of commands) {
      if (this.commands.has(cmd.code)) {
        throw new Error(`Multiple commands with code ${cmd.code}`);
      }
      this.commands.set(cmd.code, cmd);
    }
  }

  getYielded(): readonly Buffer[] {
    return this.yielded;
  }

  addKnownPreimage(preimage: Buffer): void {
    this.preimages.set(crypto.sha256(preimage).toString("hex"), preimage);
  }

  addKnownList(elements: readonly Buffer[]): void {
    for (const el of elements) {
      const preimage = Buffer.concat([Buffer.from([0]), el]);
      this.addKnownPreimage(preimage);
    }
    const mt = new Merkle(elements.map((el) => hashLeaf(el)));
    this.roots.set(mt.getRoot().toString("hex"), mt);
  }

  addKnownMapping(mm: MerkleMap): void {
    this.addKnownList(mm.keys);
    this.addKnownList(mm.values);
  }

  addKnownWalletPolicy(wp: WalletPolicy): void {
    this.addKnownPreimage(wp.serialize());
    this.addKnownList(wp.keys.map((k) => Buffer.from(k, "ascii")));
    this.addKnownPreimage(Buffer.from(wp.descriptorTemplate));
  }

  execute(request: Buffer): Buffer {
    if (request.length === 0) {
      throw new Error("Unexpected empty command");
    }

    const cmdCode = request[0] as ClientCommandCode;
    const cmd = this.commands.get(cmdCode);
    if (!cmd) {
      throw new Error(`Unexpected command code ${cmdCode}`);
    }

    return cmd.execute(request);
  }
}
