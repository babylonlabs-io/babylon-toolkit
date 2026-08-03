import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ARTIFACT_RECEIPT_VERSION,
  type ArtifactDownloadReceipt,
  clearArtifactDownloadReceipts,
  hasArtifactsDownloaded,
  saveArtifactDownloadReceipt,
} from "../artifactDownloadStorage";

const VAULT_ID = "0xABC123";
const PEGIN_TXID = "ab".repeat(32);
const OTHER_PEGIN_TXID = "cd".repeat(32);
const STORAGE_KEY = `tbv:artifacts-downloaded:${VAULT_ID.toLowerCase()}`;

function receipt(
  overrides: Partial<ArtifactDownloadReceipt> = {},
): ArtifactDownloadReceipt {
  return {
    version: ARTIFACT_RECEIPT_VERSION,
    peginTxid: PEGIN_TXID,
    filename: "babylon-vault-artifacts-abababab.json",
    byteLength: 1_048_576,
    sha256: "9".repeat(64),
    savedAt: 1_700_000_000_000,
    method: "file-system-access",
    ...overrides,
  };
}

describe("artifactDownloadStorage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports not-downloaded when no receipt has been stored", () => {
    expect(hasArtifactsDownloaded(VAULT_ID, PEGIN_TXID)).toBe(false);
  });

  it("reports downloaded for the pegin the receipt was written for", () => {
    saveArtifactDownloadReceipt(VAULT_ID, receipt());
    expect(hasArtifactsDownloaded(VAULT_ID, PEGIN_TXID)).toBe(true);
  });

  it("reports not-downloaded for a different pegin on the same vault", () => {
    saveArtifactDownloadReceipt(VAULT_ID, receipt());
    expect(hasArtifactsDownloaded(VAULT_ID, OTHER_PEGIN_TXID)).toBe(false);
  });

  it("matches a pegin txid regardless of 0x prefix and casing", () => {
    saveArtifactDownloadReceipt(VAULT_ID, receipt());
    expect(
      hasArtifactsDownloaded(VAULT_ID, `0x${PEGIN_TXID.toUpperCase()}`),
    ).toBe(true);
  });

  it("reports not-downloaded when no pegin txid is supplied", () => {
    saveArtifactDownloadReceipt(VAULT_ID, receipt());
    expect(hasArtifactsDownloaded(VAULT_ID, "")).toBe(false);
  });

  it("treats vaultId case-insensitively", () => {
    saveArtifactDownloadReceipt("0xABC123", receipt());
    expect(hasArtifactsDownloaded("0xabc123", PEGIN_TXID)).toBe(true);
  });

  it("scopes receipts per vaultId", () => {
    saveArtifactDownloadReceipt("0xaaa", receipt());
    expect(hasArtifactsDownloaded("0xbbb", PEGIN_TXID)).toBe(false);
  });

  it("ignores an empty vaultId", () => {
    saveArtifactDownloadReceipt("", receipt());
    expect(hasArtifactsDownloaded("", PEGIN_TXID)).toBe(false);
  });

  it('rejects the legacy bare "true" flag and clears it', () => {
    // JSON.parse("true") returns a boolean rather than throwing, so this is
    // the case a naive parse-and-trust would silently keep honoring.
    window.localStorage.setItem(STORAGE_KEY, "true");

    expect(hasArtifactsDownloaded(VAULT_ID, PEGIN_TXID)).toBe(false);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("rejects a corrupt record and clears it", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not json");

    expect(hasArtifactsDownloaded(VAULT_ID, PEGIN_TXID)).toBe(false);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("rejects a receipt written by a different schema version", () => {
    saveArtifactDownloadReceipt(
      VAULT_ID,
      receipt({ version: ARTIFACT_RECEIPT_VERSION + 1 }),
    );
    expect(hasArtifactsDownloaded(VAULT_ID, PEGIN_TXID)).toBe(false);
  });

  it("rejects a receipt whose digest is not a 64-character hex string", () => {
    saveArtifactDownloadReceipt(VAULT_ID, receipt({ sha256: "abc" }));
    expect(hasArtifactsDownloaded(VAULT_ID, PEGIN_TXID)).toBe(false);
  });

  it("rejects a receipt with a zero byte length", () => {
    saveArtifactDownloadReceipt(VAULT_ID, receipt({ byteLength: 0 }));
    expect(hasArtifactsDownloaded(VAULT_ID, PEGIN_TXID)).toBe(false);
  });

  it("rejects a receipt with an unrecognized save method", () => {
    saveArtifactDownloadReceipt(
      VAULT_ID,
      receipt({ method: "carrier-pigeon" as never }),
    );
    expect(hasArtifactsDownloaded(VAULT_ID, PEGIN_TXID)).toBe(false);
  });

  it("accepts a receipt written via the browser-download fallback", () => {
    saveArtifactDownloadReceipt(
      VAULT_ID,
      receipt({ method: "browser-download" }),
    );
    expect(hasArtifactsDownloaded(VAULT_ID, PEGIN_TXID)).toBe(true);
  });

  it("clears every stored receipt and leaves unrelated keys alone", () => {
    saveArtifactDownloadReceipt(VAULT_ID, receipt());
    saveArtifactDownloadReceipt("0xotherVault", receipt());
    window.localStorage.setItem("unrelated:key", "keep me");

    expect(clearArtifactDownloadReceipts()).toBe(2);
    expect(hasArtifactsDownloaded(VAULT_ID, PEGIN_TXID)).toBe(false);
    expect(hasArtifactsDownloaded("0xotherVault", PEGIN_TXID)).toBe(false);
    expect(window.localStorage.getItem("unrelated:key")).toBe("keep me");
  });

  it("does not throw when localStorage.setItem fails (quota / private mode)", () => {
    vi.spyOn(window.localStorage.__proto__, "setItem").mockImplementation(
      () => {
        throw new Error("QuotaExceededError");
      },
    );
    expect(() =>
      saveArtifactDownloadReceipt(VAULT_ID, receipt()),
    ).not.toThrow();
    expect(hasArtifactsDownloaded(VAULT_ID, PEGIN_TXID)).toBe(false);
  });

  it("does not throw when localStorage.getItem fails", () => {
    vi.spyOn(window.localStorage.__proto__, "getItem").mockImplementation(
      () => {
        throw new Error("SecurityError");
      },
    );
    expect(hasArtifactsDownloaded(VAULT_ID, PEGIN_TXID)).toBe(false);
  });
});
