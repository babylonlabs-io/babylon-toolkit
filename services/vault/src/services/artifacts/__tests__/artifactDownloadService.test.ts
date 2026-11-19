import {
  derivePeginVaultId,
  isAuthRejectedError,
  JsonRpcClient,
  VpResponseValidationError,
  VpTokenRegistry,
  vpTokenRegistry,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { fingerprintReturnedGraph } from "@babylonlabs-io/ts-sdk/tbv/core/services";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The reader's claim.json limit sits a few hundred bytes above what a
 * cap-sized manifest can produce, so the guard is driven by a pinned length.
 */
const claimLengthOverride = vi.hoisted(() => ({
  value: null as number | null,
}));
vi.mock("../claimFile", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../claimFile")>();
  return {
    ...actual,
    claimFileByteLength: (
      ...args: Parameters<typeof actual.claimFileByteLength>
    ) => claimLengthOverride.value ?? actual.claimFileByteLength(...args),
  };
});

vi.mock("@/utils/rpc", () => ({
  getVpArtifactsProxyUrl: (address: string) =>
    `https://proxy.example.com/artifacts/${address}`,
}));

import { PresignGraphMismatchError } from "../artifactBinding";
import {
  downloadRecoveryKit,
  fetchAndDownloadArtifacts,
} from "../artifactDownloadService";
import type { ArtifactSaveTarget } from "../artifactSaveTarget";
import { openArtifactSaveTarget } from "../artifactSaveTarget";
import { claimFileByteLength } from "../claimFile";
import {
  ArtifactDownloadCancelledError,
  ArtifactDownloadTooLargeError,
  ArtifactFileAccessError,
  ArtifactIdentityMismatchError,
} from "../errors";
import { tarEntryBytes } from "../tarWriter";

const PROVIDER_ADDRESS = "0x0000000000000000000000000000000000000000";
const PEGIN_TXID =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OTHER_TXID = "9".repeat(64);
const DEPOSITOR_PK =
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const OTHER_PROVIDER_ADDRESS = "0x1111111111111111111111111111111111111111";
const CHALLENGER_PUBKEY =
  "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
const CHALLENGER_PUBKEY_2 = "dd".repeat(32);
const DEPOSITOR_ETH = "0x" + "12".repeat(20);
const VAULT_ID = "0x" + derivePeginVaultId(PEGIN_TXID, DEPOSITOR_ETH);
const VERIFYING_KEY_HEX = "aabb";

const SESSION_BYTES = 32 * 1024;
const A = new Uint8Array(SESSION_BYTES).fill(1);
const B = new Uint8Array(SESSION_BYTES + 1).fill(2);
const CHUNK_BYTES = 1024;

const ARTIFACTS_BASE_URL = "https://proxy.example.com/artifacts/0xVP";
const DEPOSIT_URL = `${ARTIFACTS_BASE_URL}/${PEGIN_TXID}`;
const MANIFEST_URL = `${DEPOSIT_URL}/manifest`;
const sessionUrl = (pk: string) => `${DEPOSIT_URL}/sessions/${pk}`;

const tx = (previousOutput: string) => ({
  tx: {
    version: 2,
    lock_time: 0,
    input: [
      {
        previous_output: previousOutput,
        script_sig: "",
        sequence: 0xffffffff,
        witness: [],
      },
    ],
    output: [{ value: 1000, script_pubkey: "51" }],
  },
});

const challengerSubgraph = () => ({
  nopayout_tx: tx(`${"f".repeat(64)}:0`),
  output_label_hashes: ["c2".repeat(32)],
});

/**
 * Mirrors a real bundle's tx graph: claim and payout spend outputs of the
 * requested pegin, and the challenger set matches the supplied sessions.
 */
function txGraph(
  overrides: Record<string, unknown> = {},
  peginTxid = PEGIN_TXID,
): Record<string, unknown> {
  return {
    pegin_tx: tx(`${"d".repeat(64)}:0`),
    claim_tx: tx(`${peginTxid}:1`),
    assert_tx: tx(`${"e".repeat(64)}:0`),
    payout_tx: tx(`${peginTxid}:0`),
    challenger_subgraphs: { [CHALLENGER_PUBKEY]: challengerSubgraph() },
    depositor_pubkey: DEPOSITOR_PK,
    challenger_pubkeys: { local: [CHALLENGER_PUBKEY], universal: [] },
    ...overrides,
  };
}

function txGraphJson(
  overrides: Record<string, unknown> = {},
  peginTxid = PEGIN_TXID,
): string {
  return JSON.stringify(txGraph(overrides, peginTxid));
}

/** Two challengers, listed out of order on purpose. */
const TWO = {
  challenger_subgraphs: {
    [CHALLENGER_PUBKEY]: challengerSubgraph(),
    [CHALLENGER_PUBKEY_2]: challengerSubgraph(),
  },
  challenger_pubkeys: {
    local: [CHALLENGER_PUBKEY_2, CHALLENGER_PUBKEY],
    universal: [],
  },
};

/** What this device would have recorded at presign for each graph. */
const SIGNED_GRAPH_FINGERPRINT = fingerprintReturnedGraph(txGraph());
const FINGERPRINT_TWO = fingerprintReturnedGraph(txGraph(TWO));

const IDENTITY = {
  vaultId: VAULT_ID,
  peginTxid: PEGIN_TXID,
  depositorPk: DEPOSITOR_PK,
  depositorEthAddress: DEPOSITOR_ETH,
  providerAddress: PROVIDER_ADDRESS,
  signedGraphFingerprint: SIGNED_GRAPH_FINGERPRINT,
};
const IDENTITY_TWO = { ...IDENTITY, signedGraphFingerprint: FINGERPRINT_TWO };

const etagOf = (bytes: Uint8Array) => `"${bytesToHex(sha256(bytes))}"`;
const hexSha256 = (bytes: Uint8Array) => bytesToHex(sha256(bytes));

function jsonResponse(body: unknown, status = 200) {
  const text = JSON.stringify(body);
  return new Response(text, {
    status,
    headers: {
      "content-type": "application/json",
      "content-length": String(new TextEncoder().encode(text).byteLength),
    },
  });
}

function sessionResponse(bytes: Uint8Array<ArrayBuffer>, etag = etagOf(bytes)) {
  return new Response(bytes, {
    status: 200,
    headers: { etag, "content-length": String(bytes.byteLength) },
  });
}

/** A 200 response whose body breaks after `sent` bytes. */
function brokenSessionResponse(bytes: Uint8Array<ArrayBuffer>, sent: number) {
  let pulls = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulls++ === 0) controller.enqueue(bytes.slice(0, sent));
      else controller.error(new TypeError("network error"));
    },
  });
  return new Response(body, {
    status: 200,
    headers: {
      etag: etagOf(bytes),
      "content-length": String(bytes.byteLength),
    },
  });
}

/** A 200 response delivered in 1 KiB chunks, errored when `signal` aborts. */
function pacedSessionResponse(
  bytes: Uint8Array<ArrayBuffer>,
  signal: AbortSignal | null | undefined,
) {
  let offset = 0;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      signal?.addEventListener("abort", () => controller.error(signal.reason));
    },
    async pull(controller) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (signal?.aborted) return;
      if (offset >= bytes.byteLength) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + CHUNK_BYTES));
      offset += CHUNK_BYTES;
    },
  });
  return new Response(body, {
    status: 200,
    headers: {
      etag: etagOf(bytes),
      "content-length": String(bytes.byteLength),
    },
  });
}

type SessionHook = (pk: string, init: RequestInit) => Response | undefined;

/** An in-memory vault provider: answers the manifest and session URLs. */
function fakeVp(
  sessions: Record<string, Uint8Array<ArrayBuffer>>,
  graph = txGraphJson(),
  hooks: { onSession?: SessionHook; base?: string } = {},
) {
  const base = hooks.base ?? ARTIFACTS_BASE_URL;
  const depositUrl = `${base}/${PEGIN_TXID}`;
  const requests: string[] = [];
  const signals: AbortSignal[] = [];
  const fetchImpl = vi.fn(
    async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      requests.push(url);
      if (init.signal) signals.push(init.signal);
      init.signal?.throwIfAborted();
      if (url === `${depositUrl}/manifest`) {
        return jsonResponse({
          tx_graph_json: graph,
          verifying_key_hex: VERIFYING_KEY_HEX,
          babe_sessions: Object.fromEntries(
            Object.entries(sessions).map(([key, bytes]) => [
              key,
              {
                download_path: `/v1/depositor-artifacts/${PEGIN_TXID}/sessions/${key}`,
                byte_length: bytes.byteLength,
              },
            ]),
          ),
        });
      }
      const pk = url.slice(`${depositUrl}/sessions/`.length);
      const bytes = sessions[pk];
      if (!bytes) return new Response(null, { status: 404 });
      return hooks.onSession?.(pk, init) ?? sessionResponse(bytes);
    },
  );
  return { fetchImpl: fetchImpl as unknown as typeof fetch, requests, signals };
}

const source = (vp: ReturnType<typeof fakeVp>) => ({
  artifactsBaseUrl: ARTIFACTS_BASE_URL,
  getToken: async () => "t",
  fetchImpl: vp.fetchImpl,
});

/** Records everything the service does to its save target. */
function fakeSaveTarget(
  overrides: Partial<Pick<ArtifactSaveTarget, "method" | "maxBytes">> = {},
) {
  const written: Uint8Array[] = [];
  const write = vi.fn(async (chunk: Uint8Array<ArrayBuffer>) => {
    written.push(chunk);
  });
  const commit = vi.fn(async () => undefined);
  const discard = vi.fn(async () => undefined);
  const target: ArtifactSaveTarget = {
    method: "file-system-access",
    filename: "babylon-vault-aaaaaaaa.tar",
    maxBytes: Number.POSITIVE_INFINITY,
    open: vi.fn(async () => ({ write, commit, discard })),
    ...overrides,
  };
  const savedBytes = () =>
    new Uint8Array(written.flatMap((chunk) => Array.from(chunk)));
  const writtenBytes = () =>
    written.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  return { target, write, commit, discard, savedBytes, writtenBytes, written };
}

/**
 * Walks a ustar archive independently of the writer: name from bytes 0..100,
 * size from the octal field at 124, data padded to 512. Asserts the trailer.
 */
function parseTar(bytes: Uint8Array): { name: string; data: Uint8Array }[] {
  const entries: { name: string; data: Uint8Array }[] = [];
  let offset = 0;
  for (;;) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;
    const nameEnd = header.indexOf(0);
    const name = new TextDecoder().decode(
      header.subarray(0, nameEnd === -1 || nameEnd > 100 ? 100 : nameEnd),
    );
    const size = parseInt(
      new TextDecoder().decode(header.subarray(124, 135)),
      8,
    );
    const start = offset + 512;
    entries.push({ name, data: bytes.slice(start, start + size) });
    offset = start + Math.ceil(size / 512) * 512;
  }
  expect(bytes.byteLength - offset).toBe(1024);
  expect(bytes.subarray(offset).every((b) => b === 0)).toBe(true);
  return entries;
}

function expectedTotal(sessionSizes: number[], claimLength: number) {
  return (
    sessionSizes.reduce((sum, size) => sum + tarEntryBytes(size), 0) +
    tarEntryBytes(claimLength) +
    1024
  );
}

const claimLengthFor = (
  identity: typeof IDENTITY,
  graph: string,
  sizes: [string, number][],
) =>
  claimFileByteLength(
    identity,
    { txGraphJson: graph, verifyingKeyHex: VERIFYING_KEY_HEX },
    new Map(sizes),
  );

const TWO_TOTAL = expectedTotal(
  [A.byteLength, B.byteLength],
  claimLengthFor(IDENTITY_TWO, txGraphJson(TWO), [
    [CHALLENGER_PUBKEY, A.byteLength],
    [CHALLENGER_PUBKEY_2, B.byteLength],
  ]),
);
const ONE_TOTAL = expectedTotal(
  [A.byteLength],
  claimLengthFor(IDENTITY, txGraphJson(), [[CHALLENGER_PUBKEY, A.byteLength]]),
);

function seedArtifactToken(providerAddress: string): void {
  const pinnedServerPubkey = "ab".repeat(32) as unknown as Parameters<
    typeof vpTokenRegistry.getOrCreate
  >[0]["pinnedServerPubkey"];
  vpTokenRegistry.getOrCreate({
    client: new JsonRpcClient({
      baseUrl: "https://vp.test/rpc",
      timeout: 5000,
      retries: 0,
    }),
    peginTxid: PEGIN_TXID,
    authAnchorHex: "c".repeat(64),
    providerAddress,
    pinnedServerPubkey,
    grpcPinnedServerPubkey: pinnedServerPubkey,
    grpcKeyEpoch: 1n,
    expectedAudienceXOnlyPubkey: DEPOSITOR_PK,
  });
}

describe("downloadRecoveryKit", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes sessions in sorted order, then claim.json, then two zero blocks, and reports the hashes", async () => {
    const vp = fakeVp(
      { [CHALLENGER_PUBKEY_2]: B, [CHALLENGER_PUBKEY]: A },
      txGraphJson(TWO),
    );
    const { target, commit, savedBytes } = fakeSaveTarget();
    const progress: [number, number][] = [];

    const outcome = await downloadRecoveryKit(
      source(vp),
      IDENTITY_TWO,
      target,
      {
        onProgress: (r, t) => progress.push([r, t]),
      },
    );

    const bytes = savedBytes();
    const entries = parseTar(bytes);
    expect(entries.map((e) => e.name)).toEqual([
      `sessions/${CHALLENGER_PUBKEY}.cbor`,
      `sessions/${CHALLENGER_PUBKEY_2}.cbor`,
      "claim.json",
    ]);
    expect(entries[0]!.data).toEqual(A);
    expect(entries[1]!.data).toEqual(B);
    const claim = JSON.parse(new TextDecoder().decode(entries[2]!.data));
    expect(Object.keys(claim.sessions)).toEqual([
      CHALLENGER_PUBKEY,
      CHALLENGER_PUBKEY_2,
    ]);
    expect(claim.sessions[CHALLENGER_PUBKEY]).toEqual({
      byte_length: A.byteLength,
      sha256: hexSha256(A),
    });
    expect(claim.sessions[CHALLENGER_PUBKEY_2]).toEqual({
      byte_length: B.byteLength,
      sha256: hexSha256(B),
    });
    expect(claim.vault_id).toBe(VAULT_ID);
    expect(claim.pegin_txid).toBe(PEGIN_TXID);
    expect(claim.depositor_pk).toBe(DEPOSITOR_PK);
    expect(claim.signed_graph_fingerprint).toBe(FINGERPRINT_TWO);
    expect(claim.tx_graph_json).toBe(txGraphJson(TWO));
    expect(claim.verifying_key_hex).toBe(VERIFYING_KEY_HEX);
    expect(bytes.byteLength).toBe(TWO_TOTAL);
    expect(outcome).toEqual({
      filename: target.filename,
      byteLength: TWO_TOTAL,
      sha256: hexSha256(bytes),
      method: "file-system-access",
      sessions: {
        [CHALLENGER_PUBKEY]: { sha256: hexSha256(A), byteLength: A.byteLength },
        [CHALLENGER_PUBKEY_2]: {
          sha256: hexSha256(B),
          byteLength: B.byteLength,
        },
      },
      comparedWithPresignRecord: true,
    });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(progress[0]).toEqual([0, TWO_TOTAL]);
    expect(progress.at(-1)).toEqual([TWO_TOTAL, TWO_TOTAL]);
    expect(
      progress.every(
        ([r, t], i) =>
          t === TWO_TOTAL && r <= t && (i === 0 || r >= progress[i - 1]![0]),
      ),
    ).toBe(true);
    expect(vp.requests).toEqual([
      MANIFEST_URL,
      sessionUrl(CHALLENGER_PUBKEY),
      sessionUrl(CHALLENGER_PUBKEY_2),
    ]);
  });

  it("writes a one-session kit", async () => {
    const vp = fakeVp({ [CHALLENGER_PUBKEY]: A });
    const { target, savedBytes } = fakeSaveTarget();

    const outcome = await downloadRecoveryKit(source(vp), IDENTITY, target);

    const entries = parseTar(savedBytes());
    expect(entries.map((e) => e.name)).toEqual([
      `sessions/${CHALLENGER_PUBKEY}.cbor`,
      "claim.json",
    ]);
    expect(entries[0]!.data).toEqual(A);
    expect(outcome.byteLength).toBe(ONE_TOTAL);
    expect(savedBytes().byteLength).toBe(ONE_TOTAL);
    expect(Object.keys(outcome.sessions)).toEqual([CHALLENGER_PUBKEY]);
  });

  it("produces the pinned archive digest for the two-session fixture", async () => {
    const vp = fakeVp(
      { [CHALLENGER_PUBKEY_2]: B, [CHALLENGER_PUBKEY]: A },
      txGraphJson(TWO),
    );
    const { target } = fakeSaveTarget();

    const outcome = await downloadRecoveryKit(source(vp), IDENTITY_TWO, target);

    expect(outcome.sha256).toBe(
      "b41cb3157d1e85a2c6c35097a03450fe8f2776dff44fcaaf078b859a39890b4b",
    );
  });

  it("downloads a two-session kit with a caller signal on a browser without AbortSignal.any", async () => {
    const original = AbortSignal.any;
    // @ts-expect-error - deliberately emulating a browser that predates the API
    delete AbortSignal.any;
    try {
      const vp = fakeVp(
        { [CHALLENGER_PUBKEY_2]: B, [CHALLENGER_PUBKEY]: A },
        txGraphJson(TWO),
      );
      const { target, commit, savedBytes } = fakeSaveTarget();

      await downloadRecoveryKit(source(vp), IDENTITY_TWO, target, {
        signal: new AbortController().signal,
      });

      expect(parseTar(savedBytes()).map((e) => e.name)).toEqual([
        `sessions/${CHALLENGER_PUBKEY}.cbor`,
        `sessions/${CHALLENGER_PUBKEY_2}.cbor`,
        "claim.json",
      ]);
      expect(commit).toHaveBeenCalledTimes(1);
    } finally {
      AbortSignal.any = original;
    }
  });

  it("keeps progress monotonic when a session restarts with a full 200", async () => {
    let calls = 0;
    const vp = fakeVp({ [CHALLENGER_PUBKEY]: A }, txGraphJson(), {
      onSession: () =>
        calls++ === 0
          ? brokenSessionResponse(A, CHUNK_BYTES)
          : sessionResponse(A),
    });
    const { target, savedBytes } = fakeSaveTarget();
    const progress: number[] = [];

    await downloadRecoveryKit(source(vp), IDENTITY, target, {
      onProgress: (received) => progress.push(received),
    });

    expect(progress).toContain(CHUNK_BYTES);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
    expect(progress.at(-1)).toBe(ONE_TOTAL);
    expect(parseTar(savedBytes())[0]!.data).toEqual(A);
  });

  it("accepts an upper-case vault id and writes it lowercase", async () => {
    const vp = fakeVp({ [CHALLENGER_PUBKEY]: A });
    const { target, savedBytes } = fakeSaveTarget();

    await downloadRecoveryKit(
      source(vp),
      { ...IDENTITY, vaultId: "0x" + VAULT_ID.slice(2).toUpperCase() },
      target,
    );

    const claim = JSON.parse(
      new TextDecoder().decode(parseTar(savedBytes())[1]!.data),
    );
    expect(claim.vault_id).toBe(VAULT_ID);
  });

  it("refuses a vault id that does not derive from the pegin and depositor", async () => {
    const vp = fakeVp({ [CHALLENGER_PUBKEY]: A });
    const { target } = fakeSaveTarget();

    await expect(
      downloadRecoveryKit(
        source(vp),
        { ...IDENTITY, vaultId: "0x" + "00".repeat(32) },
        target,
      ),
    ).rejects.toBeInstanceOf(ArtifactIdentityMismatchError);
    expect(target.open).not.toHaveBeenCalled();
    // The comparison is pure; the manifest request would charge an attempt.
    expect(vp.requests).toEqual([]);
  });

  it("refuses a kit whose claim.json would exceed the reader's 64 MiB limit before any session request", async () => {
    claimLengthOverride.value = 64 * 1024 * 1024 + 1;
    try {
      const vp = fakeVp({ [CHALLENGER_PUBKEY]: A });
      const { target } = fakeSaveTarget();

      await expect(
        downloadRecoveryKit(source(vp), IDENTITY, target),
      ).rejects.toBeInstanceOf(VpResponseValidationError);
      expect(target.open).not.toHaveBeenCalled();
      expect(vp.requests).toEqual([MANIFEST_URL]);
    } finally {
      claimLengthOverride.value = null;
    }
  });

  it("refuses a graph for another deposit before any session request", async () => {
    const vp = fakeVp({ [CHALLENGER_PUBKEY]: A }, txGraphJson({}, OTHER_TXID));
    const { target } = fakeSaveTarget();

    await expect(
      downloadRecoveryKit(source(vp), IDENTITY, target),
    ).rejects.toBeInstanceOf(VpResponseValidationError);
    expect(target.open).not.toHaveBeenCalled();
    expect(vp.requests).toEqual([MANIFEST_URL]);
  });

  it("refuses a graph that does not match the presign fingerprint before any session request", async () => {
    const vp = fakeVp(
      { [CHALLENGER_PUBKEY]: A },
      txGraphJson({ assert_tx: tx(`${"a".repeat(64)}:0`) }),
    );
    const { target } = fakeSaveTarget();

    await expect(
      downloadRecoveryKit(source(vp), IDENTITY, target),
    ).rejects.toBeInstanceOf(PresignGraphMismatchError);
    expect(target.open).not.toHaveBeenCalled();
    expect(vp.requests).toEqual([MANIFEST_URL]);
  });

  it("saves a kit with no presign record, reporting it uncompared and writing the served graph's fingerprint", async () => {
    const vp = fakeVp({ [CHALLENGER_PUBKEY]: A });
    const { target, commit, savedBytes } = fakeSaveTarget();

    const outcome = await downloadRecoveryKit(
      source(vp),
      { ...IDENTITY, signedGraphFingerprint: null },
      target,
    );

    const claim = JSON.parse(
      new TextDecoder().decode(parseTar(savedBytes())[1]!.data),
    );
    expect(claim.signed_graph_fingerprint).toBe(
      fingerprintReturnedGraph(txGraph()),
    );
    expect(outcome.comparedWithPresignRecord).toBe(false);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("refuses a graph that cannot be fingerprinted when there is no presign record, before any session request", async () => {
    const vp = fakeVp(
      { [CHALLENGER_PUBKEY]: A },
      txGraphJson({ assert_tx: undefined }),
    );
    const { target } = fakeSaveTarget();

    await expect(
      downloadRecoveryKit(
        source(vp),
        { ...IDENTITY, signedGraphFingerprint: null },
        target,
      ),
    ).rejects.toBeInstanceOf(VpResponseValidationError);
    expect(target.open).not.toHaveBeenCalled();
    expect(vp.requests).toEqual([MANIFEST_URL]);
  });

  it("refuses a session set that differs from the graph's challengers before any session request", async () => {
    const vp = fakeVp({ [CHALLENGER_PUBKEY]: A, [CHALLENGER_PUBKEY_2]: B });
    const { target } = fakeSaveTarget();

    await expect(
      downloadRecoveryKit(source(vp), IDENTITY, target),
    ).rejects.toBeInstanceOf(VpResponseValidationError);
    expect(target.open).not.toHaveBeenCalled();
    expect(vp.requests).toEqual([MANIFEST_URL]);
  });

  it("refuses an archive larger than the target before any session request", async () => {
    const vp = fakeVp({ [CHALLENGER_PUBKEY]: A });
    const { target } = fakeSaveTarget({
      method: "browser-download",
      maxBytes: SESSION_BYTES,
    });

    await expect(
      downloadRecoveryKit(source(vp), IDENTITY, target),
    ).rejects.toBeInstanceOf(ArtifactDownloadTooLargeError);
    expect(target.open).not.toHaveBeenCalled();
    expect(vp.requests).toEqual([MANIFEST_URL]);
  });

  it("accepts an archive exactly at the cap", async () => {
    const vp = fakeVp({ [CHALLENGER_PUBKEY]: A });
    const { target, commit } = fakeSaveTarget({
      method: "browser-download",
      maxBytes: ONE_TOTAL,
    });

    await downloadRecoveryKit(source(vp), IDENTITY, target);

    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("refuses an archive one byte over the cap", async () => {
    const vp = fakeVp({ [CHALLENGER_PUBKEY]: A });
    const { target } = fakeSaveTarget({
      method: "browser-download",
      maxBytes: ONE_TOTAL - 1,
    });

    await expect(
      downloadRecoveryKit(source(vp), IDENTITY, target),
    ).rejects.toBeInstanceOf(ArtifactDownloadTooLargeError);
    expect(target.open).not.toHaveBeenCalled();
  });

  it("never writes a session whose bytes do not match the ETag, and discards", async () => {
    const corrupt = A.slice();
    corrupt[corrupt.length - 1] ^= 0xff;
    const vp = fakeVp({ [CHALLENGER_PUBKEY]: A }, txGraphJson(), {
      onSession: () => sessionResponse(corrupt, etagOf(A)),
    });
    const { target, write, commit, discard } = fakeSaveTarget();

    await expect(
      downloadRecoveryKit(source(vp), IDENTITY, target),
    ).rejects.toBeInstanceOf(VpResponseValidationError);
    expect(write).not.toHaveBeenCalled();
    expect(discard).toHaveBeenCalledTimes(1);
    expect(commit).not.toHaveBeenCalled();
  });

  it("requests session N+1 only after session N is written", async () => {
    const vp = fakeVp(
      { [CHALLENGER_PUBKEY_2]: B, [CHALLENGER_PUBKEY]: A },
      txGraphJson(TWO),
    );
    const { target, write } = fakeSaveTarget();
    let release!: () => void;
    const firstWrite = new Promise<void>((resolve) => (release = resolve));
    let firstWriteStarted = false;
    const recorded = write.getMockImplementation()!;
    write.mockImplementationOnce(async (chunk) => {
      firstWriteStarted = true;
      await firstWrite;
      await recorded(chunk);
    });

    const pending = downloadRecoveryKit(source(vp), IDENTITY_TWO, target);
    await vi.waitFor(() => expect(firstWriteStarted).toBe(true));
    expect(vp.requests).toEqual([MANIFEST_URL, sessionUrl(CHALLENGER_PUBKEY)]);

    release();
    await pending;
    expect(vp.requests).toEqual([
      MANIFEST_URL,
      sessionUrl(CHALLENGER_PUBKEY),
      sessionUrl(CHALLENGER_PUBKEY_2),
    ]);
  });

  it("rejects with the cancel sentinel when cancelled during the manifest fetch", async () => {
    const vp = fakeVp({ [CHALLENGER_PUBKEY]: A });
    const { target, discard } = fakeSaveTarget();

    await expect(
      downloadRecoveryKit(source(vp), IDENTITY, target, {
        isCancelled: () => true,
      }),
    ).rejects.toBeInstanceOf(ArtifactDownloadCancelledError);
    expect(target.open).not.toHaveBeenCalled();
    expect(discard).not.toHaveBeenCalled();
    expect(vp.requests).toEqual([MANIFEST_URL]);
  });

  it("discards and aborts the session fetch when cancelled during a session read", async () => {
    const vp = fakeVp({ [CHALLENGER_PUBKEY]: A }, txGraphJson(), {
      onSession: (_pk, init) => pacedSessionResponse(A, init.signal),
    });
    const { target, write, commit, discard } = fakeSaveTarget();
    let cancelled = false;

    await expect(
      downloadRecoveryKit(source(vp), IDENTITY, target, {
        isCancelled: () => cancelled,
        onProgress: (received) => {
          if (received > 0) cancelled = true;
        },
      }),
    ).rejects.toBeInstanceOf(ArtifactDownloadCancelledError);
    expect(vp.signals.at(-1)!.aborted).toBe(true);
    expect(write).not.toHaveBeenCalled();
    expect(discard).toHaveBeenCalledTimes(1);
    expect(commit).not.toHaveBeenCalled();
  });

  it("discards when cancelled after a session is verified, before its header is written", async () => {
    const vp = fakeVp({ [CHALLENGER_PUBKEY]: A });
    const { target, write, commit, discard } = fakeSaveTarget();
    let cancelled = false;

    await expect(
      downloadRecoveryKit(source(vp), IDENTITY, target, {
        isCancelled: () => cancelled,
        onProgress: (received) => {
          if (received >= A.byteLength) cancelled = true;
        },
      }),
    ).rejects.toBeInstanceOf(ArtifactDownloadCancelledError);
    expect(write).not.toHaveBeenCalled();
    expect(discard).toHaveBeenCalledTimes(1);
    expect(commit).not.toHaveBeenCalled();
  });

  it("discards when cancelled after the last session, before the claim header", async () => {
    const vp = fakeVp({ [CHALLENGER_PUBKEY]: A });
    const { target, write, commit, discard, writtenBytes } = fakeSaveTarget();
    let cancelled = false;
    const recorded = write.getMockImplementation()!;
    write.mockImplementation(async (chunk) => {
      await recorded(chunk);
      if (writtenBytes() >= tarEntryBytes(A.byteLength)) cancelled = true;
    });

    await expect(
      downloadRecoveryKit(source(vp), IDENTITY, target, {
        isCancelled: () => cancelled,
      }),
    ).rejects.toBeInstanceOf(ArtifactDownloadCancelledError);
    // The session entry is complete; the claim header never reached the sink.
    expect(writtenBytes()).toBe(tarEntryBytes(A.byteLength));
    expect(discard).toHaveBeenCalledTimes(1);
    expect(commit).not.toHaveBeenCalled();
  });

  it("discards when cancelled during the claim write", async () => {
    const vp = fakeVp({ [CHALLENGER_PUBKEY]: A });
    const { target, write, commit, discard, writtenBytes } = fakeSaveTarget();
    const claimLength = claimLengthFor(IDENTITY, txGraphJson(), [
      [CHALLENGER_PUBKEY, A.byteLength],
    ]);
    const claimEnd = tarEntryBytes(A.byteLength) + 512 + claimLength;
    let cancelled = false;
    const recorded = write.getMockImplementation()!;
    write.mockImplementation(async (chunk) => {
      await recorded(chunk);
      if (writtenBytes() >= claimEnd) cancelled = true;
    });

    await expect(
      downloadRecoveryKit(source(vp), IDENTITY, target, {
        isCancelled: () => cancelled,
      }),
    ).rejects.toBeInstanceOf(ArtifactDownloadCancelledError);
    // The claim body reached the sink; its padding and the trailer never did.
    expect(writtenBytes()).toBe(claimEnd);
    expect(writtenBytes()).toBeLessThan(ONE_TOTAL);
    expect(discard).toHaveBeenCalledTimes(1);
    expect(commit).not.toHaveBeenCalled();
  });

  it("discards when cancelled immediately before commit", async () => {
    const vp = fakeVp({ [CHALLENGER_PUBKEY]: A });
    const { target, write, commit, discard, writtenBytes } = fakeSaveTarget();
    let cancelled = false;
    const recorded = write.getMockImplementation()!;
    write.mockImplementation(async (chunk) => {
      await recorded(chunk);
      if (writtenBytes() === ONE_TOTAL) cancelled = true;
    });

    await expect(
      downloadRecoveryKit(source(vp), IDENTITY, target, {
        isCancelled: () => cancelled,
      }),
    ).rejects.toBeInstanceOf(ArtifactDownloadCancelledError);
    expect(writtenBytes()).toBe(ONE_TOTAL);
    expect(commit).not.toHaveBeenCalled();
    expect(discard).toHaveBeenCalledTimes(1);
  });

  it("cancels the in-flight session fetch when the caller's signal aborts", async () => {
    const controller = new AbortController();
    const vp = fakeVp({ [CHALLENGER_PUBKEY]: A }, txGraphJson(), {
      onSession: (_pk, init) => pacedSessionResponse(A, init.signal),
    });
    const { target, commit, discard } = fakeSaveTarget();

    await expect(
      downloadRecoveryKit(source(vp), IDENTITY, target, {
        signal: controller.signal,
        onProgress: (received) => {
          if (received > 0) controller.abort();
        },
      }),
    ).rejects.toBeInstanceOf(ArtifactDownloadCancelledError);
    expect(vp.signals.at(-1)!.aborted).toBe(true);
    expect(discard).toHaveBeenCalledTimes(1);
    expect(commit).not.toHaveBeenCalled();
  });

  it("does not request any session when target.open fails", async () => {
    const vp = fakeVp({ [CHALLENGER_PUBKEY]: A });
    const { target, discard } = fakeSaveTarget();
    const openError = new ArtifactFileAccessError("denied");
    vi.mocked(target.open).mockRejectedValueOnce(openError);

    await expect(
      downloadRecoveryKit(source(vp), IDENTITY, target),
    ).rejects.toBe(openError);
    expect(discard).not.toHaveBeenCalled();
    expect(vp.requests).toEqual([MANIFEST_URL]);
  });

  it("discards and rethrows when a sink write fails", async () => {
    const vp = fakeVp({ [CHALLENGER_PUBKEY]: A });
    const { target, write, commit, discard } = fakeSaveTarget();
    const writeError = new ArtifactFileAccessError("disk full", {
      cause: new Error("ENOSPC"),
    });
    write.mockRejectedValueOnce(writeError);

    await expect(
      downloadRecoveryKit(source(vp), IDENTITY, target),
    ).rejects.toBe(writeError);
    expect(commit).not.toHaveBeenCalled();
    expect(discard).toHaveBeenCalledTimes(1);
  });

  it("discards and rethrows when commit fails", async () => {
    // A rejected close leaves the transaction open, so its temporary file
    // would otherwise linger until the browser reclaims it.
    const vp = fakeVp({ [CHALLENGER_PUBKEY]: A });
    const { target, commit, discard } = fakeSaveTarget();
    commit.mockRejectedValueOnce(
      new ArtifactFileAccessError("close failed", { cause: new Error("EIO") }),
    );

    await expect(
      downloadRecoveryKit(source(vp), IDENTITY, target),
    ).rejects.toBeInstanceOf(ArtifactFileAccessError);
    expect(discard).toHaveBeenCalledTimes(1);
  });

  it("keeps the original error when discard also fails", async () => {
    const vp = fakeVp({ [CHALLENGER_PUBKEY]: A });
    const { target, write, discard } = fakeSaveTarget();
    const writeError = new ArtifactFileAccessError("disk full");
    write.mockRejectedValueOnce(writeError);
    discard.mockRejectedValueOnce(new Error("abort failed"));

    await expect(
      downloadRecoveryKit(source(vp), IDENTITY, target),
    ).rejects.toBe(writeError);
  });

  it("discards on a mid-kit auth rejection and restarts cleanly with the same target", async () => {
    let rejectOnce = true;
    const vp = fakeVp(
      { [CHALLENGER_PUBKEY_2]: B, [CHALLENGER_PUBKEY]: A },
      txGraphJson(TWO),
      {
        onSession: (pk) => {
          if (pk !== CHALLENGER_PUBKEY_2 || !rejectOnce) return undefined;
          rejectOnce = false;
          return new Response(null, { status: 401 });
        },
      },
    );
    const { target, commit, discard, written } = fakeSaveTarget();

    const err = await downloadRecoveryKit(
      source(vp),
      IDENTITY_TWO,
      target,
    ).catch((e: unknown) => e);
    expect(isAuthRejectedError(err)).toBe(true);
    expect(discard).toHaveBeenCalledTimes(1);
    expect(commit).not.toHaveBeenCalled();

    written.length = 0;
    const outcome = await downloadRecoveryKit(source(vp), IDENTITY_TWO, target);
    expect(target.open).toHaveBeenCalledTimes(2);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(Object.keys(outcome.sessions).sort()).toEqual([
      CHALLENGER_PUBKEY,
      CHALLENGER_PUBKEY_2,
    ]);
  });
});

describe("fetchAndDownloadArtifacts", () => {
  const PROXY_BASE = `https://proxy.example.com/artifacts/${PROVIDER_ADDRESS}`;

  beforeEach(() => {
    (vpTokenRegistry as VpTokenRegistry).clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    (vpTokenRegistry as VpTokenRegistry).clear();
  });

  it("rejects a bearer bound to another provider before sending the request", async () => {
    seedArtifactToken(OTHER_PROVIDER_ADDRESS);
    const vp = fakeVp({ [CHALLENGER_PUBKEY]: A }, txGraphJson(), {
      base: PROXY_BASE,
    });
    vi.stubGlobal("fetch", vp.fetchImpl);
    const { target } = fakeSaveTarget();

    await expect(fetchAndDownloadArtifacts(IDENTITY, target)).rejects.toThrow(
      /already bound to providerAddress/,
    );
    expect(vp.requests).toEqual([]);
  });

  it("sends the registry's bearer to the provider's artifacts proxy URL", async () => {
    const peek = vi.spyOn(vpTokenRegistry, "peek").mockReturnValue({
      getJsonRpcToken: async () => "registry.bearer",
    } as unknown as ReturnType<typeof vpTokenRegistry.peek>);
    const vp = fakeVp({ [CHALLENGER_PUBKEY]: A }, txGraphJson(), {
      base: PROXY_BASE,
    });
    vi.stubGlobal("fetch", vp.fetchImpl);
    const { target, commit, savedBytes } = fakeSaveTarget();

    await fetchAndDownloadArtifacts(IDENTITY, target);

    expect(peek).toHaveBeenCalledWith({
      peginTxid: PEGIN_TXID,
      providerAddress: PROVIDER_ADDRESS,
      expectedAudienceXOnlyPubkey: DEPOSITOR_PK,
    });
    expect(vp.requests).toEqual([
      `${PROXY_BASE}/${PEGIN_TXID}/manifest`,
      `${PROXY_BASE}/${PEGIN_TXID}/sessions/${CHALLENGER_PUBKEY}`,
    ]);
    const fetchMock = vi.mocked(vp.fetchImpl);
    for (const [, init] of fetchMock.mock.calls) {
      expect((init?.headers as Record<string, string>).Authorization).toBe(
        "Bearer registry.bearer",
      );
    }
    expect(commit).toHaveBeenCalledTimes(1);
    expect(parseTar(savedBytes())[0]!.data).toEqual(A);
  });

  it("maps an aborted request to the sentinel", async () => {
    seedArtifactToken(PROVIDER_ADDRESS);
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValue(
          new DOMException("The operation was aborted.", "AbortError"),
        ),
    );
    const { target, commit } = fakeSaveTarget();

    await expect(
      fetchAndDownloadArtifacts(IDENTITY, target, {
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(ArtifactDownloadCancelledError);
    expect(commit).not.toHaveBeenCalled();
  });
});

describe("openArtifactSaveTarget", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function stubSecureContext(isSecure: boolean) {
    Object.defineProperty(window, "isSecureContext", {
      value: isSecure,
      configurable: true,
    });
  }

  it("returns a streaming target that offers a .tar file", async () => {
    stubSecureContext(true);
    const writable = { write: vi.fn(), close: vi.fn(), abort: vi.fn() };
    const picker = vi.fn(async () => ({
      createWritable: vi.fn(async () => writable),
    }));
    vi.stubGlobal("showSaveFilePicker", picker);

    const target = await openArtifactSaveTarget(`0x${PEGIN_TXID}`);

    expect(target.method).toBe("file-system-access");
    expect(target.filename).toBe("babylon-vault-aaaaaaaa.tar");
    expect(target.maxBytes).toBe(Number.POSITIVE_INFINITY);
    const options = (picker.mock.calls[0] as unknown[])[0] as {
      suggestedName: string;
      types: { accept: Record<string, string[]> }[];
    };
    expect(options.suggestedName).toBe("babylon-vault-aaaaaaaa.tar");
    expect(options.types[0]!.accept).toEqual({ "application/x-tar": [".tar"] });
  });

  it("maps a dismissed picker to the cancellation sentinel", async () => {
    stubSecureContext(true);
    vi.stubGlobal(
      "showSaveFilePicker",
      vi.fn(async () => {
        throw new DOMException("The user aborted a request.", "AbortError");
      }),
    );

    await expect(openArtifactSaveTarget(PEGIN_TXID)).rejects.toBeInstanceOf(
      ArtifactDownloadCancelledError,
    );
  });

  it("maps a denied picker to a file-access error", async () => {
    stubSecureContext(true);
    vi.stubGlobal(
      "showSaveFilePicker",
      vi.fn(async () => {
        throw new DOMException("Permission denied.", "NotAllowedError");
      }),
    );

    await expect(openArtifactSaveTarget(PEGIN_TXID)).rejects.toBeInstanceOf(
      ArtifactFileAccessError,
    );
  });

  it("falls back to an anchor download of a .tar blob with a size ceiling when unsupported", async () => {
    stubSecureContext(true);
    vi.stubGlobal("showSaveFilePicker", undefined);
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:kit");
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = vi.fn();
    try {
      const target = await openArtifactSaveTarget(PEGIN_TXID);

      expect(target.method).toBe("browser-download");
      expect(target.filename).toBe("babylon-vault-aaaaaaaa.tar");
      // Bounded, but above a real kit (≈707 MB for 8 challengers).
      expect(target.maxBytes).toBeGreaterThan(707_000_000);
      expect(target.maxBytes).toBeLessThan(Number.POSITIVE_INFINITY);

      const stream = await target.open();
      await stream.write(new Uint8Array(512));
      await stream.commit();
      expect(createObjectURL.mock.calls[0]![0].type).toBe("application/x-tar");
    } finally {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });

  it("falls back when the page is not a secure context", async () => {
    stubSecureContext(false);
    vi.stubGlobal(
      "showSaveFilePicker",
      vi.fn(async () => ({ createWritable: vi.fn() })),
    );

    const target = await openArtifactSaveTarget(PEGIN_TXID);

    expect(target.method).toBe("browser-download");
  });
});
