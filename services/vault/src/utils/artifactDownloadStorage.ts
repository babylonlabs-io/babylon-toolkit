const ARTIFACTS_DOWNLOADED_KEY_PREFIX = "tbv:artifacts-downloaded:";

function isBrowserStorageAvailable(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

function storageKey(vaultId: string): string {
  return `${ARTIFACTS_DOWNLOADED_KEY_PREFIX}${vaultId.toLowerCase()}`;
}

export function hasArtifactsDownloaded(vaultId: string): boolean {
  if (!isBrowserStorageAvailable() || !vaultId) return false;
  try {
    return window.localStorage.getItem(storageKey(vaultId)) === "true";
  } catch {
    return false;
  }
}

export function markArtifactsDownloaded(vaultId: string): void {
  if (!isBrowserStorageAvailable() || !vaultId) return;
  try {
    window.localStorage.setItem(storageKey(vaultId), "true");
  } catch {
    // Quota exceeded or private browsing — fall through; the gate will
    // simply continue to warn the user, which is the safe default.
  }
}
