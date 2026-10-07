/**
 * Opens an external URL in a new tab, or in the same tab on touch-first
 * devices, where wallet in-app browsers have no tabs.
 */
export function openExternalUrl(url: string, touchFirst: boolean): void {
  if (touchFirst) {
    window.location.assign(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
