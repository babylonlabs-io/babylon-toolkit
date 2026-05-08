import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  hasArtifactsDownloaded,
  markArtifactsDownloaded,
} from "../artifactDownloadStorage";

const VAULT_ID = "0xABC123";

describe("artifactDownloadStorage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns false when nothing has been marked", () => {
    expect(hasArtifactsDownloaded(VAULT_ID)).toBe(false);
  });

  it("returns true after marking", () => {
    markArtifactsDownloaded(VAULT_ID);
    expect(hasArtifactsDownloaded(VAULT_ID)).toBe(true);
  });

  it("treats vaultId case-insensitively", () => {
    markArtifactsDownloaded("0xABC123");
    expect(hasArtifactsDownloaded("0xabc123")).toBe(true);
    expect(hasArtifactsDownloaded("0xABC123")).toBe(true);
  });

  it("scopes the flag per vaultId", () => {
    markArtifactsDownloaded("0xaaa");
    expect(hasArtifactsDownloaded("0xbbb")).toBe(false);
  });

  it("returns false for an empty vaultId", () => {
    markArtifactsDownloaded("");
    expect(hasArtifactsDownloaded("")).toBe(false);
  });

  it("does not throw when localStorage.setItem fails (quota / private mode)", () => {
    vi.spyOn(window.localStorage.__proto__, "setItem").mockImplementation(
      () => {
        throw new Error("QuotaExceededError");
      },
    );
    expect(() => markArtifactsDownloaded(VAULT_ID)).not.toThrow();
    expect(hasArtifactsDownloaded(VAULT_ID)).toBe(false);
  });

  it("does not throw when localStorage.getItem fails", () => {
    vi.spyOn(window.localStorage.__proto__, "getItem").mockImplementation(
      () => {
        throw new Error("SecurityError");
      },
    );
    expect(hasArtifactsDownloaded(VAULT_ID)).toBe(false);
  });
});
