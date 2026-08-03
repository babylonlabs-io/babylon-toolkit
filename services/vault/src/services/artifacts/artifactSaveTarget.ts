/**
 * Where a downloaded artifact bundle is written.
 *
 * Two implementations, chosen by browser capability:
 *
 * - **File System Access** (Chromium): the user picks a location up front and
 *   bytes stream straight to disk. `createWritable()` writes to a swap file
 *   that only replaces the target on `close()`, so aborting a failed download
 *   leaves nothing behind. This is the only path that can tell a completed
 *   save from a cancelled one, and the only one that avoids holding the whole
 *   ~1.3 GB bundle in memory.
 * - **Anchor download** (everything else): the historical behavior — buffer
 *   the body, hand the browser a Blob, click a synthetic link. The browser
 *   gives no save/cancel signal here, so the caller must fall back to user
 *   attestation, and a size ceiling applies because the body must fit in
 *   memory.
 *
 * The split between *target* (one picker prompt, one permission grant) and
 * *stream* (one writable per attempt) exists so the download hook's auth-retry
 * loop can restart a transfer without re-prompting: `createWritable()` needs
 * no user activation, unlike `showSaveFilePicker()`.
 */

import { stripHexPrefix } from "@babylonlabs-io/ts-sdk/tbv/core";

import { COPY } from "@/copy";

import {
  ArtifactDownloadCancelledError,
  ArtifactFileAccessError,
} from "./errors";

/** MIME type for the assembled artifact file (the payload is JSON). */
const ARTIFACT_BLOB_TYPE = "application/json";

/** Characters of the pegin txid used to disambiguate the filename. */
const FILENAME_TXID_PREFIX_CHARS = 8;

/**
 * Identifier Chrome uses to remember the last directory chosen for artifact
 * saves, so a user with several vaults is not re-navigated every time.
 */
const ARTIFACT_PICKER_ID = "babylon-vault-artifacts";

/**
 * Ceiling for the in-memory fallback path.
 *
 * This path has to hold the whole body before it can hand the browser a Blob,
 * so it needs a bound — but the bound has to sit *above* a real bundle or the
 * path is guaranteed to fail after wasting the user's bandwidth. A measured
 * vault-devnet body is 1,410,824,702 bytes, so 2 GiB leaves headroom while
 * still refusing an implausible response outright.
 *
 * This is best-effort, not reliable: the chunk array and the resulting Blob
 * can both be resident, so a full-size bundle may still exhaust memory on a
 * constrained machine. Callers warn before starting. The durable fix is a
 * streaming sink that works outside Chromium — see the OPFS follow-up.
 */
const FALLBACK_MAX_BODY_BYTES = 2 * 1024 * 1024 * 1024;

export type ArtifactSaveMethod = "file-system-access" | "browser-download";

/**
 * A destination the caller may write to. `open()` may be called more than
 * once — each call starts a fresh, empty write attempt.
 */
export interface ArtifactSaveTarget {
  readonly method: ArtifactSaveMethod;
  readonly filename: string;
  /** Largest body this target can accept; Infinity when it streams to disk. */
  readonly maxBytes: number;
  open(): Promise<ArtifactSaveStream>;
}

export interface ArtifactSaveStream {
  // Pinned to a non-shared ArrayBuffer because the File System Access write
  // API does not accept views over a SharedArrayBuffer.
  write(chunk: Uint8Array<ArrayBuffer>): Promise<void>;
  /** Durably persist what was written. Resolves only once the save is done. */
  commit(): Promise<void>;
  /** Abandon the attempt, leaving no partial file behind. */
  discard(): Promise<void>;
}

interface SaveFilePickerOptions {
  suggestedName?: string;
  id?: string;
  startIn?: "downloads";
  types?: { description: string; accept: Record<string, string[]> }[];
}

type ShowSaveFilePicker = (
  options?: SaveFilePickerOptions,
) => Promise<FileSystemFileHandle>;

/**
 * `showSaveFilePicker` is not in TypeScript's DOM lib, so it is resolved
 * dynamically rather than declared globally.
 */
function getShowSaveFilePicker(): ShowSaveFilePicker | null {
  if (typeof window === "undefined" || !window.isSecureContext) return null;
  const picker = (window as unknown as { showSaveFilePicker?: unknown })
    .showSaveFilePicker;
  return typeof picker === "function" ? (picker as ShowSaveFilePicker) : null;
}

/**
 * True when the browser can stream the bundle straight to a user-chosen file.
 * Callers use this to warn about the fallback path's limitations *before* a
 * multi-minute download starts.
 */
export function isFileSystemAccessSupported(): boolean {
  return getShowSaveFilePicker() !== null;
}

function artifactFilename(peginTxid: string): string {
  const shortId = stripHexPrefix(peginTxid).slice(
    0,
    FILENAME_TXID_PREFIX_CHARS,
  );
  return `babylon-vault-artifacts-${shortId}.json`;
}

/**
 * Resolve where this download will be saved.
 *
 * IMPORTANT: on the File System Access path this shows the browser's save
 * dialog, which requires transient user activation. It must therefore be
 * called before any `await` in the click handler that triggers the download.
 */
export async function openArtifactSaveTarget(
  peginTxid: string,
): Promise<ArtifactSaveTarget> {
  const filename = artifactFilename(peginTxid);
  const showSaveFilePicker = getShowSaveFilePicker();

  if (!showSaveFilePicker) {
    return new BrowserDownloadTarget(filename);
  }

  let handle: FileSystemFileHandle;
  try {
    handle = await showSaveFilePicker({
      suggestedName: filename,
      id: ARTIFACT_PICKER_ID,
      startIn: "downloads",
      types: [
        {
          description: COPY.deposit.recoveryArtifacts.savePickerDescription,
          accept: { [ARTIFACT_BLOB_TYPE]: [".json"] },
        },
      ],
    });
  } catch (err) {
    // Dismissing the dialog is a user action, not a failure.
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ArtifactDownloadCancelledError();
    }
    throw new ArtifactFileAccessError(
      COPY.deposit.recoveryArtifacts.fileAccessDenied,
      { cause: err },
    );
  }

  return new FileSystemAccessTarget(handle, filename);
}

class FileSystemAccessTarget implements ArtifactSaveTarget {
  readonly method = "file-system-access" as const;
  /** Bytes never accumulate in memory, so there is nothing to cap. */
  readonly maxBytes = Number.POSITIVE_INFINITY;

  constructor(
    private readonly handle: FileSystemFileHandle,
    readonly filename: string,
  ) {}

  async open(): Promise<ArtifactSaveStream> {
    try {
      // keepExistingData: false so a retry overwrites rather than patching
      // the previous attempt's bytes.
      const writable = await this.handle.createWritable({
        keepExistingData: false,
      });
      return new FileSystemAccessStream(writable);
    } catch (err) {
      throw new ArtifactFileAccessError(
        COPY.deposit.recoveryArtifacts.fileAccessDenied,
        { cause: err },
      );
    }
  }
}

class FileSystemAccessStream implements ArtifactSaveStream {
  constructor(private readonly writable: FileSystemWritableFileStream) {}

  async write(chunk: Uint8Array<ArrayBuffer>): Promise<void> {
    try {
      // Awaited so disk I/O backpressures the network reader instead of
      // letting chunks pile up in memory.
      await this.writable.write(chunk);
    } catch (err) {
      throw new ArtifactFileAccessError(
        COPY.deposit.recoveryArtifacts.fileAccessDenied,
        { cause: err },
      );
    }
  }

  async commit(): Promise<void> {
    try {
      // Atomically swaps the temporary file into the user's chosen path.
      await this.writable.close();
    } catch (err) {
      throw new ArtifactFileAccessError(
        COPY.deposit.recoveryArtifacts.fileAccessDenied,
        { cause: err },
      );
    }
  }

  async discard(): Promise<void> {
    // Discards the swap file; the user's chosen path is left untouched.
    await this.writable.abort();
  }
}

class BrowserDownloadTarget implements ArtifactSaveTarget {
  readonly method = "browser-download" as const;
  readonly maxBytes = FALLBACK_MAX_BODY_BYTES;

  constructor(readonly filename: string) {}

  async open(): Promise<ArtifactSaveStream> {
    return new BrowserDownloadStream(this.filename);
  }
}

class BrowserDownloadStream implements ArtifactSaveStream {
  private chunks: Uint8Array<ArrayBuffer>[] | null = [];

  constructor(private readonly filename: string) {}

  async write(chunk: Uint8Array<ArrayBuffer>): Promise<void> {
    this.chunks?.push(chunk);
  }

  async commit(): Promise<void> {
    if (!this.chunks) {
      throw new ArtifactFileAccessError(
        COPY.deposit.recoveryArtifacts.fileAccessDenied,
      );
    }
    // The Blob is built from the chunk array directly so no second full-size
    // contiguous copy is allocated alongside it.
    const blob = new Blob(this.chunks as BlobPart[], {
      type: ARTIFACT_BLOB_TYPE,
    });
    this.chunks = null;

    const url = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = this.filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async discard(): Promise<void> {
    // Nothing was handed to the browser yet, so dropping the buffer is enough.
    this.chunks = null;
  }
}
